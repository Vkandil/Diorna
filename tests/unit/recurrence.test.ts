import { describe, expect, it } from "vitest";
import { describeRecurrence, occurrencesBetween } from "@/modules/calendar/recurrence";
import type { CalendarItem } from "@/shared/models";

const item = (changes: Partial<CalendarItem> = {}): CalendarItem => ({
  id: "i1",
  workspaceId: "w1",
  kind: "event",
  title: "Lecture",
  description: "",
  categoryId: "c1",
  startAt: "2026-07-20T10:00:00.000Z",
  endAt: "2026-07-20T11:30:00.000Z",
  allDay: false,
  priority: "none",
  subtasks: [],
  rruleExceptions: [],
  reminders: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...changes,
});

describe("recurrence expansion", () => {
  it("returns a non-recurring occurrence in range", () =>
    expect(occurrencesBetween(item(), new Date("2026-07-20"), new Date("2026-07-21"))).toHaveLength(
      1,
    ));
  it("omits a non-recurring occurrence outside range", () =>
    expect(occurrencesBetween(item(), new Date("2026-07-21"), new Date("2026-07-22"))).toHaveLength(
      0,
    ));
  it("expands weekly RRULEs", () =>
    expect(
      occurrencesBetween(
        item({ rrule: "FREQ=WEEKLY;COUNT=3" }),
        new Date("2026-07-19"),
        new Date("2026-08-10"),
      ),
    ).toHaveLength(3));
  it("preserves duration", () => {
    const values = occurrencesBetween(
      item({ rrule: "FREQ=DAILY;COUNT=2" }),
      new Date("2026-07-19"),
      new Date("2026-07-23"),
    );
    expect(new Date(values[1]!.endAt!).getTime() - new Date(values[1]!.startAt!).getTime()).toBe(
      90 * 60_000,
    );
  });
  it("skips individual exceptions", () =>
    expect(
      occurrencesBetween(
        item({ rrule: "FREQ=DAILY;COUNT=3", rruleExceptions: ["2026-07-21T10:00:00.000Z"] }),
        new Date("2026-07-19"),
        new Date("2026-07-24"),
      ),
    ).toHaveLength(2));
  it("provides stable recurrence ids", () =>
    expect(
      occurrencesBetween(
        item({ rrule: "FREQ=DAILY;COUNT=1" }),
        new Date("2026-07-19"),
        new Date("2026-07-22"),
      )[0]!.recurrenceId,
    ).toContain("i1:"));
  it("describes no recurrence", () => expect(describeRecurrence()).toBe("Does not repeat"));
  it("describes valid recurrence", () => expect(describeRecurrence("FREQ=DAILY")).toContain("day"));
  it("handles invalid recurrence", () =>
    expect(describeRecurrence("NOT A RULE")).toBe("Custom recurrence"));
  it("returns nothing without an anchor", () =>
    expect(
      occurrencesBetween(
        item({
          startAt: undefined,
          endAt: undefined,
          dueAt: undefined,
        } as unknown as Partial<CalendarItem>),
        new Date("2026-07-19"),
        new Date("2026-07-22"),
      ),
    ).toEqual([]));
});
