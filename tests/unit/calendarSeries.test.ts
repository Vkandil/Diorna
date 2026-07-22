import { describe, expect, it } from "vitest";
import { buildRrule, normalizeWholeSeriesEdit, splitRule } from "@/modules/calendar/series";
import type { CalendarItem } from "@/shared/models";

const series: CalendarItem = {
  id: "series-1",
  workspaceId: "workspace-1",
  kind: "event",
  title: "Seminar",
  description: "",
  categoryId: "category-1",
  startAt: "2026-07-20T10:00:00.000Z",
  endAt: "2026-07-20T11:00:00.000Z",
  allDay: false,
  priority: "none",
  subtasks: [],
  rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=5",
  rruleExceptions: [],
  reminders: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("calendar series editing", () => {
  it("builds each supported recurrence ending", () => {
    expect(buildRrule("weekly", [0, 2], "count", "8", series.startAt)).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=8",
    );
    expect(buildRrule("monthly-date", [], "never", "", series.startAt)).toContain("BYMONTHDAY=20");
    expect(buildRrule("yearly", [], "date", "2027-07-20", series.startAt)).toContain(
      "UNTIL=20270720T235959Z",
    );
  });

  it("preserves the remaining count when splitting a finite series", () => {
    const split = splitRule(series.rrule!, "2026-08-03T10:00:00.000Z", series);
    expect(split.previous).toContain("UNTIL=20260803T095959Z");
    expect(split.following).toContain("COUNT=3");
  });

  it("keeps the original anchor when editing all from a later occurrence", () => {
    const normalized = normalizeWholeSeriesEdit(series, "2026-07-27T10:00:00.000Z", {
      kind: series.kind,
      title: "Renamed seminar",
      description: "",
      categoryId: series.categoryId,
      startAt: "2026-07-27T10:00:00.000Z",
      endAt: "2026-07-27T12:00:00.000Z",
      allDay: false,
      priority: "none",
      subtasks: [],
      rrule: series.rrule,
      rruleExceptions: [],
      reminders: [],
    });
    expect(normalized.startAt).toBe(series.startAt);
    expect(normalized.endAt).toBe("2026-07-20T12:00:00.000Z");
    expect(normalized.title).toBe("Renamed seminar");
  });
});
