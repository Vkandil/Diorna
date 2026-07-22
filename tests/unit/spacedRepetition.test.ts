import { describe, expect, it } from "vitest";
import { reviewCard } from "@/modules/student/spacedRepetition";
import type { Flashcard } from "@/shared/models";

const card = (changes: Partial<Flashcard> = {}): Flashcard => ({
  id: "f1",
  workspaceId: "w1",
  noteId: "n1",
  blockId: "b1",
  front: "Q",
  back: "A",
  cardType: "basic",
  ease: 2.5,
  intervalDays: 0,
  dueDate: "2026-07-20",
  reps: 0,
  lapses: 0,
  ...changes,
});

describe("SM-2 scheduling", () => {
  it("schedules a first good response tomorrow", () =>
    expect(reviewCard(card(), "good", "2026-07-20")).toMatchObject({
      reps: 1,
      intervalDays: 1,
      dueDate: "2026-07-21",
    }));
  it("schedules the second good response four days later", () =>
    expect(reviewCard(card({ reps: 1, intervalDays: 1 }), "good", "2026-07-20")).toMatchObject({
      reps: 2,
      intervalDays: 4,
      dueDate: "2026-07-24",
    }));
  it("uses six days for a second easy response", () =>
    expect(reviewCard(card({ reps: 1, intervalDays: 1 }), "easy", "2026-07-20").intervalDays).toBe(
      6,
    ));
  it("resets repetitions and records a lapse on again", () =>
    expect(reviewCard(card({ reps: 5, intervalDays: 30 }), "again", "2026-07-20")).toMatchObject({
      reps: 0,
      lapses: 1,
      intervalDays: 1,
    }));
  it("never lowers ease below 1.3", () =>
    expect(
      reviewCard(card({ ease: 1.3, reps: 5, intervalDays: 20 }), "hard", "2026-07-20").ease,
    ).toBeGreaterThanOrEqual(1.3));
  it("hard produces a shorter interval than good", () => {
    const source = card({ reps: 3, intervalDays: 10 });
    expect(reviewCard(source, "hard", "2026-07-20").intervalDays).toBeLessThan(
      reviewCard(source, "good", "2026-07-20").intervalDays,
    );
  });
  it("easy produces a longer interval than good", () => {
    const source = card({ reps: 3, intervalDays: 10 });
    expect(reviewCard(source, "easy", "2026-07-20").intervalDays).toBeGreaterThan(
      reviewCard(source, "good", "2026-07-20").intervalDays,
    );
  });
});
