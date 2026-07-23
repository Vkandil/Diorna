import DOMPurify from "dompurify";
import { marked } from "marked";
import { createId } from "@/shared/id";
import type {
  CalendarItem,
  CanvasEdge,
  CanvasMap,
  CanvasNode,
  Category,
  Habit,
  Note,
} from "@/shared/models";
import type { AiMapOperation, AiPlan } from "./types";

export interface DiornaAiStore {
  activeWorkspaceId: string;
  notes: Note[];
  maps: CanvasMap[];
  categories: Category[];
  addNote: (title?: string) => Note;
  updateNote: (id: string, changes: Partial<Note>) => void;
  trashNote: (id: string) => void;
  addMap: (name?: string) => CanvasMap;
  updateMap: (id: string, changes: Partial<CanvasMap>) => void;
  trashMap: (id: string) => void;
  addItem: (
    item: Omit<CalendarItem, "id" | "workspaceId" | "createdAt" | "updatedAt">,
  ) => CalendarItem;
  purgeItem: (id: string) => void;
  addHabit: (habit: Pick<Habit, "name" | "categoryId" | "type"> & Partial<Habit>) => Habit;
  updateHabit: (id: string, changes: Partial<Habit>) => void;
  openTab: (tab: {
    module: "notes" | "maps" | "calendar" | "daily";
    title: string;
    entityId?: string;
  }) => void;
}

export interface AiChangeSet {
  notes: string[];
  maps: string[];
  items: string[];
  habits: string[];
  created: Array<{ module: "notes" | "maps" | "calendar" | "daily"; id: string; title: string }>;
}

export function applyAiPlan(plan: AiPlan, store: DiornaAiStore): AiChangeSet {
  const changes: AiChangeSet = { notes: [], maps: [], items: [], habits: [], created: [] };
  const createdNotes = new Map<string, Note>();
  try {
    for (const operation of plan.operations) {
      if (operation.type !== "create_note") continue;
      const note = createNote(
        store,
        operation.title,
        operation.bodyMarkdown,
        operation.tags,
        changes,
      );
      createdNotes.set(operation.id, note);
    }
    for (const operation of plan.operations) {
      if (operation.type === "create_note") {
        continue;
      } else if (operation.type === "create_map") {
        createMap(store, operation, createdNotes, changes);
      } else if (operation.type === "create_calendar_item") {
        const categoryId = resolveCategory(store, operation.category);
        const item = store.addItem({
          kind: operation.kind,
          title: operation.title,
          description: operation.description,
          categoryId,
          startAt: operation.startAt,
          endAt: operation.endAt,
          allDay: operation.allDay,
          priority: operation.priority,
          subtasks: [],
          rruleExceptions: [],
          reminders: [],
        });
        changes.items.push(item.id);
        changes.created.push({ module: "calendar", id: item.id, title: item.title });
      } else {
        const categoryId = resolveCategory(store, operation.category);
        const habit = store.addHabit({
          name: operation.name,
          description: operation.description,
          categoryId,
          type: operation.tracking,
          activeWeekdays: [...new Set(operation.activeWeekdays)].sort(),
          ...(operation.unit ? { unit: operation.unit } : {}),
          ...(operation.target !== null ? { target: operation.target } : {}),
        });
        changes.habits.push(habit.id);
        changes.created.push({ module: "daily", id: habit.id, title: habit.name });
      }
    }
    return changes;
  } catch (error) {
    undoAiChangeSet(store, changes);
    throw error;
  }
}

export function undoAiChangeSet(store: DiornaAiStore, changes: AiChangeSet): void {
  changes.items.forEach((id) => store.purgeItem(id));
  changes.habits.forEach((id) => store.updateHabit(id, { archived: true }));
  changes.maps.forEach((id) => store.trashMap(id));
  changes.notes.forEach((id) => store.trashNote(id));
}

function createNote(
  store: DiornaAiStore,
  title: string,
  markdown: string,
  tags: string[],
  changes: AiChangeSet,
): Note {
  const note = store.addNote(title);
  const body = DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string);
  store.updateNote(note.id, {
    body,
    tags: [...new Set(tags.map((tag) => tag.replace(/^#/, "").trim()).filter(Boolean))],
    wordCount: markdown.trim().split(/\s+/).filter(Boolean).length,
  });
  const created = { ...note, body, tags };
  changes.notes.push(note.id);
  changes.created.push({ module: "notes", id: note.id, title: note.title });
  return created;
}

function createMap(
  store: DiornaAiStore,
  operation: AiMapOperation,
  createdNotes: Map<string, Note>,
  changes: AiChangeSet,
): CanvasMap {
  const implicitNotes = new Map<string, Note>();
  for (const node of operation.nodes) {
    if (node.kind !== "note" || node.noteOperationId || node.mentionedNoteId) continue;
    implicitNotes.set(
      node.id,
      createNote(store, node.title, node.body ?? `# ${node.title}\n`, [], changes),
    );
  }
  const positions = layoutMap(operation);
  const nodes: CanvasNode[] = operation.nodes.map((node, index) => {
    const point = positions.get(node.id) ?? {
      x: (index % 3) * 360,
      y: Math.floor(index / 3) * 240,
    };
    const linkedNote = node.noteOperationId
      ? createdNotes.get(node.noteOperationId)
      : node.mentionedNoteId
        ? store.notes.find(
            (note) =>
              note.id === node.mentionedNoteId &&
              note.workspaceId === store.activeWorkspaceId &&
              !note.trashedAt,
          )
        : implicitNotes.get(node.id);
    return {
      id: createId("node"),
      type: linkedNote ? "file" : "text",
      x: point.x,
      y: point.y,
      width: linkedNote ? 320 : 280,
      height: linkedNote ? 220 : 140,
      text: node.body ? `${node.title}\n${node.body}` : node.title,
      ...(linkedNote ? { file: linkedNote.path } : {}),
      color: String(((index + 2) % 5) + 1),
      diorna: {
        nodeType: linkedNote ? "note" : "text",
        locked: node.locked,
        borderWidth: node.locked ? 2 : 1,
      },
    };
  });
  const nodeIds = new Map(operation.nodes.map((node, index) => [node.id, nodes[index]!.id]));
  const edges: CanvasEdge[] = operation.edges.flatMap((edge) => {
    const fromNode = nodeIds.get(edge.from);
    const toNode = nodeIds.get(edge.to);
    return fromNode && toNode
      ? [
          {
            id: createId("edge"),
            fromNode,
            toNode,
            fromSide: "right" as const,
            toSide: "left" as const,
            ...(edge.label ? { label: edge.label } : {}),
            diorna: { routing: "bezier" as const, arrowheads: "one-way" as const, width: 1.5 },
          },
        ]
      : [];
  });
  const map = store.addMap(operation.name);
  store.updateMap(map.id, { nodes, edges });
  changes.maps.push(map.id);
  changes.created.push({ module: "maps", id: map.id, title: map.name });
  return { ...map, nodes, edges };
}

function layoutMap(operation: AiMapOperation): Map<string, { x: number; y: number }> {
  const root = operation.nodes.find((node) => node.locked) ?? operation.nodes[0]!;
  const levels = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length) {
    const current = queue.shift()!;
    const level = levels.get(current) ?? 0;
    for (const edge of operation.edges.filter((entry) => entry.from === current)) {
      if (levels.has(edge.to)) continue;
      levels.set(edge.to, level + 1);
      queue.push(edge.to);
    }
  }
  const rows = new Map<number, number>();
  return new Map(
    operation.nodes.map((node, index) => {
      const level = levels.get(node.id) ?? Math.max(1, Math.ceil(index / 3));
      const row = rows.get(level) ?? 0;
      rows.set(level, row + 1);
      return [node.id, { x: level * 400, y: row * 260 }];
    }),
  );
}

function resolveCategory(store: DiornaAiStore, requested: string): string {
  const categories = store.categories.filter(
    (category) => category.workspaceId === store.activeWorkspaceId,
  );
  const match = categories.find(
    (category) => category.name.toLocaleLowerCase() === requested.toLocaleLowerCase(),
  );
  const fallback = match ?? categories[0];
  if (!fallback) throw new Error("The active workspace has no category");
  return fallback.id;
}
