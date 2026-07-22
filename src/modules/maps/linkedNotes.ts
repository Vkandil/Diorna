import { parseWikiLinks } from "@/modules/notes/logic";
import { createId } from "@/shared/id";
import type { CanvasEdge, CanvasNode, Note } from "@/shared/models";

export interface LinkedNoteExpansion {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  addedNodeIds: string[];
}

export function expandLinkedNoteTree(
  rootNode: CanvasNode,
  notes: Note[],
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): LinkedNoteExpansion {
  const rootNote = notes.find((note) => note.path === rootNode.file);
  if (!rootNote) return { nodes, edges, addedNodeIds: [] };

  const notesByTitle = new Map(notes.map((note) => [note.title.toLocaleLowerCase(), note]));
  const nodeIdByNoteId = new Map<string, string>();
  for (const node of nodes) {
    if (node.diorna?.nodeType !== "note" || !node.file) continue;
    const note = notes.find((entry) => entry.path === node.file);
    if (note && !nodeIdByNoteId.has(note.id)) nodeIdByNoteId.set(note.id, node.id);
  }
  nodeIdByNoteId.set(rootNote.id, rootNode.id);

  const expandedNodes = nodes.map((node) =>
    node.id === rootNode.id
      ? {
          ...node,
          width: Math.max(node.width, 320),
          height: Math.max(node.height, 220),
          diorna: { ...node.diorna, collapsed: false },
        }
      : node,
  );
  const expandedEdges = [...edges];
  const addedNodeIds: string[] = [];
  const visited = new Set<string>();
  const rowByDepth = new Map<number, number>();
  const queue: Array<{ note: Note; nodeId: string; depth: number }> = [
    { note: rootNote, nodeId: rootNode.id, depth: 0 },
  ];

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.note.id)) continue;
    visited.add(current.note.id);
    const linked = new Set(
      parseWikiLinks(current.note.body).map((link) => link.target.toLocaleLowerCase()),
    );
    for (const title of linked) {
      const child = notesByTitle.get(title);
      if (!child || child.id === current.note.id) continue;
      let childNodeId = nodeIdByNoteId.get(child.id);
      if (!childNodeId) {
        const depth = current.depth + 1;
        let row = rowByDepth.get(depth) ?? 0;
        const x = rootNode.x + depth * 400;
        let y = rootNode.y + row * 270;
        while (
          expandedNodes.some(
            (node) =>
              x < node.x + node.width + 24 &&
              x + 320 + 24 > node.x &&
              y < node.y + node.height + 24 &&
              y + 220 + 24 > node.y,
          )
        ) {
          row += 1;
          y = rootNode.y + row * 270;
        }
        rowByDepth.set(depth, row + 1);
        childNodeId = createId("node");
        const node: CanvasNode = {
          id: childNodeId,
          type: "file",
          x,
          y,
          width: 320,
          height: 220,
          text: child.title,
          file: child.path,
          color: String(((depth + 2) % 5) + 1),
          diorna: { nodeType: "note", borderWidth: 1, collapsed: false },
        };
        expandedNodes.push(node);
        addedNodeIds.push(node.id);
        nodeIdByNoteId.set(child.id, node.id);
      }
      if (
        childNodeId !== current.nodeId &&
        !expandedEdges.some(
          (edge) => edge.fromNode === current.nodeId && edge.toNode === childNodeId,
        )
      ) {
        expandedEdges.push({
          id: createId("edge"),
          fromNode: current.nodeId,
          toNode: childNodeId,
          fromSide: "right",
          toSide: "left",
          diorna: { routing: "bezier", arrowheads: "one-way", width: 1.5 },
        });
      }
      if (!visited.has(child.id))
        queue.push({ note: child, nodeId: childNodeId, depth: current.depth + 1 });
    }
  }

  return { nodes: expandedNodes, edges: expandedEdges, addedNodeIds };
}
