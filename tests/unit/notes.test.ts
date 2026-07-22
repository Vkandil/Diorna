import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  extractTags,
  findBacklinks,
  findUnlinkedMentions,
  parseWikiLinks,
  previewReplace,
  renameTag,
  rewriteWikiLinks,
  searchNotes,
} from "@/modules/notes/logic";
import type { Note } from "@/shared/models";

const note = (id: string, title: string, body: string, changes: Partial<Note> = {}): Note => ({
  id,
  workspaceId: "w1",
  path: `notes/${title}.md`,
  title,
  body,
  tags: [],
  properties: {},
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-07-20T00:00:00Z",
  wordCount: 10,
  ...changes,
});

describe("note linking and organisation", () => {
  it("parses links and aliases", () =>
    expect(parseWikiLinks("See [[Target]] and [[Other|label]].")).toEqual([
      expect.objectContaining({ target: "Target" }),
      expect.objectContaining({ target: "Other", alias: "label" }),
    ]));
  it("rewrites matching links while preserving aliases", () =>
    expect(rewriteWikiLinks("[[Old]] [[old|alias]] [[Other]]", "Old", "New")).toBe(
      "[[New]] [[New|alias]] [[Other]]",
    ));
  it("finds backlinks with sentence context", () => {
    const target = note("n1", "Target", "");
    expect(
      findBacklinks([target, note("n2", "Source", "First. See [[Target]] here. Last.")], target)[0],
    ).toMatchObject({ sourceTitle: "Source", context: "See [[Target]] here." });
  });
  it("finds unlinked mentions but excludes links", () => {
    const target = note("n1", "Target", "");
    expect(
      findUnlinkedMentions(
        [target, note("n2", "Source", "Target plain and [[Target]] linked")],
        target,
      ),
    ).toHaveLength(1);
  });
  it("extracts and deduplicates nested tags", () =>
    expect(extractTags("#Course/Stats and #course/stats plus #exam")).toEqual([
      "course/stats",
      "exam",
    ]));
  it("renames a tag subtree", () =>
    expect(renameTag(["course", "course/stats", "other"], "course", "study")).toEqual([
      "study",
      "study/stats",
      "other",
    ]));
  it("expands all template variables and reports cursor", () => {
    const result = applyTemplate(
      "# {{title}}\n{{course}} · {{date}} · {{time}} · W{{week}} · {{semester}}\n{{cursor}}",
      {
        title: "Lecture",
        course: "Stats",
        date: new Date("2026-07-20T14:30:00"),
        week: 30,
        semester: "S1",
      },
    );
    expect(result.content).toContain("# Lecture");
    expect(result.content).not.toContain("{{");
    expect(result.cursor).toBeLessThan(result.content.length + 1);
  });
  it("filters free text", () =>
    expect(
      searchNotes([note("1", "Alpha", "systems"), note("2", "Beta", "biology")], "systems").map(
        (item) => item.id,
      ),
    ).toEqual(["1"]));
  it("filters tags and nested tags", () =>
    expect(
      searchNotes(
        [note("1", "A", "", { tags: ["course/stats"] }), note("2", "B", "", { tags: ["other"] })],
        "tag:course",
      ).map((item) => item.id),
    ).toEqual(["1"]));
  it("filters folders, dates, images and tasks", () => {
    const value = note("1", "A", '<img src="x"> <ul data-type="taskList">', {
      path: "notes/Course/A.md",
    });
    expect(searchNotes([value], "folder:course created:2026-01-01 has:image is:task")).toEqual([
      value,
    ]);
  });
  it("filters typed properties", () =>
    expect(
      searchNotes(
        [
          note("1", "A", "", {
            properties: { status: { type: "single-select", value: "Active" } },
          }),
        ],
        "status:active",
      ),
    ).toHaveLength(1));
  it("supports NOT", () =>
    expect(
      searchNotes([note("1", "A", "keep"), note("2", "B", "draft")], "NOT draft").map(
        (item) => item.id,
      ),
    ).toEqual(["1"]));
  it("previews workspace replacements by line", () =>
    expect(previewReplace([note("1", "A", "hello world")], "world", "Diorna")[0]).toMatchObject({
      before: "hello world",
      after: "hello Diorna",
      line: 1,
    }));
});
