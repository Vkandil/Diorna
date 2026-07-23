import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiornaStore } from "@/core/store";
import { applyAiPlan, undoAiChangeSet } from "@/modules/ai/executor";
import { buildAiPayload, requestAiPlan, resolveMentionedNotes } from "@/modules/ai/planner";
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
        { from: "root", to: "research" },
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
    ).toThrow(/Unknown prior note operation/);
    expect(() =>
      aiPlanSchema.parse({
        version: 1,
        summary: "Delete everything",
        assumptions: [],
        operations: [{ id: "bad", type: "delete_note", noteId: "all" }],
      }),
    ).toThrow();
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
    });
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
      tags: ["systems"],
    });
    expect(created.maps.find((map) => map.id === changes.maps[0])).toMatchObject({
      workspaceId: "workspace-personal",
      name: "Adaptogenic coffee business",
    });
    expect(created.maps.find((map) => map.id === changes.maps[0])?.nodes).toHaveLength(3);
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
