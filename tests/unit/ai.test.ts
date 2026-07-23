import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiornaStore } from "@/core/store";
import { applyAiPlan, undoAiChangeSet } from "@/modules/ai/executor";
import {
  buildAiPayload,
  parseAiPlan,
  requestAiPlan,
  resolveMentionedNotes,
} from "@/modules/ai/planner";
import { aiPlanSchema, type AiPlan } from "@/modules/ai/types";

const fullPlan: AiPlan = {
  version: 1,
  summary: "Create a kernel note, business map, football event, and stretching habit.",
  assumptions: ["Football lasts one hour."],
  operations: [
    {
      id: "kernel-note",
      type: "create_note",
      title: "Kernel process",
      bodyMarkdown: "# Kernel process\n\nA kernel schedules processes and protects resources.",
      tags: ["systems"],
    },
    {
      id: "business-map",
      type: "create_map",
      name: "Adaptogenic coffee business",
      nodes: [
        {
          id: "root",
          kind: "text",
          title: "Adaptogenic mushroom coffee",
          locked: true,
        },
        {
          id: "research",
          kind: "note",
          title: "Kernel research",
          noteOperationId: "kernel-note",
          locked: false,
        },
        {
          id: "customer",
          kind: "note",
          title: "Customer archetype",
          body: "Health-conscious professionals who want a coffee ritual.",
          locked: false,
        },
      ],
      edges: [
        { from: "root", to: "research", label: "informed by" },
        { from: "root", to: "customer", label: "audience" },
      ],
    },
    {
      id: "football",
      type: "create_calendar_item",
      kind: "event",
      title: "Football",
      description: "",
      startAt: "2026-07-23T19:00:00+02:00",
      endAt: "2026-07-23T20:00:00+02:00",
      allDay: false,
      category: "",
      priority: "none",
    },
    {
      id: "stretch",
      type: "create_habit",
      name: "Stretch",
      description: "Track the minutes completed.",
      category: "",
      tracking: "quantity",
      unit: "minutes",
      target: 20,
      activeWeekdays: [1, 2, 3, 4, 5, 6],
    },
  ],
};

describe("Diorna AI planning and execution", () => {
  beforeEach(() => {
    useDiornaStore.getState().resetAll();
    vi.restoreAllMocks();
  });

  it("accepts the supported actions and rejects unsafe or inconsistent plans", () => {
    expect(aiPlanSchema.parse(fullPlan)).toEqual(fullPlan);
    expect(() =>
      aiPlanSchema.parse({
        ...fullPlan,
        operations: [
          {
            id: "map",
            type: "create_map",
            name: "Invalid map",
            nodes: [
              {
                id: "node",
                kind: "note",
                title: "Missing",
                noteOperationId: "not-created",
                locked: false,
              },
            ],
            edges: [],
          },
        ],
      }),
    ).toThrow(/Unknown note operation/);
    expect(() =>
      aiPlanSchema.parse({
        version: 1,
        summary: "Delete everything",
        assumptions: [],
        operations: [{ id: "bad", type: "delete_note", noteId: "all" }],
      }),
    ).toThrow();
  });

  it("rejects flat maps with isolated nodes or unlabeled relationships", () => {
    expect(() =>
      aiPlanSchema.parse({
        version: 1,
        summary: "A disconnected map.",
        assumptions: [],
        operations: [
          {
            id: "map",
            type: "create_map",
            name: "Business",
            nodes: [
              { id: "root", kind: "text", title: "Business", locked: true },
              { id: "offer", kind: "text", title: "Offer", locked: false },
            ],
            edges: [],
          },
        ],
      }),
    ).toThrow(/reachable from the central node/);
    expect(() =>
      aiPlanSchema.parse({
        version: 1,
        summary: "An unlabeled map.",
        assumptions: [],
        operations: [
          {
            id: "map",
            type: "create_map",
            name: "Business",
            nodes: [
              { id: "root", kind: "text", title: "Business", locked: true },
              { id: "offer", kind: "text", title: "Offer", locked: false },
            ],
            edges: [{ from: "root", to: "offer" }],
          },
        ],
      }),
    ).toThrow(/needs a relationship label/);
  });

  it("normalizes a plan or an operation list returned as a root array", () => {
    expect(parseAiPlan([fullPlan])).toEqual(fullPlan);
    expect(parseAiPlan(fullPlan.operations)).toMatchObject({
      version: 1,
      operations: fullPlan.operations,
      assumptions: ["The provider returned an operation list without plan metadata."],
    });
  });

  it("accepts map note operations regardless of their order in the plan", () => {
    const note = fullPlan.operations[0]!;
    const map = fullPlan.operations[1]!;
    expect(
      aiPlanSchema.parse({
        version: 1,
        summary: "Map first, generated note second.",
        assumptions: [],
        operations: [map, note],
      }),
    ).toMatchObject({ operations: [map, note] });
  });

  it("sends only explicitly mentioned notes from the active workspace", () => {
    const state = useDiornaStore.getState();
    const student = state.notes.find((note) => note.workspaceId === "workspace-student")!;
    const personal = state.notes.find((note) => note.workspaceId === "workspace-personal")!;
    const mentions = [
      { noteId: student.id, title: student.title },
      { noteId: personal.id, title: personal.title },
    ];
    const notes = resolveMentionedNotes(mentions, state.notes, "workspace-student");
    const payload = buildAiPayload({
      prompt: "Use the referenced note",
      workspaceName: "Student",
      now: "2026-07-23T12:00:00.000Z",
      timezone: "Europe/Brussels",
      mentions,
      notes,
    });

    expect(notes).toEqual([student]);
    expect(payload.referencedNotes).toEqual([
      expect.objectContaining({ id: student.id, title: student.title }),
    ]);
    expect(payload.referencedNotes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: personal.id })]),
    );
  });

  it("requests strict structured output from OpenRouter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(fullPlan) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestAiPlan(
        {
          endpoint: "https://openrouter.ai/api/v1",
          model: "moonshotai/kimi-k2.6",
          apiKey: "secret-test-key",
        },
        {
          prompt: "Create my plan",
          workspaceName: "Personal",
          now: "2026-07-23T12:00:00.000Z",
          timezone: "Europe/Brussels",
          mentions: [],
          notes: [],
        },
      ),
    ).resolves.toEqual(fullPlan);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret-test-key" });
    expect(body).toMatchObject({
      model: "moonshotai/kimi-k2.6",
      response_format: {
        type: "json_schema",
        json_schema: { strict: true },
      },
      provider: { require_parameters: true, data_collection: "deny" },
      plugins: [{ id: "response-healing" }],
    });
  });

  it("aborts a provider request after its configured usage timeout", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestAiPlan(
        {
          endpoint: "https://openrouter.ai/api/v1",
          model: "moonshotai/kimi-k2.6",
          apiKey: "secret-test-key",
          requestTimeoutMs: 10,
        },
        {
          prompt: "Create a plan that never returns",
          workspaceName: "Personal",
          now: "2026-07-23T12:00:00+02:00",
          timezone: "Europe/Brussels",
          mentions: [],
          notes: [],
        },
      ),
    ).rejects.toThrow(/stopped the generation.*limit usage.*Nothing was created/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("repairs a missing provider plan once and reports progress", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: null } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fullPlan) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const progress = vi.fn();

    await expect(
      requestAiPlan(
        {
          endpoint: "https://openrouter.ai/api/v1",
          model: "moonshotai/kimi-k2.6",
          apiKey: "secret-test-key",
        },
        {
          prompt: "Create a detailed business map",
          workspaceName: "Personal",
          now: "2026-07-23T12:00:00+02:00",
          timezone: "Europe/Brussels",
          mentions: [],
          notes: [],
        },
        undefined,
        progress,
      ),
    ).resolves.toEqual(fullPlan);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.flat()).toEqual([
      "requesting",
      "validating",
      "repairing",
      "revalidating",
    ]);
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(repairBody.messages.at(-1)?.content).toContain("Repair the previous answer");
  });

  it("safely converts repeated unknown generated note references into standalone map notes", async () => {
    const invalidPlan = {
      version: 1,
      summary: "Explore the business.",
      assumptions: [],
      operations: [
        {
          id: "business-map",
          type: "create_map",
          name: "Adaptogenic coffee",
          nodes: [
            {
              id: "root",
              kind: "text",
              title: "Adaptogenic coffee",
              body: null,
              noteOperationId: null,
              mentionedNoteId: null,
              locked: true,
            },
            ...Array.from({ length: 10 }, (_, index) => ({
              id: `branch-${index}`,
              kind: "note",
              title: `Business branch ${index}`,
              body: null,
              noteOperationId: `op_note_${index + 1}`,
              mentionedNoteId: null,
              locked: false,
            })),
          ],
          edges: Array.from({ length: 10 }, (_, index) => ({
            from: "root",
            to: `branch-${index}`,
            label: null,
          })),
        },
      ],
    };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: JSON.stringify(invalidPlan) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const repaired = await requestAiPlan(
      {
        endpoint: "https://openrouter.ai/api/v1",
        model: "moonshotai/kimi-k2.6",
        apiKey: "secret-test-key",
      },
      {
        prompt: "Create a detailed business map",
        workspaceName: "Personal",
        now: "2026-07-23T12:00:00+02:00",
        timezone: "Europe/Brussels",
        mentions: [],
        notes: [],
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const map = repaired.operations[0];
    expect(map?.type).toBe("create_map");
    if (map?.type !== "create_map") throw new Error("Expected a map operation");
    expect(map.nodes.slice(1).every((node) => !node.noteOperationId && node.body)).toBe(true);
    expect(repaired.assumptions).toContain(
      "Diorna repaired generated note references and connected isolated map branches to the central concept.",
    );
  });

  it("repairs an AI map that returns isolated notes into one centered connected graph", async () => {
    const flatPlan = {
      version: 1,
      summary: "Explore the business.",
      assumptions: [],
      operations: [
        {
          id: "business-map",
          type: "create_map",
          name: "Adaptogenic coffee",
          nodes: [
            {
              id: "root",
              kind: "text",
              title: "Adaptogenic coffee",
              body: null,
              noteOperationId: null,
              mentionedNoteId: null,
              locked: true,
            },
            {
              id: "positioning",
              kind: "note",
              title: "Positioning",
              body: "Find a defensible market twist.",
              noteOperationId: null,
              mentionedNoteId: null,
              locked: false,
            },
          ],
          edges: [],
        },
      ],
    };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: JSON.stringify(flatPlan) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const repaired = await requestAiPlan(
      {
        endpoint: "https://openrouter.ai/api/v1",
        model: "moonshotai/kimi-k2.6",
        apiKey: "secret-test-key",
      },
      {
        prompt: "Create a structured business map",
        workspaceName: "Personal",
        now: "2026-07-23T12:00:00+02:00",
        timezone: "Europe/Brussels",
        mentions: [],
        notes: [],
      },
    );
    const map = repaired.operations[0];

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(map?.type).toBe("create_map");
    if (map?.type !== "create_map") throw new Error("Expected a map operation");
    expect(map.edges).toEqual([{ from: "root", to: "positioning", label: "explores" }]);
    expect(map.nodes.filter((node) => node.locked).map((node) => node.id)).toEqual(["root"]);
  });

  it("links an explicitly mentioned existing note into a generated map", () => {
    useDiornaStore.getState().setWorkspace("workspace-personal");
    const state = useDiornaStore.getState();
    const source = state.notes.find(
      (note) => note.workspaceId === "workspace-personal" && !note.trashedAt,
    )!;
    const plan = aiPlanSchema.parse({
      version: 1,
      summary: "Create a map from the selected note.",
      assumptions: [],
      operations: [
        {
          id: "map",
          type: "create_map",
          name: "Referenced business",
          nodes: [
            {
              id: "source",
              kind: "note",
              title: source.title,
              body: null,
              noteOperationId: null,
              mentionedNoteId: source.id,
              locked: true,
            },
          ],
          edges: [],
        },
      ],
    });
    const changes = applyAiPlan(plan, state);
    const createdMap = useDiornaStore.getState().maps.find((entry) => entry.id === changes.maps[0]);

    expect(changes.notes).toHaveLength(0);
    expect(createdMap?.nodes[0]).toMatchObject({ type: "file", file: source.path });
  });

  it("creates every supported entity in one workspace and undoes the whole batch", () => {
    useDiornaStore.getState().setWorkspace("workspace-personal");
    const before = useDiornaStore.getState();
    const changes = applyAiPlan(fullPlan, before);
    const created = useDiornaStore.getState();

    expect(changes.created.map((entry) => entry.module)).toEqual([
      "notes",
      "notes",
      "maps",
      "calendar",
      "daily",
    ]);
    expect(created.notes.find((note) => note.id === changes.notes[0])).toMatchObject({
      workspaceId: "workspace-personal",
      title: "Kernel process",
      tags: ["systems", "map/adaptogenic-coffee-business"],
    });
    expect(created.maps.find((map) => map.id === changes.maps[0])).toMatchObject({
      workspaceId: "workspace-personal",
      name: "Adaptogenic coffee business",
    });
    expect(created.maps.find((map) => map.id === changes.maps[0])?.nodes).toHaveLength(3);
    expect(created.notes.find((note) => note.title === "Customer archetype")?.tags).toContain(
      "map/adaptogenic-coffee-business",
    );
    const createdMap = created.maps.find((map) => map.id === changes.maps[0])!;
    const centralNode = createdMap.nodes.find((node) => node.diorna?.locked);
    expect(centralNode).toMatchObject({ x: 0, y: 0 });
    expect(createdMap.edges).toHaveLength(2);
    expect(createdMap.edges.every((edge) => edge.label)).toBe(true);
    expect(createdMap.nodes.some((node) => node.x !== 0 || node.y !== 0)).toBe(true);
    expect(created.items.find((item) => item.id === changes.items[0])).toMatchObject({
      workspaceId: "workspace-personal",
      title: "Football",
    });
    expect(created.habits.find((habit) => habit.id === changes.habits[0])).toMatchObject({
      workspaceId: "workspace-personal",
      name: "Stretch",
      type: "quantity",
      target: 20,
      activeWeekdays: [1, 2, 3, 4, 5, 6],
    });

    undoAiChangeSet(useDiornaStore.getState(), changes);
    const undone = useDiornaStore.getState();
    expect(
      undone.notes
        .filter((note) => changes.notes.includes(note.id))
        .every((note) => note.trashedAt),
    ).toBe(true);
    expect(undone.maps.find((map) => map.id === changes.maps[0])?.trashedAt).toBeTruthy();
    expect(undone.items.find((item) => item.id === changes.items[0])).toBeUndefined();
    expect(undone.habits.find((habit) => habit.id === changes.habits[0])?.archived).toBe(true);
  });
});
