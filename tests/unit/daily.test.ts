import { describe, expect, it } from "vitest";
import {
  averageScoreByWeekday,
  completionScore,
  habitStatistics,
  isEntryComplete,
  isHabitApplicable,
  monthOverMonthDelta,
  periodSummary,
} from "@/modules/daily/logic";
import type { Habit, HabitEntry, MetricEntry } from "@/shared/models";

const habit = (changes: Partial<Habit> = {}): Habit => ({
  id: "h1",
  workspaceId: "w1",
  name: "Read",
  categoryId: "c1",
  type: "checkbox",
  activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
  description: "",
  sortOrder: 0,
  archived: false,
  ...changes,
});
const entry = (date: string, changes: Partial<HabitEntry> = {}): HabitEntry => ({
  workspaceId: "w1",
  habitId: "h1",
  date,
  done: true,
  ...changes,
});

describe("daily completion scoring", () => {
  it("returns null rather than zero when nothing applies", () =>
    expect(completionScore([], [], "2026-07-20")).toBeNull());
  it("scores checkbox completion", () =>
    expect(completionScore([habit()], [entry("2026-07-20")], "2026-07-20")).toBe(100));
  it("scores incomplete applicable habits", () =>
    expect(
      completionScore([habit(), habit({ id: "h2" })], [entry("2026-07-20")], "2026-07-20"),
    ).toBe(50));
  it("excludes archived habits", () =>
    expect(completionScore([habit({ archived: true })], [], "2026-07-20")).toBeNull());
  it("can include archived habits for historical recaps", () =>
    expect(
      completionScore([habit({ archived: true })], [entry("2026-07-20")], "2026-07-20", true),
    ).toBe(100));
  it("excludes weekdays that are inactive", () =>
    expect(isHabitApplicable(habit({ activeWeekdays: [2] }), "2026-07-20")).toBe(false));
  it("includes an active weekday", () =>
    expect(isHabitApplicable(habit({ activeWeekdays: [1] }), "2026-07-20")).toBe(true));
  it("excludes dates before start", () =>
    expect(isHabitApplicable(habit({ startDate: "2026-07-21" }), "2026-07-20")).toBe(false));
  it("excludes dates after end", () =>
    expect(isHabitApplicable(habit({ endDate: "2026-07-19" }), "2026-07-20")).toBe(false));
  it("accepts dates at the inclusive bounds", () =>
    expect(
      isHabitApplicable(habit({ startDate: "2026-07-20", endDate: "2026-07-20" }), "2026-07-20"),
    ).toBe(true));
  it("completes a quantity at target", () =>
    expect(
      isEntryComplete(
        habit({ type: "quantity", target: 30 }),
        entry("2026-07-20", { value: 30, done: false }),
      ),
    ).toBe(true));
  it("does not complete a quantity below target", () =>
    expect(
      isEntryComplete(
        habit({ type: "quantity", target: 30 }),
        entry("2026-07-20", { value: 29, done: true }),
      ),
    ).toBe(false));
  it("handles missing entries", () => expect(isEntryComplete(habit(), undefined)).toBe(false));
  it("computes longest and current streaks", () => {
    const stats = habitStatistics(
      habit(),
      [entry("2026-07-17"), entry("2026-07-18"), entry("2026-07-20")],
      "2026-07-17",
      "2026-07-20",
      "2026-07-20",
    );
    expect(stats).toMatchObject({
      completed: 3,
      applicable: 4,
      rate: 75,
      currentStreak: 1,
      longestStreak: 2,
    });
  });
  it("skips inactive days in a streak", () => {
    const h = habit({ activeWeekdays: [1, 3, 5] });
    const stats = habitStatistics(
      h,
      [entry("2026-07-17"), entry("2026-07-20")],
      "2026-07-17",
      "2026-07-20",
      "2026-07-20",
    );
    expect(stats.currentStreak).toBe(2);
  });
  it("aggregates weekday averages", () => {
    const scores = averageScoreByWeekday(
      [habit()],
      [entry("2026-07-20")],
      "2026-07-20",
      "2026-07-21",
    );
    expect(scores[1]).toBe(100);
    expect(scores[2]).toBe(0);
  });
  it("summarises a period and ranks habits", () => {
    const summary = periodSummary(
      [habit(), habit({ id: "h2", name: "Train" })],
      [entry("2026-07-20")],
      "2026-07-20",
      "2026-07-20",
    );
    expect(summary.score).toBe(50);
    expect(summary.best).toMatchObject({ habit: { name: "Read" }, rate: 100 });
    expect(summary.worst).toMatchObject({ habit: { name: "Train" }, rate: 0 });
  });
  it("returns an empty period summary when nothing applies", () =>
    expect(periodSummary([], [], "2026-07-20", "2026-07-21")).toEqual({ score: null }));
  it("computes a month-over-month metric delta from the last values", () => {
    const metricEntry = (date: string, value: number): MetricEntry => ({
      workspaceId: "w1",
      metricId: "m1",
      date,
      value,
    });
    expect(
      monthOverMonthDelta(
        [
          metricEntry("2026-06-01", 70),
          metricEntry("2026-06-30", 80),
          metricEntry("2026-07-01", 90),
          metricEntry("2026-07-20", 100),
        ],
        "2026-07-01",
      ),
    ).toEqual({ current: 100, previous: 80, percent: 25 });
  });
  it("does not invent a metric percentage without a non-zero baseline", () => {
    const values: MetricEntry[] = [
      { workspaceId: "w1", metricId: "m1", date: "2026-06-30", value: 0 },
      { workspaceId: "w1", metricId: "m1", date: "2026-07-20", value: 4 },
    ];
    expect(monthOverMonthDelta(values, "2026-07-01")).toEqual({
      current: 4,
      previous: 0,
      percent: null,
    });
    expect(monthOverMonthDelta([], "2026-07-01")).toEqual({
      current: null,
      previous: null,
      percent: null,
    });
  });
});
