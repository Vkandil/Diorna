import { describe, expect, it } from "vitest";
import { expandLinkedNoteTree } from "@/modules/maps/linkedNotes";
import type { CanvasNode, Note } from "@/shared/models";

const note = (id: string, title: string, body: string): Note => ({
  id,
  workspaceId: "workspace",
  path: `notes/${title}.md`,
  title,
  body,
  tags: [],
  properties: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  wordCount: 0,
});

describe("linked note map expansion", () => {
  it("lays out every nested page once and connects it with directed arrows", () => {
    const notes = [
      note("root", "Root", "<p>[[Child A]] and [[Child B]]</p>"),
      note("a", "Child A", "<p>[[Grandchild]]</p>"),
      note("b", "Child B", "<p>[[Grandchild]]</p>"),
      note("grandchild", "Grandchild", "<p>[[Root]]</p>"),
    ];
    const root: CanvasNode = {
      id: "root-node",
      type: "file",
      x: 10,
      y: 20,
      width: 220,
      height: 110,
      file: notes[0]!.path,
      diorna: { nodeType: "note", collapsed: true },
    };

    const expanded = expandLinkedNoteTree(root, notes, [root], []);

    expect(expanded.nodes).toHaveLength(4);
    expect(expanded.edges).toHaveLength(5);
    expect(new Set(expanded.nodes.map((node) => node.file))).toHaveLength(4);
    expect(expanded.nodes[0]).toMatchObject({ width: 320, height: 220 });
    expect(expanded.nodes[0]?.diorna?.collapsed).toBe(false);
    expect(expanded.edges.every((edge) => edge.diorna?.arrowheads === "one-way")).toBe(true);
  });

  it("reuses existing page nodes and does not duplicate arrows", () => {
    const notes = [note("root", "Root", "[[Child]]"), note("child", "Child", "")];
    const root: CanvasNode = {
      id: "root-node",
      type: "file",
      x: 0,
      y: 0,
      width: 320,
      height: 220,
      file: notes[0]!.path,
      diorna: { nodeType: "note" },
    };
    const child: CanvasNode = {
      ...root,
      id: "child-node",
      x: 400,
      file: notes[1]!.path,
    };
    const edge = {
      id: "edge",
      fromNode: root.id,
      toNode: child.id,
      diorna: { arrowheads: "one-way" as const },
    };

    const expanded = expandLinkedNoteTree(root, notes, [root, child], [edge]);

    expect(expanded.addedNodeIds).toEqual([]);
    expect(expanded.nodes).toHaveLength(2);
    expect(expanded.edges).toHaveLength(1);
  });
});
