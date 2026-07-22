import { describe, expect, it } from "vitest";
import { parseQuickItem } from "@/modules/calendar/parser";

const now = new Date("2026-07-20T10:00:00");

describe("natural-language quick add", () => {
  const cases: Array<[string, string, string?]> = [
    ["gym today 6pm", "2026-07-20T18:00"],
    ["gym tomorrow 6pm", "2026-07-21T18:00"],
    ["meeting in 3 days 9am", "2026-07-23T09:00"],
    ["review next monday 10am", "2026-07-27T10:00"],
    ["review next tuesday 10am", "2026-07-21T10:00"],
    ["review next wednesday 10am", "2026-07-22T10:00"],
    ["review next thursday 10am", "2026-07-23T10:00"],
    ["review next friday 10am", "2026-07-24T10:00"],
    ["review next saturday 10am", "2026-07-25T10:00"],
    ["review next sunday 10am", "2026-07-26T10:00"],
    ["deadline 2026-08-01 14:00", "2026-08-01T14:00"],
    ["deadline 01/08/2026 14:00", "2026-08-01T14:00"],
    ["deadline 1.8.2026 14:00", "2026-08-01T14:00"],
    ["coffee today 12am", "2026-07-20T00:00"],
    ["lunch today 12pm", "2026-07-20T12:00"],
    ["call today 1pm", "2026-07-20T13:00"],
    ["call today 1:30pm", "2026-07-20T13:30"],
    ["call today 18:45", "2026-07-20T18:45"],
    ["a tomorrow 7am", "2026-07-21T07:00"],
    ["b tomorrow 8am", "2026-07-21T08:00"],
    ["c tomorrow 9am", "2026-07-21T09:00"],
    ["d tomorrow 10am", "2026-07-21T10:00"],
    ["e tomorrow 11am", "2026-07-21T11:00"],
    ["f tomorrow 1pm", "2026-07-21T13:00"],
    ["g tomorrow 2pm", "2026-07-21T14:00"],
    ["h tomorrow 3pm", "2026-07-21T15:00"],
    ["i tomorrow 4pm", "2026-07-21T16:00"],
    ["j tomorrow 5pm", "2026-07-21T17:00"],
    ["k tomorrow 6pm", "2026-07-21T18:00"],
    ["l tomorrow 7pm", "2026-07-21T19:00"],
    ["m tomorrow 8pm", "2026-07-21T20:00"],
    ["n tomorrow 9pm", "2026-07-21T21:00"],
    ["o tomorrow 10pm", "2026-07-21T22:00"],
    ["p in 1 day 8am", "2026-07-21T08:00"],
    ["p in 2 days 8am", "2026-07-22T08:00"],
    ["p in 4 days 8am", "2026-07-24T08:00"],
    ["p in 5 days 8am", "2026-07-25T08:00"],
    ["p in 6 days 8am", "2026-07-26T08:00"],
    ["p in 7 days 8am", "2026-07-27T08:00"],
    ["p in 8 days 8am", "2026-07-28T08:00"],
    ["p in 9 days 8am", "2026-07-29T08:00"],
    ["p in 10 days 8am", "2026-07-30T08:00"],
    ["p in 11 days 8am", "2026-07-31T08:00"],
    ["p in 12 days 8am", "2026-08-01T08:00"],
    ["p in 13 days 8am", "2026-08-02T08:00"],
    ["p in 14 days 8am", "2026-08-03T08:00"],
    ["p in 20 days 8am", "2026-08-09T08:00"],
    ["p in 30 days 8am", "2026-08-19T08:00"],
    ["standup today 08:05", "2026-07-20T08:05"],
    ["class today 16:15", "2026-07-20T16:15"],
    ["sleep today 23:30", "2026-07-20T23:30"],
  ];
  it.each(cases)("parses %s", (input, expected) =>
    expect(parseQuickItem(input, now).startAt).toContain(expected),
  );
  it("parses a time range", () => {
    const value = parseQuickItem("gym tomorrow 2-4pm", now);
    expect(value.startAt).toContain("T14:00");
    expect(value.endAt).toContain("T16:00");
  });
  it("parses hour-and-minute duration", () => {
    const value = parseQuickItem("study today 6pm for 1h30", now);
    expect(value.endAt).toContain("T19:30");
  });
  it("parses minute duration", () =>
    expect(parseQuickItem("walk today 6pm for 45min", now).endAt).toContain("T18:45"));
  it("extracts category without leaving it in title", () => {
    const value = parseQuickItem("gym tomorrow 6pm #sport", now);
    expect(value.category).toBe("sport");
    expect(value.title).toBe("gym");
  });
  it.each(["low", "medium", "high"] as const)("extracts %s priority", (priority) =>
    expect(parseQuickItem(`task today 9am !${priority}`, now).priority).toBe(priority),
  );
  it("defaults priority to none", () =>
    expect(parseQuickItem("task today 9am", now).priority).toBe("none"));
  it("parses daily recurrence", () =>
    expect(parseQuickItem("journal every day 8pm", now).recurrence).toBe("FREQ=DAILY"));
  it("parses weekday recurrence", () =>
    expect(parseQuickItem("work every weekday 9am", now).recurrence).toContain(
      "BYDAY=MO,TU,WE,TH,FR",
    ));
  it("parses weekly recurrence", () =>
    expect(parseQuickItem("review every monday 9am", now).recurrence).toBe("FREQ=WEEKLY;BYDAY=MO"));
  it("uses Untitled for metadata-only input", () =>
    expect(parseQuickItem("tomorrow 9am", now).title).toBe("Untitled"));
});
