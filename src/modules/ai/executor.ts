import DOMPurify from "dompurify";
import { marked } from "marked";
import { createId } from "@/shared/id";
import type { AiMapNoteOrganization } from "@/shared/aiConfig";
import type {
  CalendarItem,
  CanvasEdge,
  CanvasMap,
  CanvasNode,
  Category,
  FocusPriority,
  FocusSession,
  Habit,
  Goal,
  Note,
  Project,
} from "@/shared/models";
import type { AiMapOperation, AiPlan } from "./types";

export interface DiornaAiStore {
  activeWorkspaceId: string;
  notes: Note[];
  maps: CanvasMap[];
  categories: Category[];
  projects: Project[];
  goals: Goal[];
  addNote: (title?: string, folderOverride?: string) => Note;
  updateNote: (id: string, changes: Partial<Note>) => void;
  trashNote: (id: string) => void;
  addMap: (name?: string) => CanvasMap;
  updateMap: (id: string, changes: Partial<CanvasMap>) => void;
  trashMap: (id: string) => void;
  addItem: (
    item: Omit<CalendarItem, "id" | "workspaceId" | "createdAt" | "updatedAt">,
  ) => CalendarItem;
  purgeItem: (id: string) => void;
  updateItem: (id: string, changes: Partial<CalendarItem>) => void;
  addHabit: (habit: Pick<Habit, "name" | "categoryId" | "type"> & Partial<Habit>) => Habit;
  updateHabit: (id: string, changes: Partial<Habit>) => void;
  addProject: (
    input: Parameters<
      ReturnType<typeof import("@/core/store").useDiornaStore.getState>["addProject"]
    >[0],
  ) => Project;
  updateProject: (id: string, changes: Partial<Project>) => void;
  purgeProject: (id: string) => void;
  addProjectMilestone: (
    projectId: string,
    input: { title: string; dueDate?: string; notes?: string },
  ) => unknown;
  linkProjectResource: (
    projectId: string,
    kind: "note" | "map" | "habit" | "training",
    resourceId: string,
    linked?: boolean,
  ) => void;
  addGoal: (input: Pick<Goal, "title"> & Partial<Goal>) => Goal;
  purgeGoal: (id: string) => void;
  addFocusPriority: (
    input: Parameters<
      ReturnType<typeof import("@/core/store").useDiornaStore.getState>["addFocusPriority"]
    >[0],
  ) => FocusPriority;
  deleteFocusPriority: (id: string) => void;
  addFocusSession: (
    input: Parameters<
      ReturnType<typeof import("@/core/store").useDiornaStore.getState>["addFocusSession"]
    >[0],
  ) => FocusSession;
  deleteFocusSession: (id: string) => void;
  openTab: (tab: {
    module: "notes" | "maps" | "calendar" | "daily" | "projects" | "focus";
    title: string;
    entityId?: string;
  }) => void;
}

export interface AiChangeSet {
  notes: string[];
  maps: string[];
  items: string[];
  habits: string[];
  projects: string[];
  goals: string[];
  focusPriorities: string[];
  focusSessions: string[];
  updatedMaps: CanvasMap[];
  updatedProjects: Project[];
  created: Array<{
    module: "notes" | "maps" | "calendar" | "daily" | "projects" | "focus";
    id: string;
    title: string;
  }>;
}

export interface AiExecutionOptions {
  mapNoteOrganization?: AiMapNoteOrganization;
  mapFolderRoot?: string;
  targetMapId?: string;
}

export function applyAiPlan(
  plan: AiPlan,
  store: DiornaAiStore,
  options: AiExecutionOptions = {},
): AiChangeSet {
  const changes: AiChangeSet = {
    notes: [],
    maps: [],
    items: [],
    habits: [],
    projects: [],
    goals: [],
    focusPriorities: [],
    focusSessions: [],
    updatedMaps: [],
    updatedProjects: [],
    created: [],
  };
  if (options.targetMapId) {
    const mapOperations = plan.operations.filter((operation) => operation.type === "create_map");
    const unsupported = plan.operations.filter(
      (operation) => operation.type !== "create_map" && operation.type !== "create_note",
    );
    if (mapOperations.length !== 1 || unsupported.length)
      throw new Error(
        "A Map restructuring plan must contain exactly one Map and optional supporting notes.",
      );
  }
  const createdNotes = new Map<string, Note>();
  const createdResources = new Map<
    string,
    { kind: "note" | "map" | "calendar" | "habit" | "project"; id: string }
  >();
  const mapTagsByNoteOperation = new Map<string, Set<string>>();
  const mapFolderByNoteOperation = new Map<string, string>();
  const organization = options.mapNoteOrganization ?? "tags";
  for (const operation of plan.operations) {
    if (operation.type !== "create_map") continue;
    const groupTag = mapGroupTag(operation.name);
    const groupFolder = mapGroupFolder(options.mapFolderRoot, operation.name);
    for (const node of operation.nodes) {
      if (!node.noteOperationId) continue;
      if (organization !== "folder") {
        const tags = mapTagsByNoteOperation.get(node.noteOperationId) ?? new Set<string>();
        tags.add(groupTag);
        mapTagsByNoteOperation.set(node.noteOperationId, tags);
      }
      if (organization !== "tags" && !mapFolderByNoteOperation.has(node.noteOperationId))
        mapFolderByNoteOperation.set(node.noteOperationId, groupFolder);
    }
  }
  for (const operation of plan.operations) {
    if (operation.type !== "upsert_project") continue;
    const projectTag = `project/${slugSegment(operation.name, 54) || "generated"}`;
    const projectFolder = `Projects/${slugSegment(operation.name, 80) || "generated-project"}`;
    for (const operationId of operation.linkedOperationIds) {
      const linked = plan.operations.find((entry) => entry.id === operationId);
      if (linked?.type !== "create_note") continue;
      const tags = mapTagsByNoteOperation.get(operationId) ?? new Set<string>();
      tags.add(projectTag);
      mapTagsByNoteOperation.set(operationId, tags);
      if (!mapFolderByNoteOperation.has(operationId))
        mapFolderByNoteOperation.set(operationId, projectFolder);
    }
  }
  try {
    for (const operation of plan.operations) {
      if (operation.type !== "create_note") continue;
      const note = createNote(
        store,
        operation.title,
        operation.bodyMarkdown,
        [...operation.tags, ...(mapTagsByNoteOperation.get(operation.id) ?? [])],
        changes,
        mapFolderByNoteOperation.get(operation.id),
      );
      createdNotes.set(operation.id, note);
      createdResources.set(operation.id, { kind: "note", id: note.id });
    }
    for (const operation of plan.operations) {
      if (operation.type === "create_note") {
        continue;
      } else if (operation.type === "create_map") {
        const map = createMap(store, operation, createdNotes, changes, options);
        createdResources.set(operation.id, { kind: "map", id: map.id });
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
        createdResources.set(operation.id, { kind: "calendar", id: item.id });
      } else if (operation.type === "create_habit") {
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
        createdResources.set(operation.id, { kind: "habit", id: habit.id });
      }
    }
    for (const operation of plan.operations) {
      if (operation.type !== "upsert_project") continue;
      const existing = operation.existingProjectId
        ? store.projects.find(
            (project) =>
              project.id === operation.existingProjectId &&
              project.workspaceId === store.activeWorkspaceId &&
              !project.archived,
          )
        : undefined;
      let goalId: string | undefined;
      if (operation.goalTitle) {
        const goal = store.goals.find(
          (entry) =>
            entry.workspaceId === store.activeWorkspaceId &&
            entry.status !== "cancelled" &&
            entry.title.toLocaleLowerCase() === operation.goalTitle!.toLocaleLowerCase(),
        );
        if (goal) goalId = goal.id;
        else {
          const createdGoal = store.addGoal({
            title: operation.goalTitle,
            purpose: `Direction supported by ${operation.name}.`,
            successDefinition: operation.outcome,
            horizon: "quarter",
          });
          goalId = createdGoal.id;
          changes.goals.push(createdGoal.id);
        }
      }
      let projectId: string;
      if (existing) {
        changes.updatedProjects.push(structuredClone(existing));
        store.updateProject(existing.id, {
          name: operation.name,
          outcome: operation.outcome,
          description: operation.description,
          kind: operation.kind,
          health: operation.health,
          nextAction: operation.nextAction,
          stakeholders: operation.stakeholders,
          tags: [...new Set([...existing.tags, ...operation.tags, "ai-planned"])],
          ...(operation.targetDate ? { targetDate: operation.targetDate } : {}),
          ...(goalId ? { goalId } : {}),
        });
        const existingMilestones = new Set(
          existing.milestones.map((milestone) => milestone.title.toLocaleLowerCase()),
        );
        for (const title of operation.milestoneTitles)
          if (!existingMilestones.has(title.toLocaleLowerCase()))
            store.addProjectMilestone(existing.id, { title });
        projectId = existing.id;
      } else {
        const project = store.addProject({
          name: operation.name,
          outcome: operation.outcome,
          description: operation.description,
          kind: operation.kind,
          status: "active",
          health: operation.health,
          nextAction: operation.nextAction,
          stakeholders: operation.stakeholders,
          tags: [...new Set([...operation.tags, "ai-planned"])],
          ...(operation.targetDate ? { targetDate: operation.targetDate } : {}),
          ...(goalId ? { goalId } : {}),
          milestones: operation.milestoneTitles.map((title) => ({ title })),
        });
        projectId = project.id;
        changes.projects.push(project.id);
      }
      for (const operationId of operation.linkedOperationIds) {
        const resource = createdResources.get(operationId);
        if (!resource) continue;
        if (resource.kind === "calendar") store.updateItem(resource.id, { projectId });
        else if (resource.kind !== "project")
          store.linkProjectResource(
            projectId,
            resource.kind === "habit" ? "habit" : resource.kind,
            resource.id,
          );
      }
      changes.created.push({
        module: "projects",
        id: projectId,
        title: operation.name,
      });
      createdResources.set(operation.id, { kind: "project", id: projectId });
    }
    for (const operation of plan.operations) {
      if (operation.type !== "create_focus_block") continue;
      const source = operation.sourceId ? createdResources.get(operation.sourceId) : undefined;
      const sourceId = source?.id ?? operation.sourceId ?? undefined;
      const sourceType =
        source?.kind === "calendar"
          ? "calendar"
          : source?.kind === "project"
            ? "project"
            : source?.kind === "note"
              ? "note"
              : source?.kind === "map"
                ? "map"
                : source?.kind === "habit"
                  ? "habit"
                  : operation.sourceType;
      let priorityId: string | undefined;
      if (operation.priorityDate) {
        const priority = store.addFocusPriority({
          date: operation.priorityDate,
          title: operation.title,
          sourceType,
          ...(sourceId ? { sourceId } : {}),
          plannedMinutes: operation.plannedMinutes,
        });
        priorityId = priority.id;
        changes.focusPriorities.push(priority.id);
      }
      let calendarItemId: string | undefined;
      if (operation.scheduledAt) {
        const categoryId = resolveCategory(store, "Focus");
        const start = new Date(operation.scheduledAt);
        const calendar = store.addItem({
          kind: "event",
          title: `Focus · ${operation.title}`,
          description: operation.intention,
          categoryId,
          startAt: operation.scheduledAt,
          endAt: new Date(start.getTime() + operation.plannedMinutes * 60_000).toISOString(),
          allDay: false,
          priority: "none",
          subtasks: [],
          ...(sourceType === "project" && sourceId ? { projectId: sourceId } : {}),
          rruleExceptions: [],
          reminders: [5],
        });
        calendarItemId = calendar.id;
        changes.items.push(calendar.id);
        changes.created.push({ module: "calendar", id: calendar.id, title: calendar.title });
      }
      const session = store.addFocusSession({
        title: operation.title,
        intention: operation.intention,
        mode: operation.mode,
        plannedMinutes: operation.plannedMinutes,
        sourceType,
        ...(sourceId ? { sourceId } : {}),
        ...(priorityId ? { priorityId } : {}),
        ...(calendarItemId ? { calendarItemId } : {}),
        ...(operation.scheduledAt ? { scheduledAt: operation.scheduledAt } : {}),
        distractionShield: operation.distractionShield,
        tags: [...new Set([...operation.tags, "ai-planned"])],
      });
      changes.focusSessions.push(session.id);
      changes.created.push({ module: "focus", id: session.id, title: session.title });
    }
    return changes;
  } catch (error) {
    undoAiChangeSet(store, changes);
    throw error;
  }
}

export function undoAiChangeSet(store: DiornaAiStore, changes: AiChangeSet): void {
  changes.updatedProjects.forEach((project) =>
    store.updateProject(project.id, structuredClone(project)),
  );
  changes.projects.forEach((id) => store.purgeProject(id));
  changes.goals.forEach((id) => store.purgeGoal(id));
  changes.focusSessions.forEach((id) => store.deleteFocusSession(id));
  changes.focusPriorities.forEach((id) => store.deleteFocusPriority(id));
  changes.items.forEach((id) => store.purgeItem(id));
  changes.habits.forEach((id) => store.updateHabit(id, { archived: true }));
  changes.maps.forEach((id) => store.trashMap(id));
  changes.updatedMaps.forEach((map) =>
    store.updateMap(map.id, {
      name: map.name,
      path: map.path,
      nodes: structuredClone(map.nodes),
      edges: structuredClone(map.edges),
      ...(map.parentMapId ? { parentMapId: map.parentMapId } : {}),
      ...(map.trashedAt ? { trashedAt: map.trashedAt } : {}),
    }),
  );
  changes.notes.forEach((id) => store.trashNote(id));
}

function createNote(
  store: DiornaAiStore,
  title: string,
  markdown: string,
  tags: string[],
  changes: AiChangeSet,
  folder?: string,
): Note {
  const note = store.addNote(title, folder);
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
  options: AiExecutionOptions,
): CanvasMap {
  const implicitNotes = new Map<string, Note>();
  const groupTag = mapGroupTag(operation.name);
  const organization = options.mapNoteOrganization ?? "tags";
  const groupFolder =
    organization === "tags" ? undefined : mapGroupFolder(options.mapFolderRoot, operation.name);
  for (const node of operation.nodes) {
    if (node.kind !== "note" || node.noteOperationId || node.mentionedNoteId) continue;
    implicitNotes.set(
      node.id,
      createNote(
        store,
        node.title,
        node.body ?? `# ${node.title}\n`,
        organization === "folder" ? [] : [groupTag],
        changes,
        groupFolder,
      ),
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
  const nodePositions = new Map(operation.nodes.map((node, index) => [node.id, nodes[index]!]));
  const edges: CanvasEdge[] = operation.edges.flatMap((edge) => {
    const fromNode = nodeIds.get(edge.from);
    const toNode = nodeIds.get(edge.to);
    const fromPosition = nodePositions.get(edge.from);
    const toPosition = nodePositions.get(edge.to);
    const sides =
      fromPosition && toPosition
        ? connectionSides(fromPosition.x, fromPosition.y, toPosition.x, toPosition.y)
        : { fromSide: "right" as const, toSide: "left" as const };
    return fromNode && toNode
      ? [
          {
            id: createId("edge"),
            fromNode,
            toNode,
            fromSide: sides.fromSide,
            toSide: sides.toSide,
            ...(edge.label ? { label: edge.label } : {}),
            diorna: { routing: "bezier" as const, arrowheads: "one-way" as const, width: 1.5 },
          },
        ]
      : [];
  });
  const target = options.targetMapId
    ? store.maps.find(
        (entry) =>
          entry.id === options.targetMapId &&
          entry.workspaceId === store.activeWorkspaceId &&
          !entry.trashedAt,
      )
    : undefined;
  if (options.targetMapId && !target)
    throw new Error("The Map selected for restructuring is no longer available.");
  if (target) {
    const preservedNodes = target.nodes.filter((node) => !isAiRestructurableNode(node));
    const preservedIds = new Set(preservedNodes.map((node) => node.id));
    const preservedEdges = target.edges.filter(
      (edge) => preservedIds.has(edge.fromNode) && preservedIds.has(edge.toNode),
    );
    const centralNode = nodes.find((node) => node.diorna?.locked) ?? nodes[0];
    const bridgedEdges = centralNode
      ? target.edges.flatMap((edge) => {
          const fromPreserved = preservedIds.has(edge.fromNode);
          const toPreserved = preservedIds.has(edge.toNode);
          if (fromPreserved === toPreserved) return [];
          const fromNode = fromPreserved ? edge.fromNode : centralNode.id;
          const toNode = toPreserved ? edge.toNode : centralNode.id;
          const preservedNode = preservedNodes.find((node) =>
            fromPreserved ? node.id === fromNode : node.id === toNode,
          );
          const fromPosition = fromPreserved ? preservedNode : centralNode;
          const toPosition = toPreserved ? preservedNode : centralNode;
          if (!fromPosition || !toPosition) return [];
          const sides = connectionSides(fromPosition.x, fromPosition.y, toPosition.x, toPosition.y);
          return [
            {
              ...edge,
              id: createId("edge"),
              fromNode,
              toNode,
              fromSide: sides.fromSide,
              toSide: sides.toSide,
              label: edge.label || "attachment",
            },
          ];
        })
      : [];
    changes.updatedMaps.push(structuredClone(target));
    store.updateMap(target.id, {
      nodes: [...nodes, ...preservedNodes],
      edges: [...edges, ...preservedEdges, ...bridgedEdges],
    });
    changes.created.push({ module: "maps", id: target.id, title: target.name });
    return {
      ...target,
      nodes: [...nodes, ...preservedNodes],
      edges: [...edges, ...preservedEdges, ...bridgedEdges],
    };
  }
  const map = store.addMap(operation.name);
  store.updateMap(map.id, { nodes, edges });
  changes.maps.push(map.id);
  changes.created.push({ module: "maps", id: map.id, title: map.name });
  return { ...map, nodes, edges };
}

function isAiRestructurableNode(node: CanvasNode): boolean {
  return (
    node.type === "text" || node.diorna?.nodeType === "text" || node.diorna?.nodeType === "note"
  );
}

function layoutMap(operation: AiMapOperation): Map<string, { x: number; y: number }> {
  const root = operation.nodes.find((node) => node.locked) ?? operation.nodes[0]!;
  const levels = new Map<string, number>([[root.id, 0]]);
  const branches = new Map<string, number>();
  const parents = new Map<string, string>();
  const queue = [root.id];
  while (queue.length) {
    const current = queue.shift()!;
    const level = levels.get(current) ?? 0;
    for (const edge of operation.edges.filter((entry) => entry.from === current)) {
      if (levels.has(edge.to)) continue;
      levels.set(edge.to, level + 1);
      parents.set(edge.to, current);
      queue.push(edge.to);
    }
  }
  const rootChildren = operation.nodes.filter((node) => parents.get(node.id) === root.id);
  rootChildren.forEach((node, index) => branches.set(node.id, index));
  for (const node of operation.nodes) {
    if (node.id === root.id || branches.has(node.id)) continue;
    let ancestor = node.id;
    while (parents.has(ancestor) && parents.get(ancestor) !== root.id)
      ancestor = parents.get(ancestor)!;
    branches.set(node.id, branches.get(ancestor) ?? 0);
  }
  const grouped = new Map<string, string[]>();
  for (const node of operation.nodes) {
    if (node.id === root.id) continue;
    const key = `${branches.get(node.id) ?? 0}:${levels.get(node.id) ?? 1}`;
    grouped.set(key, [...(grouped.get(key) ?? []), node.id]);
  }
  const branchCount = Math.max(1, rootChildren.length);
  const positions = new Map<string, { x: number; y: number }>([[root.id, { x: 0, y: 0 }]]);
  for (const node of operation.nodes) {
    if (node.id === root.id) continue;
    const level = levels.get(node.id) ?? 1;
    const branch = branches.get(node.id) ?? 0;
    const siblings = grouped.get(`${branch}:${level}`) ?? [node.id];
    const siblingIndex = siblings.indexOf(node.id);
    const baseAngle = -Math.PI / 2 + (branch * Math.PI * 2) / branchCount;
    const angle = baseAngle + (siblingIndex - (siblings.length - 1) / 2) * 0.2;
    const radiusX = 500 + (level - 1) * 400;
    const radiusY = 340 + (level - 1) * 300;
    positions.set(node.id, {
      x: Math.round(Math.cos(angle) * radiusX),
      y: Math.round(Math.sin(angle) * radiusY),
    });
  }
  return positions;
}

function connectionSides(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Required<Pick<CanvasEdge, "fromSide" | "toSide">> {
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  if (Math.abs(deltaX) >= Math.abs(deltaY))
    return deltaX >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  return deltaY >= 0
    ? { fromSide: "bottom", toSide: "top" }
    : { fromSide: "top", toSide: "bottom" };
}

function mapGroupTag(mapName: string): string {
  return `map/${slugSegment(mapName, 54) || "generated"}`;
}

function mapGroupFolder(root: string | undefined, mapName: string): string {
  const cleanRoot = (root || "AI Maps")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => slugSegment(segment, 60))
    .filter(Boolean)
    .join("/");
  const cleanMap = slugSegment(mapName, 80) || "generated-map";
  return `${cleanRoot || "AI Maps"}/${cleanMap}`;
}

function slugSegment(value: string, length: number): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, length);
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
