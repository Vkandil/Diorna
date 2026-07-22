import { describe, expect, it } from "vitest";
import {
  aggregateRecap,
  buildTemplateNarrative,
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
  categoryNames: { projects: "Projects", sport: "Sport" },
};

describe("recap aggregation and factual validation", () => {
  it("computes metric change and personal record", () => {
    const stats = aggregateRecap(base);
    expect(stats.metrics[0]).toMatchObject({
      first: 72,
      last: 80,
      absoluteChange: 8,
      percentChange: 11.1,
      personalRecord: true,
    });
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
  });
  it("produces one daily score per day", () =>
    expect(aggregateRecap(base).dailyScores).toHaveLength(30));
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
