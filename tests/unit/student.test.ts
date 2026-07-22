import { describe, expect, it } from "vitest";
import {
  extractClozeCards,
  extractNoteFlashcards,
  longestReviewStreak,
  retentionRate,
} from "@/modules/student/flashcards";
import {
  citationKeys,
  formatReference,
  parseBibTeX,
  parseCslJson,
} from "@/modules/student/bibliography";

describe("student authoring", () => {
  it("collects unique citation keys from inline and bracketed citations", () => {
    expect([...citationKeys("See @smith2026 and [@doe:systems], then @smith2026.")]).toEqual([
      "smith2026",
      "doe:systems",
    ]);
  });
  it("extracts grouped cloze cards", () => {
    const cards = extractClozeCards(
      "The {{c1::heart}} pumps {{c2::blood}}; {{c1::cardiac muscle}} contracts.",
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ index: 1, answer: "heart; cardiac muscle" });
    expect(cards[0]!.prompt).toContain("[…]");
    expect(cards[0]!.prompt).toContain("blood");
  });
  it("calculates review retention", () => {
    expect(retentionRate([])).toBeNull();
    expect(retentionRate(["again", "hard", "good", "easy"])).toBe(75);
  });
  it("calculates the longest calendar-day review streak", () => {
    expect(
      longestReviewStreak([
        "2026-09-01T10:00:00Z",
        "2026-09-02T10:00:00Z",
        "2026-09-02T18:00:00Z",
        "2026-09-04T10:00:00Z",
      ]),
    ).toBe(2);
    expect(longestReviewStreak([])).toBe(0);
  });
  it("extracts basic and cloze cards with stable scheduling", () => {
    const cards = extractNoteFlashcards(
      {
        id: "note-1",
        workspaceId: "workspace-student",
        path: "notes/Lecture.md",
        title: "Lecture",
        body: '<div front="Question" back="Answer" data-type="flashcard"></div><p>The {{c1::heart}} pumps.</p>',
        tags: [],
        properties: {},
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        wordCount: 4,
      },
      [],
      "2026-07-22",
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      id: "note-1-basic-1",
      front: "Question",
      back: "Answer",
      dueDate: "2026-07-22",
    });
    expect(cards[1]).toMatchObject({ cardType: "cloze", back: "heart" });
    expect(
      extractNoteFlashcards(cardsToNote(), [{ ...cards[0]!, intervalDays: 9, reps: 3 }])[0],
    ).toMatchObject({ intervalDays: 9, reps: 3 });
  });
  it("imports BibTeX", () => {
    const refs = parseBibTeX(
      "@article{smith2026,\n title={Local First},\n author={Smith, Jane and Doe, John},\n year={2026},\n journal={Tools}\n}",
    );
    expect(refs[0]).toMatchObject({
      citationKey: "smith2026",
      title: "Local First",
      authors: ["Smith, Jane", "Doe, John"],
      year: 2026,
      container: "Tools",
    });
  });
  it("imports Zotero CSL JSON", () => {
    const refs = parseCslJson(
      JSON.stringify([
        {
          id: "z1",
          "citation-key": "smith",
          title: "Paper",
          author: [{ family: "Smith", given: "Jane" }],
          issued: { "date-parts": [[2025]] },
          DOI: "10.1/test",
        },
      ]),
    );
    expect(refs[0]).toMatchObject({
      citationKey: "smith",
      title: "Paper",
      authors: ["Smith, Jane"],
      year: 2025,
      doi: "10.1/test",
    });
  });
  it.each(["apa", "ieee", "harvard"] as const)("formats %s references", (style) => {
    const text = formatReference(
      {
        id: "1",
        citationKey: "key",
        title: "Paper",
        authors: ["Smith, J."],
        year: 2026,
        container: "Journal",
      },
      style,
    );
    expect(text).toContain("Paper");
    expect(text).toContain("2026");
  });
});

function cardsToNote() {
  return {
    id: "note-1",
    workspaceId: "workspace-student",
    path: "notes/Lecture.md",
    title: "Lecture",
    body: '<div front="Question" back="Answer" data-type="flashcard"></div>',
    tags: [],
    properties: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    wordCount: 2,
  };
}
