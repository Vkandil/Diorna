import { describe, expect, it } from "vitest";
import {
  aggregateRecap,
  buildTemplateNarrative,
  recapTransmissionPayload,
  validateNarrativeNumbers,
  type RecapInput,
} from "@/modules/recap/logic";

const base: RecapInput = {
  workspaceId: "personal",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  previousPeriodStart: "2026-08-01",
  habits: [
    {
      id: "h1",
      workspaceId: "personal",
      name: "Training",
      categoryId: "sport",
      type: "checkbox",
      activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
      description: "",
      sortOrder: 0,
      archived: false,
    },
  ],
  habitEntries: [
    { workspaceId: "personal", habitId: "h1", date: "2026-09-01", done: true },
    { workspaceId: "personal", habitId: "h1", date: "2026-09-02", done: true },
    { workspaceId: "personal", habitId: "h1", date: "2026-08-01", done: true },
  ],
  metrics: [
    {
      id: "m1",
      workspaceId: "personal",
      name: "Bench press",
      unit: "kg",
      categoryId: "sport",
      sortOrder: 0,
    },
  ],
  metricEntries: [
    { workspaceId: "personal", metricId: "m1", date: "2026-09-01", value: 72 },
    { workspaceId: "personal", metricId: "m1", date: "2026-09-30", value: 80 },
  ],
  items: [
    {
      id: "i1",
      workspaceId: "personal",
      kind: "task",
      title: "Ship",
      description: "",
      categoryId: "projects",
      dueAt: "2026-09-10T18:00:00Z",
      completedAt: "2026-09-10T17:00:00Z",
      allDay: false,
      priority: "high",
      subtasks: [],
      rruleExceptions: [],
      reminders: [],
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-10T17:00:00Z",
    },
    {
      id: "i2",
      workspaceId: "personal",
      kind: "task",
      title: "Old",
      description: "",
      categoryId: "projects",
      dueAt: "2026-08-10T18:00:00Z",
      completedAt: "2026-08-11T17:00:00Z",
      allDay: false,
      priority: "none",
      subtasks: [],
      rruleExceptions: [],
      reminders: [],
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-11T17:00:00Z",
    },
  ],
  notes: [
    {
      id: "n1",
      workspaceId: "personal",
      path: "notes/Project.md",
      title: "Project",
      body: "words",
      tags: ["project"],
      properties: {},
      createdAt: "2026-09-05T00:00:00Z",
      updatedAt: "2026-09-20T00:00:00Z",
      wordCount: 250,
    },
  ],
  maps: [
    {
      id: "map1",
      workspaceId: "personal",
      name: "Gym",
      path: "maps/Gym.canvas",
      nodes: [
        { id: "node1", type: "text", x: 1.25, y: 2.5, width: 200, height: 100, text: "Programme" },
      ],
      edges: [],
      updatedAt: "2026-09-08T00:00:00Z",
    },
  ],
  flashcards: [],
  reviewLogs: [],
  courses: [],
  categoryNames: { projects: "Projects", sport: "Sport" },
};

describe("recap aggregation and factual validation", () => {
  it("includes project delivery, milestones and linked task completion", () => {
    const project = {
      id: "project-launch",
      workspaceId: "personal",
      name: "Product launch",
      outcome: "The product is live.",
      description: "",
      kind: "work" as const,
      status: "completed" as const,
      health: "on-track" as const,
      color: "#1D518A",
      nextAction: "",
      stakeholders: [],
      tags: [],
      progressMode: "automatic" as const,
      manualProgress: 0,
      milestones: [
        {
          id: "milestone-launch",
          title: "Go live",
          completedAt: "2026-09-20T12:00:00Z",
          notes: "",
          sortOrder: 0,
        },
      ],
      updates: [],
      linkedNoteIds: [],
      linkedMapIds: [],
      linkedHabitIds: [],
      linkedTrainingActivityIds: [],
      favorite: false,
      archived: false,
      createdAt: "2026-08-01T12:00:00Z",
      updatedAt: "2026-09-20T12:00:00Z",
      completedAt: "2026-09-20T12:00:00Z",
    };
    const stats = aggregateRecap({
      ...base,
      projects: [project],
      items: base.items.map((item, index) =>
        index === 0 ? { ...item, projectId: project.id } : item,
      ),
    });
    expect(stats.projects).toMatchObject({
      completed: 1,
      previousCompleted: 0,
      milestonesCompleted: 1,
      tasksCompleted: 1,
      taskCompletionRate: 100,
      completedNames: ["Product launch"],
    });
    expect(buildTemplateNarrative(stats, "Personal")).toContain("**Projects.**");
    expect(recapTransmissionPayload(stats, true).projects?.completedNames).toEqual([]);
  });

  it("aggregates planned and actual Focus evidence", () => {
    const session = {
      id: "focus-1",
      workspaceId: "personal",
      title: "Write proposal",
      intention: "Finish a reviewable draft.",
      mode: "deep-work" as const,
      status: "completed" as const,
      sourceType: "project" as const,
      sourceId: "project-1",
      plannedMinutes: 50,
      elapsedSeconds: 3_000,
      pauseCount: 1,
      distractionShield: ["Silence chat"],
      distractions: [
        {
          id: "distraction-1",
          kind: "message" as const,
          note: "Reply later",
          capturedAt: "2026-09-12T09:15:00Z",
          handled: false,
        },
      ],
      review: {
        focusRating: 4,
        energyBefore: 3,
        energyAfter: 4,
        outcome: "Draft complete.",
        wins: "Single-tasked.",
        blockers: "",
        nextAction: "Send for review.",
        sourceCompleted: false,
      },
      tags: [],
      startedAt: "2026-09-12T09:00:00Z",
      endedAt: "2026-09-12T09:50:00Z",
      createdAt: "2026-09-12T08:55:00Z",
      updatedAt: "2026-09-12T09:50:00Z",
    };
    const stats = aggregateRecap({ ...base, focusSessions: [session] });
    expect(stats.focus).toEqual({
      sessions: 1,
      previousSessions: 0,
      plannedMinutes: 50,
      actualMinutes: 50,
      previousActualMinutes: 0,
      completedAsPlanned: 1,
      focusRating: 4,
      distractions: 1,
      byMode: { "deep-work": 50 },
    });
    expect(buildTemplateNarrative(stats, "Personal")).toContain(
      "**Focus.** You protected 50 minutes",
    );
  });

  it("computes metric change and personal record", () => {
    const stats = aggregateRecap(base);
    expect(stats.metrics[0]).toMatchObject({
      first: 72,
      last: 80,
      absoluteChange: 8,
      percentChange: 11.1,
      personalRecord: true,
    });
    expect(stats.metrics[0]?.values).toEqual([
      { date: "2026-09-01", value: 72 },
      { date: "2026-09-30", value: 80 },
    ]);
  });
  it("computes task distribution and timeliness", () => {
    const stats = aggregateRecap(base);
    expect(stats.tasks).toMatchObject({
      completed: 1,
      previousCompleted: 1,
      onTime: 1,
      overdue: 0,
      byCategory: { Projects: 1 },
    });
  });
  it("computes note and map activity", () => {
    const stats = aggregateRecap(base);
    expect(stats.notes).toMatchObject({
      created: 1,
      edited: 1,
      wordsWritten: 250,
      titles: ["Project"],
    });
    expect(stats.maps).toEqual({ created: 1, nodesCreated: 1 });
  });
  it("computes habit rates over applicable days", () => {
    const stats = aggregateRecap(base);
    expect(stats.habits.overallRate).toBe(7);
    expect(stats.habits.best).toEqual({ name: "Training", rate: 7 });
    expect(stats.habits.rates?.[0]).toMatchObject({ name: "Training", rate: 7 });
    expect(stats.habits.weekdayAverages).toHaveLength(7);
  });
  it("aggregates attended events and note classification signals", () => {
    const stats = aggregateRecap({
      ...base,
      items: [
        ...base.items,
        {
          ...base.items[0]!,
          id: "event-1",
          kind: "event",
          startAt: "2026-09-12T09:00:00Z",
          completedAt: undefined,
          categoryId: "sport",
        } as (typeof base.items)[number],
      ],
      notes: [{ ...base.notes[0]!, tags: ["project", "launch"], courseId: "course-1" }],
      courses: [
        {
          id: "course-1",
          workspaceId: "personal",
          name: "Systems",
          code: "SYS",
          color: "#4455aa",
          semester: "Autumn",
          instructor: "Ada",
          credits: 5,
          schedule: "Tuesday",
          sortOrder: 0,
        },
      ],
    });
    expect(stats.events).toEqual({ attended: 1, byCategory: { Sport: 1 } });
    expect(stats.notes.tags).toEqual({ project: 1, launch: 1 });
    expect(stats.notes.courses).toEqual({ Systems: 1 });
  });
  it("includes completed Training sessions and personal records", () => {
    const stats = aggregateRecap({
      ...base,
      trainingActivities: [
        {
          id: "strength",
          workspaceId: "personal",
          name: "Strength",
          kind: "strength",
          color: "#1D518A",
          icon: "Dumbbell",
          archived: false,
          sortOrder: 0,
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      ],
      trainingSessions: [
        {
          id: "training-1",
          workspaceId: "personal",
          activityId: "strength",
          title: "Leg day",
          status: "completed",
          startedAt: "2026-09-12T18:00:00Z",
          endedAt: "2026-09-12T19:00:00Z",
          results: [
            {
              id: "result-1",
              exerciseId: "leg-curl",
              name: "Leg curl",
              measureType: "sets",
              loadUnit: "kg",
              distanceUnit: "km",
              sets: [{ id: "set-1", load: 25, reps: 20, completed: true }],
              notes: "",
            },
          ],
          notes: "",
          createdAt: "2026-09-12T18:00:00Z",
          updatedAt: "2026-09-12T19:00:00Z",
        },
      ],
    });
    expect(stats.training).toEqual({
      sessions: 1,
      previousSessions: 0,
      durationMinutes: 60,
      previousDurationMinutes: 0,
      volume: 500,
      distanceByUnit: {},
      byActivity: { Strength: 1 },
      personalRecords: 1,
    });
    expect(buildTemplateNarrative(stats, "Personal")).toContain("Training");
  });
  it("compares Training periods, distances, activities, and existing records", () => {
    const activity = {
      id: "strength",
      workspaceId: "personal",
      name: "Strength",
      kind: "strength" as const,
      color: "#1D518A",
      icon: "Dumbbell",
      archived: false,
      sortOrder: 0,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
    };
    const makeResult = (id: string, load: number, reps: number) => ({
      id: `result-${id}`,
      exerciseId: id,
      name: id,
      measureType: "sets" as const,
      loadUnit: "kg" as const,
      distanceUnit: "km" as const,
      sets: [{ id: `set-${id}`, load, reps, completed: true }],
      notes: "",
    });
    const stats = aggregateRecap({
      ...base,
      trainingActivities: [activity],
      trainingSessions: [
        {
          id: "training-previous",
          workspaceId: "personal",
          activityId: "strength",
          title: "Previous strength",
          status: "completed",
          startedAt: "2026-08-12T18:00:00Z",
          endedAt: "2026-08-12T18:30:00Z",
          results: [makeResult("leg-curl", 30, 10)],
          notes: "",
          createdAt: "2026-08-12T18:00:00Z",
          updatedAt: "2026-08-12T18:30:00Z",
        },
        {
          id: "training-current-run",
          workspaceId: "personal",
          activityId: "unknown-activity",
          title: "Outdoor run",
          status: "completed",
          startedAt: "2026-09-10T18:00:00Z",
          endedAt: "2026-09-10T18:45:00Z",
          results: [
            makeResult("leg-curl", 25, 10),
            {
              ...makeResult("run", 0, 0),
              measureType: "distance" as const,
              sets: [
                {
                  id: "set-run",
                  distance: 5,
                  durationSeconds: 2_400,
                  completed: true,
                },
              ],
            },
          ],
          notes: "",
          createdAt: "2026-09-10T18:00:00Z",
          updatedAt: "2026-09-10T18:45:00Z",
        },
        {
          id: "training-current-strength",
          workspaceId: "personal",
          activityId: "strength",
          title: "Strength",
          status: "completed",
          startedAt: "2026-09-20T18:00:00Z",
          endedAt: "2026-09-20T18:20:00Z",
          results: [makeResult("bench", 10, 5), makeResult("row", 15, 2)],
          notes: "",
          createdAt: "2026-09-20T18:00:00Z",
          updatedAt: "2026-09-20T18:20:00Z",
        },
      ],
    });

    expect(stats.training).toMatchObject({
      sessions: 2,
      previousSessions: 1,
      durationMinutes: 65,
      previousDurationMinutes: 30,
      distanceByUnit: { km: 5 },
      byActivity: { Training: 1, Strength: 1 },
      personalRecords: 2,
    });
    const narrative = buildTemplateNarrative(stats, "Personal");
    expect(narrative).toContain("2 sessions");
    expect(narrative).toContain("2 exercise records improved");
    expect(recapTransmissionPayload(stats, true).training?.byActivity).toEqual({
      "Activity 1": 1,
      "Activity 2": 1,
    });
  });
  it("redacts note titles from aggregate-only transmission payloads", () => {
    const stats = aggregateRecap(base);
    const redacted = recapTransmissionPayload(stats, true);
    expect(redacted.notes.titles).toEqual([]);
    expect(redacted.workspaceId).toBe("redacted");
    expect(redacted.habits.rates?.[0]?.name).toBe("Habit 1");
    expect(redacted.metrics[0]).toMatchObject({ name: "Metric 1", unit: "units" });
    expect(redacted.tasks.byCategory).toEqual({ "Category 1": 1 });
    expect(redacted.notes.tags).toEqual({});
    expect(stats.notes.titles).toEqual(["Project"]);
    expect(recapTransmissionPayload(stats, false)).toEqual(stats);
  });
  it("produces one daily score per day", () =>
    expect(aggregateRecap(base).dailyScores).toHaveLength(30));
  it("computes review retention and contributing courses", () => {
    const stats = aggregateRecap({
      ...base,
      notes: [{ ...base.notes[0]!, courseId: "course-1" }],
      courses: [
        {
          id: "course-1",
          workspaceId: "personal",
          name: "Systems",
          code: "SYS",
          color: "#4455aa",
          semester: "Autumn 2026",
          instructor: "Ada",
          credits: 5,
          schedule: "Tuesday",
          sortOrder: 0,
        },
      ],
      flashcards: [
        {
          id: "card-1",
          workspaceId: "personal",
          noteId: "n1",
          blockId: "block-1",
          front: "Question",
          back: "Answer",
          cardType: "basic",
          ease: 2.5,
          intervalDays: 1,
          dueDate: "2026-10-01",
          reps: 2,
          lapses: 1,
        },
      ],
      reviewLogs: [
        {
          id: "review-1",
          workspaceId: "personal",
          flashcardId: "card-1",
          reviewedAt: "2026-09-12T12:00:00Z",
          grade: "again",
          intervalBefore: 1,
          intervalAfter: 0,
        },
        {
          id: "review-2",
          workspaceId: "personal",
          flashcardId: "card-1",
          reviewedAt: "2026-09-13T12:00:00Z",
          grade: "good",
          intervalBefore: 0,
          intervalAfter: 1,
        },
      ],
    });
    expect(stats.flashcards).toEqual({
      reviewed: 2,
      retentionRate: 50,
      streak: 2,
      courses: ["Systems"],
    });
  });
  it("builds a usable fallback with no model", () => {
    const text = buildTemplateNarrative(aggregateRecap(base), "Personal");
    expect(text).toContain("Bench press");
    expect(text).toContain("72 → 80 kg");
    expect(text).toContain("Habits");
  });
  it("accepts a template narrative containing traceable figures", () => {
    const stats = aggregateRecap(base);
    expect(validateNarrativeNumbers(buildTemplateNarrative(stats, "Personal"), stats)).toEqual({
      valid: true,
      unexpected: [],
    });
  });
  it("rejects a hallucinated figure", () => {
    const stats = aggregateRecap(base);
    const result = validateNarrativeNumbers("You completed 999 tasks.", stats);
    expect(result.valid).toBe(false);
    expect(result.unexpected).toContain(999);
  });
  it("handles an empty period", () => {
    const stats = aggregateRecap({
      ...base,
      habits: [],
      habitEntries: [],
      metrics: [],
      metricEntries: [],
      items: [],
      notes: [],
      maps: [],
    });
    expect(stats.habits.overallRate).toBeNull();
    expect(stats.tasks.completed).toBe(0);
    expect(buildTemplateNarrative(stats, "Empty")).toContain("No applicable habits");
  });
  it("handles zero metric baselines without infinite percentages", () => {
    const stats = aggregateRecap({
      ...base,
      metricEntries: [
        { workspaceId: "personal", metricId: "m1", date: "2026-09-01", value: 0 },
        { workspaceId: "personal", metricId: "m1", date: "2026-09-30", value: 5 },
      ],
    });
    expect(stats.metrics[0]!.percentChange).toBeNull();
  });
});
