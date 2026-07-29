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
    const usage = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(fullPlan) } }],
          usage: {
            prompt_tokens: 1200,
            completion_tokens: 800,
            total_tokens: 2000,
            cost: 0.0042,
          },
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
          maxTokens: 4000,
        },
        {
          prompt: "Create my plan",
          workspaceName: "Personal",
          now: "2026-07-23T12:00:00.000Z",
          timezone: "Europe/Brussels",
          mentions: [],
          notes: [],
        },
        undefined,
        undefined,
        usage,
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
      max_tokens: 4000,
      usage: { include: true },
    });
    expect(usage).toHaveBeenLastCalledWith({
      calls: 1,
      promptTokens: 1200,
      completionTokens: 800,
      totalTokens: 2000,
      costUsd: 0.0042,
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

  it("creates a goal-directed project and connects every generated resource", () => {
    useDiornaStore.getState().setWorkspace("workspace-personal");
    const plan = aiPlanSchema.parse({
      version: 1,
      summary: "Plan a client campaign with its brief, call and follow-up routine.",
      assumptions: ["The kickoff lasts one hour."],
      operations: [
        {
          id: "brief",
          type: "create_note",
          title: "Northstar campaign brief",
          bodyMarkdown: "# Campaign brief\n\nAudience, promise and deliverables.",
          tags: ["client"],
        },
        {
          id: "kickoff",
          type: "create_calendar_item",
          kind: "event",
          title: "Northstar kickoff call",
          description: "Confirm scope and decision makers.",
          startAt: "2026-08-03T10:00:00+02:00",
          endAt: "2026-08-03T11:00:00+02:00",
          allDay: false,
          category: "",
          priority: "high",
        },
        {
          id: "followup",
          type: "create_habit",
          name: "Client follow-up",
          description: "Review pending client decisions.",
          category: "",
          tracking: "checkbox",
          unit: "",
          target: null,
          activeWeekdays: [1, 3, 5],
        },
        {
          id: "campaign-project",
          type: "upsert_project",
          existingProjectId: null,
          name: "Northstar brand campaign",
          outcome: "The final campaign is approved by the client.",
          description: "Coordinate discovery, production and approval.",
          kind: "work",
          targetDate: "2026-09-15",
          goalTitle: "Grow the client portfolio",
          health: "on-track",
          nextAction: "Prepare the kickoff agenda",
          stakeholders: ["Northstar", "Marketing lead"],
          tags: ["client", "campaign"],
          milestoneTitles: ["Scope confirmed", "Concept approved", "Final handoff"],
          linkedOperationIds: ["brief", "kickoff", "followup"],
        },
      ],
    });

    const changes = applyAiPlan(plan, useDiornaStore.getState());
    const current = useDiornaStore.getState();
    const project = current.projects.find((entry) => entry.id === changes.projects[0])!;
    expect(project).toMatchObject({
      name: "Northstar brand campaign",
      kind: "work",
      nextAction: "Prepare the kickoff agenda",
      linkedNoteIds: [changes.notes[0]],
      linkedHabitIds: [changes.habits[0]],
    });
    expect(project.milestones).toHaveLength(3);
    expect(current.items.find((entry) => entry.id === changes.items[0])?.projectId).toBe(
      project.id,
    );
    expect(current.goals.find((entry) => entry.id === project.goalId)?.title).toBe(
      "Grow the client portfolio",
    );
    expect(current.notes.find((entry) => entry.id === changes.notes[0])?.path).toContain(
      "notes/Projects/northstar-brand-campaign/",
    );

    undoAiChangeSet(useDiornaStore.getState(), changes);
    expect(useDiornaStore.getState().projects.some((entry) => entry.id === project.id)).toBe(false);
    expect(useDiornaStore.getState().goals.some((entry) => changes.goals.includes(entry.id))).toBe(
      false,
    );
  });

  it("updates an existing project by exact ID and restores it on undo", () => {
    useDiornaStore.getState().setWorkspace("workspace-personal");
    const original = useDiornaStore.getState().addProject({
      name: "Client launch",
      outcome: "The client has approved the launch.",
      kind: "work",
      nextAction: "Prepare discovery",
      milestones: [{ title: "Discovery" }],
    });
    const plan = aiPlanSchema.parse({
      version: 1,
      summary: "Advance the existing client project.",
      assumptions: [],
      operations: [
        {
          id: "update-client-launch",
          type: "upsert_project",
          existingProjectId: original.id,
          name: "Client launch",
          outcome: "The client has approved the launch.",
          description: "Plan discovery, production and approval.",
          kind: "work",
          targetDate: null,
          goalTitle: null,
          health: "at-risk",
          nextAction: "Confirm the decision maker",
          stakeholders: ["Client"],
          tags: ["client"],
          milestoneTitles: ["Discovery", "Creative approval"],
          linkedOperationIds: [],
        },
      ],
    });
    const changes = applyAiPlan(plan, useDiornaStore.getState());
    expect(changes.projects).toEqual([]);
    expect(changes.updatedProjects).toHaveLength(1);
    expect(
      useDiornaStore.getState().projects.find((entry) => entry.id === original.id),
    ).toMatchObject({
      health: "at-risk",
      nextAction: "Confirm the decision maker",
    });
    expect(
      useDiornaStore.getState().projects.find((entry) => entry.id === original.id)?.milestones,
    ).toHaveLength(2);

    undoAiChangeSet(useDiornaStore.getState(), changes);
    expect(
      useDiornaStore.getState().projects.find((entry) => entry.id === original.id),
    ).toMatchObject({
      health: "on-track",
      nextAction: "Prepare discovery",
    });
    expect(
      useDiornaStore.getState().projects.find((entry) => entry.id === original.id)?.milestones,
    ).toHaveLength(1);
  });

  it("plans a connected Focus block with a priority and Calendar reservation", () => {
    useDiornaStore.getState().setWorkspace("workspace-personal");
    const project = useDiornaStore.getState().addProject({
      name: "Northstar proposal",
      outcome: "The client receives an approved proposal.",
      kind: "work",
      nextAction: "Write the commercial argument",
    });
    const plan = aiPlanSchema.parse({
      version: 1,
      summary: "Protect time for the proposal.",
      assumptions: ["A 50-minute block fits before the client call."],
      operations: [
        {
          id: "proposal-focus",
          type: "create_focus_block",
          title: "Draft Northstar commercial argument",
          intention: "Complete a reviewable first draft.",
          mode: "deep-work",
          plannedMinutes: 50,
          scheduledAt: "2026-08-03T09:00:00+02:00",
          priorityDate: "2026-08-03",
          sourceType: "project",
          sourceId: project.id,
          distractionShield: ["Silence chat", "Close email"],
          tags: ["client"],
        },
      ],
    });

    const changes = applyAiPlan(plan, useDiornaStore.getState());
    const current = useDiornaStore.getState();
    const focus = current.focusSessions.find((entry) => entry.id === changes.focusSessions[0]);
    expect(focus).toMatchObject({
      title: "Draft Northstar commercial argument",
      sourceType: "project",
      sourceId: project.id,
      plannedMinutes: 50,
      scheduledAt: "2026-08-03T09:00:00+02:00",
      distractionShield: ["Silence chat", "Close email"],
    });
    expect(current.focusPriorities.find((entry) => entry.id === focus?.priorityId)).toMatchObject({
      date: "2026-08-03",
      sourceId: project.id,
    });
    expect(current.items.find((entry) => entry.id === focus?.calendarItemId)).toMatchObject({
      title: "Focus · Draft Northstar commercial argument",
      projectId: project.id,
    });

    undoAiChangeSet(useDiornaStore.getState(), changes);
    expect(useDiornaStore.getState().focusSessions).toHaveLength(0);
    expect(useDiornaStore.getState().focusPriorities).toHaveLength(0);
    expect(useDiornaStore.getState().items.some((entry) => changes.items.includes(entry.id))).toBe(
      false,
    );
  });

  it("can organize generated Map notes in a dedicated folder without adding group tags", () => {
    useDiornaStore.getState().setWorkspace("workspace-personal");
    const changes = applyAiPlan(fullPlan, useDiornaStore.getState(), {
      mapNoteOrganization: "folder",
      mapFolderRoot: "Generated Maps",
    });
    const created = useDiornaStore.getState();
    const kernel = created.notes.find((note) => note.id === changes.notes[0]);
    const customer = created.notes.find((note) => note.title === "Customer archetype");

    expect(kernel?.path).toMatch(
      /^notes\/generated-maps\/adaptogenic-coffee-business\/Kernel process\.md$/,
    );
    expect(kernel?.tags).toEqual(["systems"]);
    expect(customer?.path).toContain(
      "notes/generated-maps/adaptogenic-coffee-business/Customer archetype.md",
    );
    expect(customer?.tags).not.toContain("map/adaptogenic-coffee-business");
  });

  it("restructures the selected Map, preserves attachments, and restores it on undo", () => {
    useDiornaStore.getState().setWorkspace("workspace-personal");
    const state = useDiornaStore.getState();
    const target = state.addMap("Original Map");
    const attachment = {
      id: "attachment-node",
      type: "file" as const,
      x: 900,
      y: 500,
      width: 320,
      height: 220,
      file: "attachments/reference.pdf",
      diorna: { nodeType: "pdf" as const },
    };
    state.updateMap(target.id, {
      nodes: [
        {
          id: "old-text",
          type: "text",
          x: 100,
          y: 100,
          width: 280,
          height: 140,
          text: "Old layout",
          diorna: { nodeType: "text" },
        },
        attachment,
      ],
      edges: [
        {
          id: "old-attachment-edge",
          fromNode: "old-text",
          toNode: "attachment-node",
          label: "documents",
        },
      ],
    });
    const plan = aiPlanSchema.parse({
      version: 1,
      summary: "Restructure the current Map.",
      assumptions: [],
      operations: [
        {
          id: "map",
          type: "create_map",
          name: "Restructured Map",
          nodes: [
            { id: "root", kind: "text", title: "Main idea", locked: true },
            { id: "branch", kind: "text", title: "First branch", locked: false },
          ],
          edges: [{ from: "root", to: "branch", label: "develops into" }],
        },
      ],
    });

    const changes = applyAiPlan(plan, useDiornaStore.getState(), { targetMapId: target.id });
    const updated = useDiornaStore.getState().maps.find((map) => map.id === target.id);
    expect(changes.maps).toEqual([]);
    expect(changes.updatedMaps).toHaveLength(1);
    expect(updated).toMatchObject({ name: "Original Map" });
    expect(updated?.nodes).toEqual(expect.arrayContaining([expect.objectContaining(attachment)]));
    expect(updated?.nodes.some((node) => node.text === "Old layout")).toBe(false);
    expect(
      updated?.edges.some((edge) => edge.toNode === attachment.id && edge.label === "documents"),
    ).toBe(true);

    undoAiChangeSet(useDiornaStore.getState(), changes);
    const restored = useDiornaStore.getState().maps.find((map) => map.id === target.id);
    expect(restored).toMatchObject({ name: "Original Map" });
    expect(restored?.nodes.some((node) => node.text === "Old layout")).toBe(true);
  });
});
