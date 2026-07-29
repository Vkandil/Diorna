import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";
import { parseTrainingNote } from "@/modules/training/import";
import {
  findCatalogExercise,
  searchTrainingExerciseCatalog,
  TRAINING_EXERCISE_CATALOG,
} from "@/modules/training/catalog";
import {
  availableProgressMetrics,
  exerciseProgress,
  formatExerciseResult,
  sessionDistance,
  sessionDurationMinutes,
  sessionVolume,
} from "@/modules/training/logic";
import type { Note, TrainingSession } from "@/shared/models";

describe("training domain", () => {
  beforeEach(() => {
    useDiornaStore.getState().resetAll();
    useDiornaStore.getState().setWorkspace("workspace-personal");
  });

  it("creates a reusable session, repeats it, and synchronizes completed minutes to Daily", () => {
    const activity = useDiornaStore.getState().addTrainingActivity({
      name: "Strength",
      kind: "strength",
      trackInDaily: true,
    });
    const exercise = useDiornaStore.getState().addTrainingExercise({
      activityId: activity.id,
      name: "Leg curl",
      measureType: "sets",
    })!;
    const template = useDiornaStore.getState().addTrainingTemplate({
      activityId: activity.id,
      name: "Leg day",
      exercises: [
        {
          id: "template-exercise",
          exerciseId: exercise.id,
          name: exercise.name,
          measureType: "sets",
          loadUnit: "kg",
          distanceUnit: "km",
          plannedSets: 3,
          defaultLoad: 25,
          defaultReps: 20,
        },
      ],
    })!;
    const session = useDiornaStore.getState().startTrainingSession({
      activityId: activity.id,
      templateId: template.id,
      startedAt: "2026-07-29T18:00:00.000Z",
    })!;
    expect(session.results[0]?.sets).toHaveLength(3);
    useDiornaStore.getState().completeTrainingSession(session.id, "2026-07-29T19:00:00.000Z");

    const completed = useDiornaStore
      .getState()
      .trainingSessions.find((entry) => entry.id === session.id)!;
    expect(sessionDurationMinutes(completed)).toBe(60);
    expect(sessionVolume(completed)).toBe(1_500);
    expect(useDiornaStore.getState().habitEntries).toContainEqual({
      workspaceId: "workspace-personal",
      habitId: activity.dailyHabitId,
      date: "2026-07-29",
      value: 60,
      done: true,
      note: "Synced from Training.",
    });

    const repeated = useDiornaStore.getState().repeatTrainingSession(session.id)!;
    expect(repeated.status).toBe("in-progress");
    expect(repeated.results[0]?.sets[0]).toMatchObject({
      load: 25,
      reps: 20,
      completed: false,
    });
  });

  it("links a scheduled Calendar item to the resulting Training session", () => {
    const state = useDiornaStore.getState();
    const activity = state.addTrainingActivity({
      name: "Running",
      kind: "running",
      trackInDaily: false,
    });
    const exercise = useDiornaStore.getState().addTrainingExercise({
      activityId: activity.id,
      name: "Run",
      measureType: "mixed",
    })!;
    const template = useDiornaStore.getState().addTrainingTemplate({
      activityId: activity.id,
      name: "Easy 5K",
      exercises: [
        {
          id: "template-run",
          exerciseId: exercise.id,
          name: exercise.name,
          measureType: "mixed",
          loadUnit: "kg",
          distanceUnit: "km",
          plannedSets: 1,
          defaultDistance: 5,
        },
      ],
    })!;
    const category = useDiornaStore
      .getState()
      .categories.find((entry) => entry.workspaceId === "workspace-personal")!;
    const item = useDiornaStore.getState().addItem({
      kind: "event",
      title: "Training · Easy 5K",
      description: "",
      categoryId: category.id,
      startAt: "2026-07-30T18:00:00.000Z",
      endAt: "2026-07-30T19:00:00.000Z",
      allDay: false,
      priority: "none",
      subtasks: [],
      rruleExceptions: [],
      reminders: [10],
      trainingTemplateId: template.id,
    });
    const session = useDiornaStore.getState().startTrainingSession({
      activityId: activity.id,
      templateId: template.id,
      calendarItemId: item.id,
      startedAt: item.startAt,
    })!;
    expect(useDiornaStore.getState().items.find((entry) => entry.id === item.id)).toMatchObject({
      trainingTemplateId: template.id,
      trainingSessionId: session.id,
    });
  });

  it("computes progress for strength, duration, and distance", () => {
    const sessions: TrainingSession[] = [
      completedSession("one", "2026-07-01T10:00:00.000Z", 20, 10, 1_800, 5),
      completedSession("two", "2026-07-08T10:00:00.000Z", 25, 12, 1_500, 6),
    ];
    expect(exerciseProgress(sessions, "leg-curl", "load").map((point) => point.value)).toEqual([
      20, 25,
    ]);
    expect(exerciseProgress(sessions, "leg-curl", "volume").map((point) => point.value)).toEqual([
      200, 300,
    ]);
    expect(sessionDistance(sessions[1]!)).toEqual({ km: 6 });
    expect(formatExerciseResult(sessions[1]!.results[0])).toContain("25 kg × 12");
  });

  it("supports bodyweight, optional added load, and freely named exercises", () => {
    const activity = useDiornaStore.getState().addTrainingActivity({
      name: "Calisthenics",
      kind: "strength",
      trackInDaily: false,
    });
    const pullUp = useDiornaStore.getState().addTrainingExercise({
      activityId: activity.id,
      name: "Pull-up",
      measureType: "sets",
      loadMode: "bodyweight-plus",
    })!;
    const custom = useDiornaStore.getState().addTrainingExercise({
      activityId: activity.id,
      name: "Dragon flag raise",
      measureType: "sets",
      loadMode: "bodyweight",
    })!;

    expect(pullUp.loadMode).toBe("bodyweight-plus");
    expect(custom.name).toBe("Dragon flag raise");
    expect(
      formatExerciseResult({
        id: "result-bodyweight",
        exerciseId: custom.id,
        name: custom.name,
        measureType: "sets",
        loadMode: "bodyweight",
        loadUnit: "kg",
        distanceUnit: "km",
        sets: [{ id: "set-bodyweight", reps: 8, completed: true }],
        notes: "",
      }),
    ).toBe("8 reps");
    expect(
      availableProgressMetrics({
        measureType: "sets",
        loadMode: "bodyweight",
        sets: [{ id: "set-bodyweight", reps: 8, completed: true }],
      }),
    ).toEqual(["reps"]);
    expect(
      availableProgressMetrics({
        measureType: "sets",
        loadMode: "assisted",
        sets: [{ id: "set-assisted", load: 20, reps: 8, completed: true }],
      }),
    ).toEqual(["load", "reps"]);
    const assisted = completedSession("assisted", "2026-07-12T10:00:00.000Z", 20, 8, 600, 0);
    assisted.results[0]!.loadMode = "assisted";
    expect(sessionVolume(assisted)).toBe(0);
  });

  it("searches a broad exercise catalogue by names and French aliases", () => {
    expect(TRAINING_EXERCISE_CATALOG.length).toBeGreaterThan(90);
    const legMatches = searchTrainingExerciseCatalog("leg", "strength").map(
      (exercise) => exercise.name,
    );
    expect(legMatches).toContain("Leg curl");
    expect(legMatches).toContain("Leg extension");
    expect(legMatches).not.toContain("Bench press");
    expect(findCatalogExercise("tractions")).toMatchObject({
      name: "Pull-up",
      loadMode: "bodyweight-plus",
    });
    expect(findCatalogExercise("pompe")).toMatchObject({
      name: "Push-up",
      loadMode: "bodyweight",
    });
  });
});

describe("training note import", () => {
  it("recognizes dated strength, distance, and duration records without changing the note", () => {
    const note: Note = {
      id: "note-training",
      workspaceId: "workspace-personal",
      path: "notes/Training.md",
      title: "Training log",
      body: [
        "<h2>20/07/2026</h2>",
        "<p>Leg curl 3x20 @ 25 kg</p>",
        "<p>Running 5 km in 30 min</p>",
        "<h2>2026-07-27</h2>",
        "<p>Mobility 20 min</p>",
      ].join(""),
      tags: [],
      properties: {},
      createdAt: "2026-07-20T10:00:00.000Z",
      updatedAt: "2026-07-27T10:00:00.000Z",
      wordCount: 12,
    };
    const imported = parseTrainingNote(note);
    expect(imported).toHaveLength(2);
    expect(imported[0]).toMatchObject({
      date: "2026-07-20",
      exercises: [
        { name: "Leg curl", measureType: "sets" },
        { name: "Running", measureType: "mixed" },
      ],
    });
    expect(imported[0]?.exercises[0]?.sets).toHaveLength(3);
    expect(imported[1]?.exercises[0]?.sets[0]).toMatchObject({
      durationSeconds: 1_200,
      completed: true,
    });
    expect(note.body).toContain("Leg curl");
  });
});

function completedSession(
  id: string,
  startedAt: string,
  load: number,
  reps: number,
  durationSeconds: number,
  distance: number,
): TrainingSession {
  return {
    id,
    workspaceId: "workspace-personal",
    activityId: "strength",
    title: "Session",
    status: "completed",
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + durationSeconds * 1_000).toISOString(),
    results: [
      {
        id: `${id}-result`,
        exerciseId: "leg-curl",
        name: "Leg curl",
        measureType: "mixed",
        loadUnit: "kg",
        distanceUnit: "km",
        sets: [
          {
            id: `${id}-set`,
            load,
            reps,
            durationSeconds,
            distance,
            completed: true,
          },
        ],
        notes: "",
      },
    ],
    notes: "",
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}
