import { describe, expect, it } from "vitest";
import { extractClozeCards, retentionRate } from "@/modules/student/flashcards";
import { formatReference, parseBibTeX, parseCslJson } from "@/modules/student/bibliography";

describe("student authoring", () => {
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
