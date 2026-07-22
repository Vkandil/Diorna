import { create } from "zustand";
import { persist } from "zustand/middleware";
import { formatISO, subDays } from "date-fns";
import type {
  AppSettings,
  CalendarItem,
  CanvasMap,
  Category,
  Course,
  Flashcard,
  FlashcardGrade,
  Habit,
  HabitEntry,
  Id,
  Metric,
  MetricEntry,
  ModuleId,
  Note,
  Recap,
  ReferenceRecord,
  ReviewLog,
  StudyTemplate,
  Workspace,
} from "@/shared/models";
import { createId } from "@/shared/id";
import {
  persistNativeCanvas,
  deleteNativeWorkspace,
  persistNativeNote,
  persistNativeSettings,
  persistNativeStructuredState,
  trashNativeFile,
  isTauri,
} from "@/core/native";
import { rewriteWikiLinks } from "@/modules/notes/logic";
import { applyTemplate } from "@/modules/notes/logic";
import { extractNoteFlashcards } from "@/modules/student/flashcards";
import { reviewCard } from "@/modules/student/spacedRepetition";
import {
  extractDatedNoteTasks,
  noteTaskDueAt,
  setDatedNoteTaskChecked,
} from "@/modules/calendar/noteTasks";
import { persistStorage } from "@/core/persistStorage";
import { OPENROUTER_ENDPOINT, OPENROUTER_MODEL } from "@/shared/recapConfig";

export interface TabState {
  id: string;
  module: ModuleId;
  title: string;
  entityId?: string;
  pinned: boolean;
}

export interface PaneState {
  id: string;
  tabIds: string[];
  activeTabId: string;
}

export type PaneLayoutNode =
  | { kind: "pane"; paneId: string }
  | {
      kind: "split";
      id: string;
      direction: "horizontal" | "vertical";
      ratio: number;
      first: PaneLayoutNode;
      second: PaneLayoutNode;
    };

interface WorkspaceSession {
  tabs: TabState[];
  panes: PaneState[];
  paneLayout: PaneLayoutNode;
  activePaneId: string;
  activeTabId: string;
  activeModule: ModuleId;
  recentTabIds: string[];
}

function replacePaneNode(
  node: PaneLayoutNode,
  paneId: string,
  replacement: PaneLayoutNode,
): PaneLayoutNode {
  if (node.kind === "pane") return node.paneId === paneId ? replacement : node;
  return {
    ...node,
    first: replacePaneNode(node.first, paneId, replacement),
    second: replacePaneNode(node.second, paneId, replacement),
  };
}

function removePaneNode(node: PaneLayoutNode, paneId: string): PaneLayoutNode | undefined {
  if (node.kind === "pane") return node.paneId === paneId ? undefined : node;
  const first = removePaneNode(node.first, paneId);
  const second = removePaneNode(node.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function updateSplitRatio(node: PaneLayoutNode, splitId: string, ratio: number): PaneLayoutNode {
  if (node.kind === "pane") return node;
  if (node.id === splitId) return { ...node, ratio };
  return {
    ...node,
    first: updateSplitRatio(node.first, splitId, ratio),
    second: updateSplitRatio(node.second, splitId, ratio),
  };
}

interface DiornaState {
  onboardingComplete: boolean;
  activeWorkspaceId: Id;
  activeModule: ModuleId;
  sidebarOpen: boolean;
  sidebarWidth: number;
  rightPanelOpen: boolean;
  selectedCalendarItemId: Id | undefined;
  selectedDailyHabitId: Id | undefined;
  commandPaletteOpen: boolean;
  tabs: TabState[];
  activeTabId: string;
  recentTabIds: string[];
  panes: PaneState[];
  paneLayout: PaneLayoutNode;
  activePaneId: string;
  workspaceSessions: Record<Id, WorkspaceSession>;
  workspaces: Workspace[];
  categories: Category[];
  courses: Course[];
  templates: StudyTemplate[];
  flashcards: Flashcard[];
  reviewLogs: ReviewLog[];
  references: ReferenceRecord[];
  notes: Note[];
  maps: CanvasMap[];
  items: CalendarItem[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  metrics: Metric[];
  metricEntries: MetricEntry[];
  recaps: Recap[];
  settings: AppSettings;
  finishOnboarding: (
    workspaces: Workspace[],
    theme: AppSettings["theme"],
    loadSample: boolean,
  ) => Promise<void>;
  setWorkspace: (id: Id) => void;
  setModule: (module: ModuleId) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleRightPanel: () => void;
  selectCalendarItem: (id?: Id) => void;
  selectDailyHabit: (id?: Id) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  openTab: (
    tab: Omit<TabState, "id" | "pinned"> & Partial<Pick<TabState, "id" | "pinned">>,
  ) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setActivePane: (id: string) => void;
  setTabPinned: (id: string, pinned: boolean) => void;
  reorderTabs: (sourceId: string, targetId: string) => void;
  splitPane: (direction: "horizontal" | "vertical") => void;
  closePane: (id: string) => void;
  setSplitRatio: (id: string, ratio: number) => void;
  addNote: (title?: string) => Note;
  duplicateNote: (id: Id) => Note | undefined;
  trashNote: (id: Id) => void;
  restoreFileTrash: (kind: "notes" | "maps", originalPath: string, restoredPath?: string) => void;
  purgeFileTrash: (kind: "notes" | "maps", originalPath: string) => void;
  updateNote: (id: Id, changes: Partial<Note>) => void;
  addCategory: (name?: string) => Category;
  updateCategory: (id: Id, changes: Partial<Category>) => void;
  deleteCategory: (id: Id) => void;
  moveCategory: (id: Id, direction: -1 | 1) => void;
  addCourse: (course: Omit<Course, "id" | "workspaceId" | "sortOrder">) => Course;
  updateCourse: (id: Id, changes: Partial<Course>) => void;
  addTemplate: (name?: string) => StudyTemplate;
  updateTemplate: (id: Id, changes: Partial<StudyTemplate>) => void;
  createNoteFromTemplate: (templateId: Id, title: string, courseId?: Id) => Note | undefined;
  gradeFlashcard: (id: Id, grade: FlashcardGrade) => void;
  addReferences: (references: Array<Omit<ReferenceRecord, "workspaceId">>) => void;
  addMap: (name?: string) => CanvasMap;
  duplicateMap: (id: Id) => CanvasMap | undefined;
  trashMap: (id: Id) => void;
  updateMap: (id: Id, changes: Partial<CanvasMap>) => void;
  addItem: (
    item: Omit<CalendarItem, "id" | "workspaceId" | "createdAt" | "updatedAt">,
  ) => CalendarItem;
  updateItem: (id: Id, changes: Partial<CalendarItem>) => void;
  restoreItem: (id: Id) => void;
  purgeItem: (id: Id) => void;
  purgeExpiredTrash: (now?: string) => void;
  addHabit: (habit: Pick<Habit, "name" | "categoryId" | "type"> & Partial<Habit>) => Habit;
  updateHabit: (
    id: Id,
    changes: Omit<Partial<Habit>, "unit" | "target" | "startDate" | "endDate"> & {
      unit?: string | null;
      target?: number | null;
      startDate?: string | null;
      endDate?: string | null;
    },
  ) => void;
  moveHabit: (id: Id, targetId: Id) => void;
  updateHabitEntry: (habitId: Id, date: string, value: boolean | number) => void;
  updateHabitEntryNote: (habitId: Id, date: string, note?: string) => void;
  clearHabitEntry: (habitId: Id, date: string) => void;
  addMetric: (metric: Pick<Metric, "name" | "unit" | "categoryId"> & Partial<Metric>) => Metric;
  updateMetric: (
    id: Id,
    changes: Omit<Partial<Metric>, "target"> & { target?: number | null },
  ) => void;
  deleteMetric: (id: Id) => void;
  updateMetricEntry: (metricId: Id, date: string, value: number) => void;
  clearMetricEntry: (metricId: Id, date: string) => void;
  updateSettings: (changes: Partial<AppSettings>) => void;
  hydrateStructured: (snapshot: {
    workspaces: Workspace[];
    categories: Category[];
    courses: Course[];
    templates: StudyTemplate[];
    flashcards: Flashcard[];
    reviewLogs: ReviewLog[];
    references: ReferenceRecord[];
    items: CalendarItem[];
    habits: Habit[];
    habitEntries: HabitEntry[];
    metrics: Metric[];
    metricEntries: MetricEntry[];
    recaps: Recap[];
  }) => void;
  hydrateFileContent: (content: { notes: Note[]; maps: CanvasMap[] }) => void;
  addWorkspace: (name: string, color: string) => void;
  renameWorkspace: (id: Id, name: string) => void;
  updateWorkspace: (id: Id, changes: Pick<Partial<Workspace>, "name" | "color" | "kind">) => void;
  moveWorkspace: (id: Id, direction: -1 | 1) => void;
  deleteWorkspace: (id: Id) => void;
  resetAll: () => void;
}

const now = new Date();
const isoNow = now.toISOString();
const today = formatISO(now, { representation: "date" });
const studentId = "workspace-student";
const personalId = "workspace-personal";

const defaultSettings: AppSettings = {
  language: "en",
  theme: "system",
  accentColor: "#5b5bd6",
  density: "compact",
  interfaceFont: "system-ui",
  editorFont: "system-ui",
  editorFontSize: 15,
  editorLineWidth: 760,
  minimizeToTray: true,
  startWithWindows: false,
  defaultWorkspaceId: "",
  updateChannel: "stable",
  vaultLocation: "Documents\\Diorna",
  weekStartsOn: 1,
  calendarVisibleStart: 7,
  calendarVisibleEnd: 23,
  defaultEventDurationMinutes: 60,
  defaultReminderMinutes: 10,
  dailyWindow: "plus-minus-3",
  allowFutureCheckIn: false,
  dailyWeekStartsOn: 1,
  spellCheck: true,
  spellCheckLanguage: "en-US",
  autoPairBrackets: true,
  tabBehavior: "indent",
  defaultNoteFolder: "notes",
  defaultTemplateId: "",
  recapProvider: "none",
  recapEndpoint: OPENROUTER_ENDPOINT,
  recapModel: OPENROUTER_MODEL,
  recapTemperature: 0.2,
  recapMaxTokens: 1600,
  recapAggregatesOnly: true,
  recapAutoMonthly: true,
  recapAutoYearly: true,
  recapConsentedProviders: [],
  linkPreviewEnabled: false,
  updateEnabled: true,
  backupLocation: "Documents\\Diorna Backups",
  backupFrequency: "daily",
  backupRetention: 10,
  dashboardWidgetOrder: {
    [studentId]: ["score", "agenda", "courses", "flashcards", "streaks", "recent", "recap"],
    [personalId]: ["score", "agenda", "projects", "streaks", "recent", "recap"],
  },
  dashboardHiddenWidgets: {},
  keymap: {
    commandPalette: "Ctrl+K",
    quickCapture: "Ctrl+Alt+Space",
    toggleSidebar: "Ctrl+B",
    closeTab: "Ctrl+W",
    nextRecentTab: "Ctrl+Tab",
    notes: "Ctrl+1",
    maps: "Ctrl+2",
    calendar: "Ctrl+3",
    daily: "Ctrl+4",
    recap: "Ctrl+5",
    home: "Ctrl+0",
    settings: "Ctrl+,",
    newNote: "Ctrl+N",
    newTask: "Ctrl+Shift+T",
    toggleContext: "Ctrl+Shift+B",
    splitHorizontal: "Ctrl+\\",
    splitVertical: "Ctrl+Shift+\\",
    workspace1: "Ctrl+Shift+1",
    workspace2: "Ctrl+Shift+2",
    workspace3: "Ctrl+Shift+3",
    workspace4: "Ctrl+Shift+4",
    workspace5: "Ctrl+Shift+5",
    workspace6: "Ctrl+Shift+6",
    workspace7: "Ctrl+Shift+7",
    workspace8: "Ctrl+Shift+8",
    workspace9: "Ctrl+Shift+9",
  },
};

const baseWorkspaces: Workspace[] = [
  {
    id: studentId,
    name: "Student",
    color: "#5b5bd6",
    folderName: "Student",
    sortOrder: 0,
    kind: "student",
    createdAt: isoNow,
  },
  {
    id: personalId,
    name: "Personal",
    color: "#168a68",
    folderName: "Personal",
    sortOrder: 1,
    kind: "personal",
    createdAt: isoNow,
  },
];

const categorySeeds: Array<[string, string[], string[]]> = [
  [
    studentId,
    ["Courses", "Assignments", "Exams", "Revision", "Admin"],
    ["#5b5bd6", "#bd6b28", "#c0445c", "#8371cf", "#657287"],
  ],
  [
    personalId,
    ["Work", "Projects", "Sport", "Health", "Social", "Errands"],
    ["#3f70b5", "#795ac8", "#168a68", "#c15a64", "#b47619", "#677585"],
  ],
];
const baseCategories: Category[] = categorySeeds.flatMap(([workspaceId, names, colors]) =>
  names.map((name, index) => ({
    id: `${workspaceId}-${name.toLowerCase()}`,
    workspaceId,
    name,
    color: colors[index]!,
    icon: ["BookOpen", "Briefcase", "Dumbbell", "Heart", "Users", "ListTodo"][index] ?? "Tag",
    sortOrder: index,
  })),
);

const builtInTemplates: StudyTemplate[] = [
  {
    id: "template-lecture",
    workspaceId: studentId,
    name: "Lecture",
    body: "<h1>{{title}}</h1><p><strong>{{course}}</strong> · {{date}} · Week {{week}}</p><h2>Key ideas</h2><p>{{cursor}}</p><h2>Questions</h2><ul><li></li></ul><h2>Summary</h2><p></p>",
    builtIn: true,
    sortOrder: 0,
  },
  {
    id: "template-exercise",
    workspaceId: studentId,
    name: "Exercise session",
    body: "<h1>{{title}}</h1><p>{{course}} · {{date}}</p><h2>Objectives</h2><p></p><h2>Exercises</h2><ol><li>{{cursor}}</li></ol><h2>Mistakes to revisit</h2><p></p>",
    builtIn: true,
    sortOrder: 1,
  },
  {
    id: "template-exam",
    workspaceId: studentId,
    name: "Exam preparation",
    body: '<h1>{{title}}</h1><p>{{course}} · {{semester}}</p><h2>Coverage</h2><ul data-type="taskList"><li data-checked="false"><p>{{cursor}}</p></li></ul><h2>Formulae</h2><p></p><h2>Weak areas</h2><p></p>',
    builtIn: true,
    sortOrder: 2,
  },
  {
    id: "template-project",
    workspaceId: studentId,
    name: "Project",
    body: '<h1>{{title}}</h1><p>{{course}} · {{date}}</p><h2>Outcome</h2><p>{{cursor}}</p><h2>Milestones</h2><ul data-type="taskList"><li data-checked="false"><p></p></li></ul><h2>References</h2><p></p>',
    builtIn: true,
    sortOrder: 3,
  },
];

function sampleData() {
  const sportId = `${personalId}-sport`;
  const projectsId = `${personalId}-projects`;
  const coursesId = `${studentId}-courses`;
  const courseId = "course-distributed-systems";
  const notes: Note[] = [
    {
      id: "note-welcome",
      workspaceId: studentId,
      path: "notes/Welcome.md",
      title: "Welcome to Diorna",
      body: "<h1>Welcome to Diorna</h1><p>Your notes are Markdown files you own. Press <strong>Ctrl+K</strong> to find anything.</p><h2>Start here</h2><ul><li>Create a lecture note</li><li>Link ideas with [[wiki-links]]</li><li>Review due flashcards</li></ul>",
      tags: ["getting-started"],
      properties: {},
      createdAt: isoNow,
      updatedAt: isoNow,
      wordCount: 29,
      starred: true,
    },
    {
      id: "note-project",
      workspaceId: personalId,
      path: "notes/Projects/CartUnlock.md",
      title: "CartUnlock",
      body: "<h1>CartUnlock</h1><p>Project notes, open questions, and next steps.</p><h2>This week</h2><ul><li>Validate the onboarding flow</li><li>Ship the pricing experiment</li></ul>",
      tags: ["project/cartunlock"],
      properties: {},
      createdAt: isoNow,
      updatedAt: isoNow,
      wordCount: 21,
      starred: true,
    },
  ];
  const courses: Course[] = [
    {
      id: courseId,
      workspaceId: studentId,
      name: "Distributed Systems",
      code: "INFO-H515",
      color: "#5b5bd6",
      semester: "Autumn 2026",
      instructor: "Prof. Martin",
      credits: 5,
      schedule: "Monday 10:00",
      sortOrder: 0,
    },
  ];
  const habits: Habit[] = [
    {
      id: "habit-training",
      workspaceId: personalId,
      name: "Training",
      categoryId: sportId,
      type: "checkbox",
      activeWeekdays: [1, 3, 5],
      description: "Strength programme",
      sortOrder: 0,
      archived: false,
    },
    {
      id: "habit-stretching",
      workspaceId: personalId,
      name: "Stretching",
      categoryId: sportId,
      type: "checkbox",
      activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
      description: "Ten-minute mobility routine",
      sortOrder: 1,
      archived: false,
    },
    {
      id: "habit-deep-work",
      workspaceId: personalId,
      name: "Deep work",
      categoryId: projectsId,
      type: "quantity",
      unit: "min",
      target: 60,
      activeWeekdays: [1, 2, 3, 4, 5],
      description: "",
      sortOrder: 2,
      archived: false,
    },
    {
      id: "habit-review",
      workspaceId: studentId,
      name: "Review flashcards",
      categoryId: coursesId,
      type: "checkbox",
      activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
      description: "",
      sortOrder: 0,
      archived: false,
    },
  ];
  const habitEntries: HabitEntry[] = [];
  for (let offset = 0; offset < 30; offset += 1) {
    const date = formatISO(subDays(now, offset), { representation: "date" });
    habits.forEach((habit, index) => {
      if (habit.type === "quantity")
        habitEntries.push({
          workspaceId: habit.workspaceId,
          habitId: habit.id,
          date,
          done: offset % 4 !== 0,
          value: offset % 4 !== 0 ? 75 : 30,
        });
      else if ((offset + index) % 4 !== 0)
        habitEntries.push({
          workspaceId: habit.workspaceId,
          habitId: habit.id,
          date,
          done: true,
        });
    });
  }
  const maps: CanvasMap[] = [
    {
      id: "map-gym",
      workspaceId: personalId,
      name: "Gym",
      path: "maps/Gym.canvas",
      updatedAt: isoNow,
      nodes: [
        {
          id: "node-programme",
          type: "text",
          x: 80.5,
          y: 100.25,
          width: 240,
          height: 120,
          text: "Programme\n\nFour-day strength programme",
          color: "3",
          diorna: { nodeType: "submap", icon: "🏋️" },
        },
        {
          id: "node-session-a",
          type: "text",
          x: 440.75,
          y: 45.5,
          width: 200,
          height: 100,
          text: "Session A\n\nBench · Row · Squat",
          color: "4",
          diorna: { nodeType: "text" },
        },
        {
          id: "node-session-b",
          type: "text",
          x: 440.75,
          y: 225.5,
          width: 200,
          height: 100,
          text: "Session B\n\nPress · Pull-up · Deadlift",
          color: "4",
          diorna: { nodeType: "text" },
        },
        {
          id: "node-stretching",
          type: "text",
          x: -310.25,
          y: 385.75,
          width: 230,
          height: 120,
          text: "Stretching\n\nHips · Shoulders · Ankles",
          color: "5",
          diorna: { nodeType: "text", icon: "🧘" },
        },
      ],
      edges: [
        {
          id: "edge-a",
          fromNode: "node-programme",
          toNode: "node-session-a",
          label: "Day 1",
          diorna: { routing: "bezier", arrowheads: "one-way" },
        },
        {
          id: "edge-b",
          fromNode: "node-programme",
          toNode: "node-session-b",
          label: "Day 2",
          diorna: { routing: "bezier", arrowheads: "one-way" },
        },
      ],
    },
  ];
  const items: CalendarItem[] = [
    {
      id: "item-lecture",
      workspaceId: studentId,
      kind: "event",
      title: "Distributed Systems lecture",
      description: "",
      categoryId: coursesId,
      startAt: `${today}T10:00:00.000Z`,
      endAt: `${today}T12:00:00.000Z`,
      allDay: false,
      priority: "none",
      subtasks: [],
      courseId,
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      rruleExceptions: [],
      reminders: [10],
      createdAt: isoNow,
      updatedAt: isoNow,
    },
    {
      id: "item-gym",
      workspaceId: personalId,
      kind: "event",
      title: "Gym — Session A",
      description: "",
      categoryId: sportId,
      startAt: `${today}T17:00:00.000Z`,
      endAt: `${today}T18:30:00.000Z`,
      allDay: false,
      priority: "none",
      subtasks: [],
      rruleExceptions: [],
      reminders: [30],
      createdAt: isoNow,
      updatedAt: isoNow,
    },
    {
      id: "item-release",
      workspaceId: personalId,
      kind: "task",
      title: "Release onboarding experiment",
      description: "",
      categoryId: projectsId,
      dueAt: `${today}T20:00:00.000Z`,
      allDay: false,
      priority: "high",
      subtasks: [],
      rruleExceptions: [],
      reminders: [],
      createdAt: isoNow,
      updatedAt: isoNow,
    },
  ];
  const metrics: Metric[] = [
    {
      id: "metric-bench",
      workspaceId: personalId,
      name: "Bench press",
      unit: "kg",
      categoryId: sportId,
      target: 100,
      sortOrder: 0,
    },
  ];
  const metricEntries: MetricEntry[] = [
    {
      workspaceId: personalId,
      metricId: "metric-bench",
      date: formatISO(subDays(now, 28), { representation: "date" }),
      value: 72,
    },
    {
      workspaceId: personalId,
      metricId: "metric-bench",
      date: today,
      value: 80,
    },
  ];
  return {
    notes,
    courses,
    habits,
    habitEntries,
    maps,
    items,
    metrics,
    metricEntries,
  };
}

const samples = sampleData();

const initial = {
  onboardingComplete: false,
  activeWorkspaceId: studentId,
  activeModule: "home" as ModuleId,
  sidebarOpen: true,
  sidebarWidth: 248,
  rightPanelOpen: true,
  selectedCalendarItemId: undefined,
  selectedDailyHabitId: undefined,
  commandPaletteOpen: false,
  tabs: [{ id: "home", module: "home" as ModuleId, title: "Home", pinned: true }],
  activeTabId: "home",
  recentTabIds: ["home"],
  panes: [{ id: "pane-main", tabIds: ["home"], activeTabId: "home" }],
  paneLayout: { kind: "pane" as const, paneId: "pane-main" },
  activePaneId: "pane-main",
  workspaceSessions: {},
  workspaces: baseWorkspaces,
  categories: baseCategories,
  courses: samples.courses,
  templates: builtInTemplates,
  flashcards: [] as Flashcard[],
  reviewLogs: [] as ReviewLog[],
  references: [] as ReferenceRecord[],
  notes: samples.notes,
  maps: samples.maps,
  items: samples.items,
  habits: samples.habits,
  habitEntries: samples.habitEntries,
  metrics: samples.metrics,
  metricEntries: samples.metricEntries,
  recaps: [] as Recap[],
  settings: defaultSettings,
};

function persistedSlice(state: DiornaState, includeContent: boolean) {
  const shell = {
    onboardingComplete: state.onboardingComplete,
    activeWorkspaceId: state.activeWorkspaceId,
    activeModule: state.activeModule,
    sidebarOpen: state.sidebarOpen,
    sidebarWidth: state.sidebarWidth,
    rightPanelOpen: state.rightPanelOpen,
    selectedCalendarItemId: state.selectedCalendarItemId,
    selectedDailyHabitId: state.selectedDailyHabitId,
    commandPaletteOpen: state.commandPaletteOpen,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    recentTabIds: state.recentTabIds,
    panes: state.panes,
    paneLayout: state.paneLayout,
    activePaneId: state.activePaneId,
    workspaceSessions: state.workspaceSessions,
    settings: state.settings,
  };
  if (!includeContent) return shell;
  return {
    ...shell,
    workspaces: state.workspaces,
    categories: state.categories,
    courses: state.courses,
    templates: state.templates,
    flashcards: state.flashcards,
    reviewLogs: state.reviewLogs,
    references: state.references,
    notes: state.notes,
    maps: state.maps,
    items: state.items,
    habits: state.habits,
    habitEntries: state.habitEntries,
    metrics: state.metrics,
    metricEntries: state.metricEntries,
    recaps: state.recaps,
  };
}

function structuredSnapshot(state: DiornaState) {
  return {
    workspaces: state.workspaces,
    categories: state.categories,
    courses: state.courses,
    templates: state.templates,
    flashcards: state.flashcards,
    reviewLogs: state.reviewLogs,
    references: state.references,
    items: state.items,
    habits: state.habits,
    habitEntries: state.habitEntries,
    metrics: state.metrics,
    metricEntries: state.metricEntries,
    recaps: state.recaps,
  };
}

export const useDiornaStore = create<DiornaState>()(
  persist(
    (set, get) => ({
      ...initial,
      finishOnboarding: async (requestedWorkspaces, theme, loadSample) => {
        const workspaces = requestedWorkspaces.map((workspace, sortOrder) => ({
          ...workspace,
          name: workspace.name.trim() || `Workspace ${sortOrder + 1}`,
          sortOrder,
        }));
        const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
        set((state) => ({
          onboardingComplete: true,
          activeWorkspaceId: workspaces[0]!.id,
          settings: {
            ...state.settings,
            theme,
            defaultWorkspaceId: workspaces[0]!.id,
          },
          workspaces,
          categories: [
            ...state.categories.filter((entry) => workspaceIds.has(entry.workspaceId)),
            ...workspaces
              .filter(
                (workspace) =>
                  !state.categories.some((entry) => entry.workspaceId === workspace.id),
              )
              .map((workspace) => ({
                id: createId("category"),
                workspaceId: workspace.id,
                name: "General",
                color: workspace.color,
                icon: "Tag",
                sortOrder: 0,
              })),
          ],
          courses: state.courses.filter((entry) => workspaceIds.has(entry.workspaceId)),
          templates: state.templates.filter((entry) => workspaceIds.has(entry.workspaceId)),
          recaps: state.recaps.filter((entry) => workspaceIds.has(entry.workspaceId)),
          ...(!loadSample
            ? {
                notes: [],
                maps: [],
                items: [],
                habits: [],
                habitEntries: [],
                metrics: [],
                metricEntries: [],
                flashcards: [],
                reviewLogs: [],
                references: [],
              }
            : {
                notes: state.notes.filter((entry) => workspaceIds.has(entry.workspaceId)),
                maps: state.maps.filter((entry) => workspaceIds.has(entry.workspaceId)),
                items: state.items.filter((entry) => workspaceIds.has(entry.workspaceId)),
                habits: state.habits.filter((entry) => workspaceIds.has(entry.workspaceId)),
                habitEntries: state.habitEntries.filter((entry) =>
                  workspaceIds.has(entry.workspaceId),
                ),
                metrics: state.metrics.filter((entry) => workspaceIds.has(entry.workspaceId)),
                metricEntries: state.metricEntries.filter((entry) =>
                  workspaceIds.has(entry.workspaceId),
                ),
                flashcards: state.flashcards.filter((entry) => workspaceIds.has(entry.workspaceId)),
                reviewLogs: state.reviewLogs.filter((entry) => workspaceIds.has(entry.workspaceId)),
                references: state.references.filter((entry) => workspaceIds.has(entry.workspaceId)),
              }),
        }));
        const next = get();
        await Promise.all([
          persistNativeSettings(next.settings),
          ...next.notes.map(persistNativeNote),
          ...next.maps.map(persistNativeCanvas),
        ]);
        await persistNativeStructuredState(structuredSnapshot(next));
        for (const id of [studentId, personalId]) {
          if (!workspaceIds.has(id)) await deleteNativeWorkspace(id);
        }
      },
      setWorkspace: (id) =>
        set((state) => {
          if (id === state.activeWorkspaceId) return state;
          const homeId = `home-${id}`;
          const paneId = `pane-${id}`;
          const workspaceSessions = {
            ...state.workspaceSessions,
            [state.activeWorkspaceId]: {
              tabs: state.tabs,
              panes: state.panes,
              paneLayout: state.paneLayout,
              activePaneId: state.activePaneId,
              activeTabId: state.activeTabId,
              activeModule: state.activeModule,
              recentTabIds: state.recentTabIds,
            },
          };
          const saved = workspaceSessions[id];
          return {
            activeWorkspaceId: id,
            workspaceSessions,
            ...(saved ?? {
              activeModule: "home" as ModuleId,
              tabs: [{ id: homeId, module: "home" as ModuleId, title: "Home", pinned: true }],
              activeTabId: homeId,
              recentTabIds: [homeId],
              panes: [{ id: paneId, tabIds: [homeId], activeTabId: homeId }],
              paneLayout: { kind: "pane" as const, paneId },
              activePaneId: paneId,
            }),
          };
        }),
      setModule: (module) => {
        const id = `${module}-${get().activeWorkspaceId}`;
        get().openTab({
          id,
          module,
          title: module[0]!.toUpperCase() + module.slice(1),
        });
      },
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.max(190, Math.min(420, Math.round(width))) }),
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      selectCalendarItem: (id) => set({ selectedCalendarItemId: id }),
      selectDailyHabit: (id) => set({ selectedDailyHabitId: id }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      openTab: (tab) =>
        set((state) => {
          const pane =
            state.panes.find((entry) => entry.id === state.activePaneId) ?? state.panes[0];
          if (!pane) return state;
          const existing = pane.tabIds
            .map((id) => state.tabs.find((entry) => entry.id === id))
            .find(
              (entry) =>
                entry &&
                ((tab.id && entry.id === tab.id) ||
                  (entry.module === tab.module && entry.entityId === tab.entityId)),
            );
          if (existing)
            return {
              activeTabId: existing.id,
              activeModule: existing.module,
              activePaneId: pane.id,
              panes: state.panes.map((entry) =>
                entry.id === pane.id ? { ...entry, activeTabId: existing.id } : entry,
              ),
              recentTabIds: [
                existing.id,
                ...state.recentTabIds.filter((entry) => entry !== existing.id),
              ].slice(0, 50),
            };
          const requestedId = tab.id ?? `${tab.module}-${tab.entityId ?? createId("tab")}`;
          const id = state.tabs.some((entry) => entry.id === requestedId)
            ? `${requestedId}-${createId("pane")}`
            : requestedId;
          return {
            tabs: [...state.tabs, { ...tab, id, pinned: tab.pinned ?? false }],
            activeTabId: id,
            activeModule: tab.module,
            activePaneId: pane.id,
            panes: state.panes.map((entry) =>
              entry.id === pane.id
                ? { ...entry, tabIds: [...entry.tabIds, id], activeTabId: id }
                : entry,
            ),
            recentTabIds: [id, ...state.recentTabIds.filter((entry) => entry !== id)].slice(0, 50),
          };
        }),
      closeTab: (id) =>
        set((state) => {
          const tab = state.tabs.find((entry) => entry.id === id);
          if (!tab || tab.pinned) return state;
          const pane = state.panes.find((entry) => entry.tabIds.includes(id));
          if (!pane) return state;
          const nextIds = pane.tabIds.filter((entry) => entry !== id);
          const nextId = pane.activeTabId === id ? nextIds.at(-1) : pane.activeTabId;
          if (!nextId) return state;
          const panes = state.panes.map((entry) =>
            entry.id === pane.id ? { ...entry, tabIds: nextIds, activeTabId: nextId } : entry,
          );
          const stillUsed = panes.some((entry) => entry.tabIds.includes(id));
          const tabs = stillUsed ? state.tabs : state.tabs.filter((entry) => entry.id !== id);
          const next = tabs.find((entry) => entry.id === nextId);
          const activeChanged = state.activePaneId === pane.id && state.activeTabId === id;
          return {
            tabs,
            panes,
            activeTabId: activeChanged ? (next?.id ?? state.activeTabId) : state.activeTabId,
            activeModule: activeChanged ? (next?.module ?? state.activeModule) : state.activeModule,
            recentTabIds: state.recentTabIds.filter((entry) => entry !== id),
          };
        }),
      setActiveTab: (id) =>
        set((state) => {
          const pane = state.panes.find((entry) => entry.tabIds.includes(id));
          const tab = state.tabs.find((entry) => entry.id === id);
          if (!pane || !tab) return state;
          return {
            activeTabId: id,
            activeModule: tab.module,
            activePaneId: pane.id,
            panes: state.panes.map((entry) =>
              entry.id === pane.id ? { ...entry, activeTabId: id } : entry,
            ),
            recentTabIds: [id, ...state.recentTabIds.filter((entry) => entry !== id)].slice(0, 50),
          };
        }),
      setActivePane: (id) =>
        set((state) => {
          const pane = state.panes.find((entry) => entry.id === id);
          const tab = pane && state.tabs.find((entry) => entry.id === pane.activeTabId);
          if (!pane || !tab) return state;
          return {
            activePaneId: pane.id,
            activeTabId: tab.id,
            activeModule: tab.module,
            recentTabIds: [tab.id, ...state.recentTabIds.filter((entry) => entry !== tab.id)].slice(
              0,
              50,
            ),
          };
        }),
      setTabPinned: (id, pinned) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, pinned } : tab)),
        })),
      reorderTabs: (sourceId, targetId) =>
        set((state) => {
          const pane = state.panes.find(
            (entry) => entry.tabIds.includes(sourceId) && entry.tabIds.includes(targetId),
          );
          if (!pane) return state;
          const source = pane.tabIds.indexOf(sourceId);
          const target = pane.tabIds.indexOf(targetId);
          if (source === target) return state;
          const tabIds = [...pane.tabIds];
          const [moved] = tabIds.splice(source, 1);
          if (moved) tabIds.splice(target, 0, moved);
          return {
            panes: state.panes.map((entry) =>
              entry.id === pane.id ? { ...entry, tabIds } : entry,
            ),
          };
        }),
      splitPane: (direction) =>
        set((state) => {
          if (state.panes.length >= 4) return state;
          const sourcePane =
            state.panes.find((entry) => entry.id === state.activePaneId) ?? state.panes[0];
          const sourceTab =
            sourcePane && state.tabs.find((entry) => entry.id === sourcePane.activeTabId);
          if (!sourcePane || !sourceTab) return state;
          const paneId = createId("pane");
          const tabId = `${sourceTab.id}-${paneId}`;
          const splitId = createId("split");
          const clonedTab = { ...sourceTab, id: tabId, pinned: false };
          return {
            tabs: [...state.tabs, clonedTab],
            panes: [...state.panes, { id: paneId, tabIds: [tabId], activeTabId: tabId }],
            paneLayout: replacePaneNode(state.paneLayout, sourcePane.id, {
              kind: "split",
              id: splitId,
              direction,
              ratio: 0.5,
              first: { kind: "pane", paneId: sourcePane.id },
              second: { kind: "pane", paneId },
            }),
            activePaneId: paneId,
            activeTabId: tabId,
            activeModule: clonedTab.module,
            recentTabIds: [tabId, ...state.recentTabIds].slice(0, 50),
          };
        }),
      closePane: (id) =>
        set((state) => {
          if (state.panes.length <= 1) return state;
          const pane = state.panes.find((entry) => entry.id === id);
          const paneLayout = removePaneNode(state.paneLayout, id);
          if (!pane || !paneLayout) return state;
          const panes = state.panes.filter((entry) => entry.id !== id);
          const referenced = new Set(panes.flatMap((entry) => entry.tabIds));
          const tabs = state.tabs.filter((entry) => referenced.has(entry.id));
          const nextPane = panes.find((entry) => entry.id === state.activePaneId) ?? panes[0]!;
          const next = tabs.find((entry) => entry.id === nextPane.activeTabId)!;
          return {
            panes,
            paneLayout,
            tabs,
            activePaneId: nextPane.id,
            activeTabId: next.id,
            activeModule: next.module,
            recentTabIds: state.recentTabIds.filter((entry) => referenced.has(entry)),
          };
        }),
      setSplitRatio: (id, ratio) =>
        set((state) => ({
          paneLayout: updateSplitRatio(state.paneLayout, id, Math.max(0.2, Math.min(0.8, ratio))),
        })),
      addNote: (title = "Untitled") => {
        const workspaceId = get().activeWorkspaceId;
        const settings = get().settings;
        const usedTitles = new Set(
          get()
            .notes.filter((entry) => entry.workspaceId === workspaceId && !entry.trashedAt)
            .map((entry) => entry.title.toLocaleLowerCase()),
        );
        const requestedTitle = title.trim() || "Untitled";
        let uniqueTitle = requestedTitle;
        let suffix = 2;
        while (usedTitles.has(uniqueTitle.toLocaleLowerCase())) {
          uniqueTitle = `${requestedTitle} ${suffix}`;
          suffix += 1;
        }
        const folder =
          settings.defaultNoteFolder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "notes";
        const template = get().templates.find(
          (entry) => entry.id === settings.defaultTemplateId && entry.workspaceId === workspaceId,
        );
        const note: Note = {
          id: createId("note"),
          workspaceId,
          path: `${folder.startsWith("notes") ? folder : `notes/${folder}`}/${uniqueTitle}.md`,
          title: uniqueTitle,
          body: template?.body ?? "<p></p>",
          tags: [],
          properties: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          wordCount: 0,
        };
        set((state) => ({ notes: [...state.notes, note] }));
        void persistNativeNote(note);
        return note;
      },
      duplicateNote: (id) => {
        const source = get().notes.find(
          (entry) => entry.id === id && entry.workspaceId === get().activeWorkspaceId,
        );
        if (!source) return undefined;
        const copy = get().addNote(`${source.title} copy`);
        const folder = source.path.replace(/[^/]+\.md$/, "");
        get().updateNote(copy.id, {
          body: source.body,
          tags: [...source.tags],
          properties: structuredClone(source.properties),
          wordCount: source.wordCount,
          starred: source.starred,
          path: `${folder}${copy.title}.md`,
          ...(source.courseId ? { courseId: source.courseId } : {}),
        });
        return get().notes.find((entry) => entry.id === copy.id);
      },
      trashNote: (id) => {
        const note = get().notes.find(
          (entry) => entry.id === id && entry.workspaceId === get().activeWorkspaceId,
        );
        if (!note || note.trashedAt) return;
        const trashedAt = new Date().toISOString();
        set((state) => ({
          notes: state.notes.map((entry) => (entry.id === id ? { ...entry, trashedAt } : entry)),
        }));
        void trashNativeFile(note.workspaceId, "notes", note.path.replace(/^notes[\\/]/, "")).catch(
          (error: unknown) => {
            console.error("Unable to move note to native trash", error);
            set((state) => ({
              notes: state.notes.map((entry) =>
                entry.id === id ? { ...entry, trashedAt: undefined } : entry,
              ),
            }));
          },
        );
      },
      restoreFileTrash: (kind, originalPath, restoredPath) =>
        set((state) =>
          kind === "notes"
            ? {
                notes: state.notes.map((entry) =>
                  entry.path.replace(/^notes[\\/]/, "") === originalPath
                    ? {
                        ...entry,
                        path: `notes/${restoredPath || originalPath}`,
                        trashedAt: undefined,
                      }
                    : entry,
                ),
              }
            : {
                maps: state.maps.map((entry) =>
                  entry.path.replace(/^maps[\\/]/, "") === originalPath
                    ? {
                        ...entry,
                        path: `maps/${restoredPath || originalPath}`,
                        trashedAt: undefined,
                      }
                    : entry,
                ),
              },
        ),
      purgeFileTrash: (kind, originalPath) =>
        set((state) =>
          kind === "notes"
            ? {
                notes: state.notes.filter(
                  (entry) => entry.path.replace(/^notes[\\/]/, "") !== originalPath,
                ),
              }
            : {
                maps: state.maps.filter(
                  (entry) => entry.path.replace(/^maps[\\/]/, "") !== originalPath,
                ),
              },
        ),
      updateNote: (id, changes) => {
        const previous = get().notes.find((entry) => entry.id === id);
        const renamed = Boolean(previous && changes.title && previous.title !== changes.title);
        const linkedNoteIds = renamed
          ? get()
              .notes.filter(
                (note) =>
                  note.workspaceId === get().activeWorkspaceId &&
                  note.id !== id &&
                  note.body
                    .toLocaleLowerCase()
                    .includes(`[[${previous!.title.toLocaleLowerCase()}`),
              )
              .map((note) => note.id)
          : [];
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === id && note.workspaceId === state.activeWorkspaceId
              ? { ...note, ...changes, updatedAt: new Date().toISOString() }
              : previous &&
                  changes.title &&
                  previous.title !== changes.title &&
                  note.workspaceId === state.activeWorkspaceId
                ? {
                    ...note,
                    body: rewriteWikiLinks(note.body, previous.title, changes.title),
                    updatedAt: new Date().toISOString(),
                  }
                : note,
          ),
          tabs: changes.title
            ? state.tabs.map((tab) =>
                tab.entityId === id ? { ...tab, title: changes.title! } : tab,
              )
            : state.tabs,
        }));
        const affectedNotes = get().notes.filter(
          (entry) => entry.id === id || linkedNoteIds.includes(entry.id),
        );
        affectedNotes.forEach(
          (entry) =>
            void persistNativeNote(entry).catch((error: unknown) =>
              console.error("Native note save failed", error),
            ),
        );
        const note = affectedNotes.find((entry) => entry.id === id);
        const deadline = note
          ? Object.values(note.properties).find((property) => property.type === "deadline")
          : undefined;
        if (note && deadline && typeof deadline.value === "string") {
          const dueAt = deadline.value.includes("T")
            ? deadline.value
            : `${deadline.value}T23:59:00`;
          const linked = get().items.find(
            (item) =>
              item.noteId === note.id &&
              item.workspaceId === note.workspaceId &&
              item.sourceNoteLine === undefined,
          );
          if (linked) get().updateItem(linked.id, { dueAt, title: note.title });
          else {
            const category = get().categories.find(
              (entry) => entry.workspaceId === note.workspaceId,
            );
            if (category)
              get().addItem({
                kind: "task",
                title: note.title,
                description: "Created from note deadline",
                categoryId: category.id,
                dueAt,
                allDay: false,
                priority: "medium",
                subtasks: [],
                noteId: note.id,
                ...(note.courseId ? { courseId: note.courseId } : {}),
                rruleExceptions: [],
                reminders: [get().settings.defaultReminderMinutes],
              });
          }
        }
        if (note && changes.body !== undefined) {
          const datedTasks = extractDatedNoteTasks(note.body);
          const taskLines = new Set(datedTasks.map((task) => task.line));
          const now = new Date().toISOString();
          const category =
            get().categories.find(
              (entry) =>
                entry.workspaceId === note.workspaceId &&
                /assignment|admin|project/i.test(entry.name),
            ) ?? get().categories.find((entry) => entry.workspaceId === note.workspaceId);
          if (category)
            set((state) => {
              const existing = state.items.filter(
                (item) =>
                  item.workspaceId === note.workspaceId &&
                  item.noteId === note.id &&
                  item.sourceNoteLine !== undefined,
              );
              const byLine = new Map(existing.map((item) => [item.sourceNoteLine!, item]));
              const matched = new Set<string>();
              const additions: CalendarItem[] = [];
              const updates = new Map<string, CalendarItem>();
              for (const task of datedTasks) {
                const linkedByLine = byLine.get(task.line);
                const linked =
                  linkedByLine && !matched.has(linkedByLine.id)
                    ? linkedByLine
                    : existing.find(
                        (item) =>
                          !matched.has(item.id) &&
                          item.title === task.title &&
                          item.dueAt &&
                          formatISO(new Date(item.dueAt), { representation: "date" }) === task.date,
                      );
                if (linked) matched.add(linked.id);
                const values = {
                  title: task.title,
                  dueAt: noteTaskDueAt(task.date),
                  sourceNoteLine: task.line,
                  allDay: true,
                  updatedAt: now,
                };
                if (linked) {
                  const { completedAt: previousCompletion, ...withoutCompletion } = linked;
                  updates.set(
                    linked.id,
                    task.checked
                      ? {
                          ...withoutCompletion,
                          ...values,
                          completedAt: previousCompletion ?? now,
                        }
                      : { ...withoutCompletion, ...values },
                  );
                } else
                  additions.push({
                    id: createId("item"),
                    workspaceId: note.workspaceId,
                    kind: "task",
                    title: values.title,
                    description: `Linked from “${note.title}”, checkbox ${task.line}`,
                    categoryId: category.id,
                    dueAt: values.dueAt,
                    allDay: true,
                    ...(task.checked ? { completedAt: now } : {}),
                    priority: "none",
                    subtasks: [],
                    noteId: note.id,
                    ...(note.courseId ? { courseId: note.courseId } : {}),
                    sourceNoteLine: task.line,
                    rruleExceptions: [],
                    reminders: [state.settings.defaultReminderMinutes],
                    createdAt: now,
                    updatedAt: now,
                  });
              }
              return {
                items: [
                  ...state.items.map((item) => {
                    const changed = updates.get(item.id);
                    if (changed) return changed;
                    if (
                      item.noteId === note.id &&
                      item.sourceNoteLine !== undefined &&
                      !taskLines.has(item.sourceNoteLine) &&
                      !item.trashedAt
                    )
                      return { ...item, trashedAt: now, updatedAt: now };
                    return item;
                  }),
                  ...additions,
                ],
              };
            });
        }
        if (note) {
          const cards = extractNoteFlashcards(
            note,
            get().flashcards.filter((card) => card.noteId === note.id),
          );
          set((state) => ({
            flashcards: [...state.flashcards.filter((card) => card.noteId !== note.id), ...cards],
          }));
        }
      },
      addCategory: (name = "New category") => {
        const workspaceId = get().activeWorkspaceId;
        const category: Category = {
          id: createId("category"),
          workspaceId,
          name,
          color: "#657287",
          icon: "●",
          sortOrder: get().categories.filter((entry) => entry.workspaceId === workspaceId).length,
        };
        set((state) => ({ categories: [...state.categories, category] }));
        return category;
      },
      updateCategory: (id, changes) =>
        set((state) => ({
          categories: state.categories.map((category) =>
            category.id === id && category.workspaceId === state.activeWorkspaceId
              ? { ...category, ...changes }
              : category,
          ),
        })),
      deleteCategory: (id) =>
        set((state) => {
          const workspaceCategories = state.categories
            .filter(
              (category) => category.workspaceId === state.activeWorkspaceId && category.id !== id,
            )
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const fallback = workspaceCategories[0];
          if (!fallback) return state;
          const order = new Map(workspaceCategories.map((category, index) => [category.id, index]));
          return {
            categories: state.categories
              .filter((category) => category.id !== id)
              .map((category) =>
                category.workspaceId === state.activeWorkspaceId
                  ? { ...category, sortOrder: order.get(category.id) ?? category.sortOrder }
                  : category,
              ),
            items: state.items.map((item) =>
              item.workspaceId === state.activeWorkspaceId && item.categoryId === id
                ? { ...item, categoryId: fallback.id, updatedAt: new Date().toISOString() }
                : item,
            ),
            habits: state.habits.map((habit) =>
              habit.workspaceId === state.activeWorkspaceId && habit.categoryId === id
                ? { ...habit, categoryId: fallback.id }
                : habit,
            ),
            metrics: state.metrics.map((metric) =>
              metric.workspaceId === state.activeWorkspaceId && metric.categoryId === id
                ? { ...metric, categoryId: fallback.id }
                : metric,
            ),
          };
        }),
      moveCategory: (id, direction) =>
        set((state) => {
          const ordered = state.categories
            .filter((category) => category.workspaceId === state.activeWorkspaceId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const index = ordered.findIndex((category) => category.id === id);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= ordered.length) return state;
          const current = ordered[index]!;
          const other = ordered[target]!;
          return {
            categories: state.categories.map((category) =>
              category.id === current.id
                ? { ...category, sortOrder: other.sortOrder }
                : category.id === other.id
                  ? { ...category, sortOrder: current.sortOrder }
                  : category,
            ),
          };
        }),
      addCourse: (data) => {
        const course: Course = {
          ...data,
          id: createId("course"),
          workspaceId: get().activeWorkspaceId,
          sortOrder: get().courses.filter((entry) => entry.workspaceId === get().activeWorkspaceId)
            .length,
        };
        set((state) => ({ courses: [...state.courses, course] }));
        return course;
      },
      updateCourse: (id, changes) =>
        set((state) => ({
          courses: state.courses.map((course) =>
            course.id === id && course.workspaceId === state.activeWorkspaceId
              ? { ...course, ...changes }
              : course,
          ),
        })),
      addTemplate: (name = "Custom template") => {
        const template: StudyTemplate = {
          id: createId("template"),
          workspaceId: get().activeWorkspaceId,
          name,
          body: "<h1>{{title}}</h1><p>{{date}}</p><p>{{cursor}}</p>",
          builtIn: false,
          sortOrder: get().templates.filter(
            (entry) => entry.workspaceId === get().activeWorkspaceId,
          ).length,
        };
        set((state) => ({ templates: [...state.templates, template] }));
        return template;
      },
      updateTemplate: (id, changes) =>
        set((state) => ({
          templates: state.templates.map((template) =>
            template.id === id && template.workspaceId === state.activeWorkspaceId
              ? { ...template, ...changes }
              : template,
          ),
        })),
      createNoteFromTemplate: (templateId, title, courseId) => {
        const template = get().templates.find(
          (entry) => entry.id === templateId && entry.workspaceId === get().activeWorkspaceId,
        );
        if (!template) return undefined;
        const course = get().courses.find((entry) => entry.id === courseId);
        const note = get().addNote(title);
        const rendered = applyTemplate(template.body, {
          title: note.title,
          ...(course ? { course: course.name, semester: course.semester } : {}),
        });
        get().updateNote(note.id, {
          body: rendered.content,
          ...(course ? { courseId: course.id, path: `notes/${course.code}/${note.title}.md` } : {}),
        });
        return get().notes.find((entry) => entry.id === note.id);
      },
      gradeFlashcard: (id, grade) => {
        const card = get().flashcards.find(
          (entry) => entry.id === id && entry.workspaceId === get().activeWorkspaceId,
        );
        if (!card) return;
        const result = reviewCard(card, grade);
        const { intervalBefore, grade: reviewedGrade, ...updated } = result;
        const log: ReviewLog = {
          id: createId("review"),
          workspaceId: card.workspaceId,
          flashcardId: card.id,
          reviewedAt: updated.lastReviewedAt ?? new Date().toISOString(),
          grade: reviewedGrade,
          intervalBefore,
          intervalAfter: updated.intervalDays,
        };
        set((state) => ({
          flashcards: state.flashcards.map((entry) => (entry.id === id ? updated : entry)),
          reviewLogs: [...state.reviewLogs, log],
        }));
      },
      addReferences: (references) =>
        set((state) => {
          const workspaceId = state.activeWorkspaceId;
          const incoming = references.map((reference) => ({ ...reference, workspaceId }));
          const keys = new Set(
            incoming.map((reference) => reference.citationKey.toLocaleLowerCase()),
          );
          return {
            references: [
              ...state.references.filter(
                (reference) =>
                  reference.workspaceId !== workspaceId ||
                  !keys.has(reference.citationKey.toLocaleLowerCase()),
              ),
              ...incoming,
            ],
          };
        }),
      addMap: (name = "Untitled map") => {
        const map: CanvasMap = {
          id: createId("map"),
          workspaceId: get().activeWorkspaceId,
          name,
          path: `maps/${name}.canvas`,
          nodes: [],
          edges: [],
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ maps: [...state.maps, map] }));
        void persistNativeCanvas(map);
        return map;
      },
      duplicateMap: (id) => {
        const source = get().maps.find(
          (entry) => entry.id === id && entry.workspaceId === get().activeWorkspaceId,
        );
        if (!source) return undefined;
        const copy = get().addMap(`${source.name} copy`);
        get().updateMap(copy.id, {
          nodes: structuredClone(source.nodes),
          edges: structuredClone(source.edges),
          ...(source.parentMapId ? { parentMapId: source.parentMapId } : {}),
        });
        return get().maps.find((entry) => entry.id === copy.id);
      },
      trashMap: (id) => {
        const map = get().maps.find(
          (entry) => entry.id === id && entry.workspaceId === get().activeWorkspaceId,
        );
        if (!map || map.trashedAt) return;
        const trashedAt = new Date().toISOString();
        set((state) => ({
          maps: state.maps.map((entry) => (entry.id === id ? { ...entry, trashedAt } : entry)),
        }));
        void trashNativeFile(map.workspaceId, "maps", map.path.replace(/^maps[\\/]/, "")).catch(
          (error: unknown) => {
            console.error("Unable to move map to native trash", error);
            set((state) => ({
              maps: state.maps.map((entry) =>
                entry.id === id ? { ...entry, trashedAt: undefined } : entry,
              ),
            }));
          },
        );
      },
      updateMap: (id, changes) => {
        set((state) => ({
          maps: state.maps.map((map) =>
            map.id === id && map.workspaceId === state.activeWorkspaceId
              ? { ...map, ...changes, updatedAt: new Date().toISOString() }
              : map,
          ),
        }));
        const map = get().maps.find((entry) => entry.id === id);
        if (map)
          void persistNativeCanvas(map).catch((error: unknown) =>
            console.error("Native canvas save failed", error),
          );
      },
      addItem: (data) => {
        const item: CalendarItem = {
          ...data,
          id: createId("item"),
          workspaceId: get().activeWorkspaceId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ items: [...state.items, item] }));
        return item;
      },
      updateItem: (id, changes) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id && item.workspaceId === state.activeWorkspaceId
              ? { ...item, ...changes, updatedAt: new Date().toISOString() }
              : item,
          ),
        }));
        const item = get().items.find(
          (entry) => entry.id === id && entry.workspaceId === get().activeWorkspaceId,
        );
        const note = item?.noteId
          ? get().notes.find(
              (entry) => entry.id === item.noteId && entry.workspaceId === item.workspaceId,
            )
          : undefined;
        if (!note) return;
        if (
          item?.sourceNoteLine !== undefined &&
          Object.prototype.hasOwnProperty.call(changes, "completedAt")
        ) {
          const body = setDatedNoteTaskChecked(
            note.body,
            item.sourceNoteLine,
            Boolean(changes.completedAt),
          );
          if (body !== note.body) {
            const updated = { ...note, body, updatedAt: new Date().toISOString() };
            set((state) => ({
              notes: state.notes.map((entry) => (entry.id === note.id ? updated : entry)),
            }));
            void persistNativeNote(updated).catch((error: unknown) =>
              console.error("Native note save failed", error),
            );
          }
        }
        if (changes.dueAt === undefined || item?.sourceNoteLine !== undefined) return;
        const deadlineEntry = Object.entries(note.properties).find(
          ([, property]) => property.type === "deadline",
        );
        if (!deadlineEntry || deadlineEntry[1].value === changes.dueAt) return;
        const updated: Note = {
          ...note,
          properties: {
            ...note.properties,
            [deadlineEntry[0]]: { type: "deadline", value: changes.dueAt },
          },
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          notes: state.notes.map((entry) => (entry.id === note.id ? updated : entry)),
        }));
        void persistNativeNote(updated).catch((error: unknown) =>
          console.error("Native note save failed", error),
        );
      },
      restoreItem: (id) => get().updateItem(id, { trashedAt: undefined }),
      purgeItem: (id) =>
        set((state) => ({ items: state.items.filter((entry) => entry.id !== id) })),
      purgeExpiredTrash: (now = new Date().toISOString()) => {
        const cutoff = new Date(now).getTime() - 30 * 86_400_000;
        const keep = (trashedAt?: string) => !trashedAt || new Date(trashedAt).getTime() > cutoff;
        set((state) => ({
          notes: state.notes.filter((entry) => keep(entry.trashedAt)),
          maps: state.maps.filter((entry) => keep(entry.trashedAt)),
          items: state.items.filter((entry) => keep(entry.trashedAt)),
        }));
      },
      addHabit: (data) => {
        const habit: Habit = {
          id: createId("habit"),
          workspaceId: get().activeWorkspaceId,
          name: data.name,
          categoryId: data.categoryId,
          type: data.type,
          activeWeekdays: data.activeWeekdays ?? [0, 1, 2, 3, 4, 5, 6],
          description: data.description ?? "",
          sortOrder:
            Math.max(
              -1,
              ...get()
                .habits.filter((entry) => entry.workspaceId === get().activeWorkspaceId)
                .map((entry) => entry.sortOrder),
            ) + 1,
          archived: data.archived ?? false,
          ...(data.unit ? { unit: data.unit } : {}),
          ...(data.target !== undefined ? { target: data.target } : {}),
          ...(data.startDate ? { startDate: data.startDate } : {}),
          ...(data.endDate ? { endDate: data.endDate } : {}),
        };
        set((state) => ({ habits: [...state.habits, habit] }));
        return habit;
      },
      updateHabit: (id, changes) =>
        set((state) => ({
          habits: state.habits.map((habit) => {
            if (habit.id !== id || habit.workspaceId !== state.activeWorkspaceId) return habit;
            const next = {
              ...habit,
              ...changes,
              id: habit.id,
              workspaceId: habit.workspaceId,
            } as Habit & Record<string, unknown>;
            for (const key of ["unit", "target", "startDate", "endDate"])
              if (next[key] === null) delete next[key];
            return next;
          }),
        })),
      moveHabit: (id, targetId) =>
        set((state) => {
          const scoped = state.habits
            .filter((habit) => habit.workspaceId === state.activeWorkspaceId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const source = scoped.findIndex((habit) => habit.id === id);
          const target = scoped.findIndex((habit) => habit.id === targetId);
          if (source < 0 || target < 0 || source === target) return state;
          const reordered = [...scoped];
          const [moved] = reordered.splice(source, 1);
          if (!moved) return state;
          reordered.splice(target, 0, moved);
          const order = new Map(reordered.map((habit, index) => [habit.id, index]));
          return {
            habits: state.habits.map((habit) =>
              order.has(habit.id) ? { ...habit, sortOrder: order.get(habit.id)! } : habit,
            ),
          };
        }),
      updateHabitEntry: (habitId, date, value) =>
        set((state) => {
          const habit = state.habits.find(
            (entry) => entry.id === habitId && entry.workspaceId === state.activeWorkspaceId,
          );
          if (!habit) return state;
          const existing = state.habitEntries.find(
            (entry) => entry.habitId === habitId && entry.date === date,
          );
          const next: HabitEntry =
            typeof value === "boolean"
              ? {
                  ...existing,
                  workspaceId: state.activeWorkspaceId,
                  habitId,
                  date,
                  done: value,
                }
              : {
                  ...existing,
                  workspaceId: state.activeWorkspaceId,
                  habitId,
                  date,
                  done: value >= (habit.target ?? 0),
                  value,
                };
          return {
            habitEntries: existing
              ? state.habitEntries.map((entry) => (entry === existing ? next : entry))
              : [...state.habitEntries, next],
          };
        }),
      updateHabitEntryNote: (habitId, date, note) =>
        set((state) => {
          const habit = state.habits.find(
            (entry) => entry.id === habitId && entry.workspaceId === state.activeWorkspaceId,
          );
          if (!habit) return state;
          const existing = state.habitEntries.find(
            (entry) =>
              entry.workspaceId === state.activeWorkspaceId &&
              entry.habitId === habitId &&
              entry.date === date,
          );
          const base: HabitEntry = existing ?? {
            workspaceId: state.activeWorkspaceId,
            habitId,
            date,
            done: false,
          };
          const next: HabitEntry = { ...base };
          if (note?.trim()) next.note = note.trim();
          else delete next.note;
          return {
            habitEntries: existing
              ? state.habitEntries.map((entry) => (entry === existing ? next : entry))
              : [...state.habitEntries, next],
          };
        }),
      clearHabitEntry: (habitId, date) =>
        set((state) => ({
          habitEntries: state.habitEntries.filter(
            (entry) =>
              !(
                entry.workspaceId === state.activeWorkspaceId &&
                entry.habitId === habitId &&
                entry.date === date
              ),
          ),
        })),
      addMetric: (data) => {
        const metric: Metric = {
          id: createId("metric"),
          workspaceId: get().activeWorkspaceId,
          name: data.name,
          unit: data.unit,
          categoryId: data.categoryId,
          sortOrder:
            Math.max(
              -1,
              ...get()
                .metrics.filter((entry) => entry.workspaceId === get().activeWorkspaceId)
                .map((entry) => entry.sortOrder),
            ) + 1,
          ...(data.target !== undefined ? { target: data.target } : {}),
        };
        set((state) => ({ metrics: [...state.metrics, metric] }));
        return metric;
      },
      updateMetric: (id, changes) =>
        set((state) => ({
          metrics: state.metrics.map((metric) => {
            if (metric.id !== id || metric.workspaceId !== state.activeWorkspaceId) return metric;
            const next = {
              ...metric,
              ...changes,
              id: metric.id,
              workspaceId: metric.workspaceId,
            } as Metric & Record<string, unknown>;
            if (next.target === null) delete next.target;
            return next;
          }),
        })),
      deleteMetric: (id) =>
        set((state) => ({
          metrics: state.metrics.filter(
            (metric) => !(metric.id === id && metric.workspaceId === state.activeWorkspaceId),
          ),
          metricEntries: state.metricEntries.filter(
            (entry) => !(entry.metricId === id && entry.workspaceId === state.activeWorkspaceId),
          ),
        })),
      updateMetricEntry: (metricId, date, value) =>
        set((state) => {
          if (
            !state.metrics.some(
              (metric) => metric.id === metricId && metric.workspaceId === state.activeWorkspaceId,
            )
          )
            return state;
          const existing = state.metricEntries.find(
            (entry) =>
              entry.workspaceId === state.activeWorkspaceId &&
              entry.metricId === metricId &&
              entry.date === date,
          );
          const next: MetricEntry = {
            workspaceId: state.activeWorkspaceId,
            metricId,
            date,
            value,
          };
          return {
            metricEntries: existing
              ? state.metricEntries.map((entry) => (entry === existing ? next : entry))
              : [...state.metricEntries, next],
          };
        }),
      clearMetricEntry: (metricId, date) =>
        set((state) => ({
          metricEntries: state.metricEntries.filter(
            (entry) =>
              !(
                entry.workspaceId === state.activeWorkspaceId &&
                entry.metricId === metricId &&
                entry.date === date
              ),
          ),
        })),
      updateSettings: (changes) => {
        const settings = { ...get().settings, ...changes };
        set({ settings });
        void persistNativeSettings(settings);
      },
      hydrateStructured: (snapshot) =>
        set((state) => ({
          ...snapshot,
          activeWorkspaceId: snapshot.workspaces.some(
            (workspace) => workspace.id === state.activeWorkspaceId,
          )
            ? state.activeWorkspaceId
            : (snapshot.workspaces[0]?.id ?? state.activeWorkspaceId),
        })),
      hydrateFileContent: (content) => set(content),
      addWorkspace: (name, color) =>
        set((state) => {
          const id = createId("workspace");
          return {
            workspaces: [
              ...state.workspaces,
              {
                id,
                name,
                color,
                folderName: name.replace(/[<>:"/\\|?*]/g, "-"),
                sortOrder: state.workspaces.length,
                kind: "custom",
                createdAt: new Date().toISOString(),
              },
            ],
            categories: [
              ...state.categories,
              {
                id: createId("category"),
                workspaceId: id,
                name: "General",
                color,
                icon: "Tag",
                sortOrder: 0,
              },
            ],
          };
        }),
      renameWorkspace: (id, name) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id ? { ...workspace, name } : workspace,
          ),
        })),
      updateWorkspace: (id, changes) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id ? { ...workspace, ...changes } : workspace,
          ),
        })),
      moveWorkspace: (id, direction) =>
        set((state) => {
          const ordered = [...state.workspaces].sort((a, b) => a.sortOrder - b.sortOrder);
          const index = ordered.findIndex((workspace) => workspace.id === id);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= ordered.length) return state;
          [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
          return {
            workspaces: ordered.map((workspace, sortOrder) => ({ ...workspace, sortOrder })),
          };
        }),
      deleteWorkspace: (id) =>
        set((state) => {
          if (state.workspaces.length <= 1) return state;
          const workspaces = state.workspaces
            .filter((workspace) => workspace.id !== id)
            .map((workspace, sortOrder) => ({ ...workspace, sortOrder }));
          const activeWorkspaceId =
            state.activeWorkspaceId === id ? workspaces[0]!.id : state.activeWorkspaceId;
          const deletingActive = state.activeWorkspaceId === id;
          const homeId = `home-${activeWorkspaceId}`;
          const paneId = `pane-${activeWorkspaceId}`;
          const dashboardWidgetOrder = { ...state.settings.dashboardWidgetOrder };
          const dashboardHiddenWidgets = { ...state.settings.dashboardHiddenWidgets };
          const workspaceSessions = { ...state.workspaceSessions };
          delete dashboardWidgetOrder[id];
          delete dashboardHiddenWidgets[id];
          delete workspaceSessions[id];
          return {
            workspaces,
            activeWorkspaceId,
            categories: state.categories.filter((entry) => entry.workspaceId !== id),
            courses: state.courses.filter((entry) => entry.workspaceId !== id),
            templates: state.templates.filter((entry) => entry.workspaceId !== id),
            flashcards: state.flashcards.filter((entry) => entry.workspaceId !== id),
            reviewLogs: state.reviewLogs.filter((entry) => entry.workspaceId !== id),
            references: state.references.filter((entry) => entry.workspaceId !== id),
            notes: state.notes.filter((entry) => entry.workspaceId !== id),
            maps: state.maps.filter((entry) => entry.workspaceId !== id),
            items: state.items.filter((entry) => entry.workspaceId !== id),
            habits: state.habits.filter((entry) => entry.workspaceId !== id),
            habitEntries: state.habitEntries.filter((entry) => entry.workspaceId !== id),
            metrics: state.metrics.filter((entry) => entry.workspaceId !== id),
            metricEntries: state.metricEntries.filter((entry) => entry.workspaceId !== id),
            recaps: state.recaps.filter((entry) => entry.workspaceId !== id),
            settings: {
              ...state.settings,
              dashboardWidgetOrder,
              dashboardHiddenWidgets,
              ...(state.settings.defaultWorkspaceId === id
                ? { defaultWorkspaceId: activeWorkspaceId }
                : {}),
            },
            workspaceSessions,
            ...(deletingActive
              ? {
                  activeModule: "home" as ModuleId,
                  tabs: [{ id: homeId, module: "home" as ModuleId, title: "Home", pinned: true }],
                  activeTabId: homeId,
                  recentTabIds: [homeId],
                  panes: [{ id: paneId, tabIds: [homeId], activeTabId: homeId }],
                  paneLayout: { kind: "pane" as const, paneId },
                  activePaneId: paneId,
                }
              : {}),
          };
        }),
      resetAll: () => set({ ...initial }),
    }),
    {
      name: "diorna-state-v1",
      storage: persistStorage(),
      partialize: (state) => persistedSlice(state, !isTauri()),
      merge: (persisted, current) => {
        const saved = persisted as Partial<DiornaState>;
        const settings = { ...defaultSettings, ...(saved.settings ?? {}) };
        if (settings.recapEndpoint === OPENROUTER_ENDPOINT && !settings.recapModel.trim()) {
          settings.recapModel = OPENROUTER_MODEL;
        }
        const fallbackPaneId = "pane-main";
        const fallbackTabId = saved.activeTabId ?? saved.tabs?.[0]?.id ?? "home";
        const panes = saved.panes?.length
          ? saved.panes
          : [
              {
                id: fallbackPaneId,
                tabIds: (saved.tabs ?? current.tabs).map((tab) => tab.id),
                activeTabId: fallbackTabId,
              },
            ];
        return {
          ...current,
          ...saved,
          settings,
          panes,
          paneLayout:
            saved.paneLayout ?? ({ kind: "pane", paneId: panes[0]!.id } as PaneLayoutNode),
          activePaneId: saved.activePaneId ?? panes[0]!.id,
        };
      },
    },
  ),
);

export const selectWorkspace = <T extends { workspaceId: string }>(
  items: T[],
  workspaceId: string,
): T[] => items.filter((item) => item.workspaceId === workspaceId);
