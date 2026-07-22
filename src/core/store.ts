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
import { persistNativeCanvas, persistNativeNote, persistNativeSettings } from "@/core/native";
import { rewriteWikiLinks } from "@/modules/notes/logic";
import { applyTemplate } from "@/modules/notes/logic";
import { extractNoteFlashcards } from "@/modules/student/flashcards";
import { reviewCard } from "@/modules/student/spacedRepetition";
import {
  extractDatedNoteTasks,
  noteTaskDueAt,
  setDatedNoteTaskChecked,
} from "@/modules/calendar/noteTasks";

interface TabState {
  id: string;
  module: ModuleId;
  title: string;
  entityId?: string;
  pinned: boolean;
}

interface DiornaState {
  onboardingComplete: boolean;
  activeWorkspaceId: Id;
  activeModule: ModuleId;
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  selectedCalendarItemId: Id | undefined;
  commandPaletteOpen: boolean;
  tabs: TabState[];
  activeTabId: string;
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
    studentName: string,
    personalName: string,
    theme: AppSettings["theme"],
    loadSample: boolean,
  ) => void;
  setWorkspace: (id: Id) => void;
  setModule: (module: ModuleId) => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  selectCalendarItem: (id?: Id) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  openTab: (
    tab: Omit<TabState, "id" | "pinned"> & Partial<Pick<TabState, "id" | "pinned">>,
  ) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setTabPinned: (id: string, pinned: boolean) => void;
  reorderTabs: (sourceId: string, targetId: string) => void;
  addNote: (title?: string) => Note;
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
  updateMap: (id: Id, changes: Partial<CanvasMap>) => void;
  addItem: (
    item: Omit<CalendarItem, "id" | "workspaceId" | "createdAt" | "updatedAt">,
  ) => CalendarItem;
  updateItem: (id: Id, changes: Partial<CalendarItem>) => void;
  addHabit: (habit: Pick<Habit, "name" | "categoryId" | "type"> & Partial<Habit>) => Habit;
  updateHabitEntry: (habitId: Id, date: string, value: boolean | number) => void;
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
  minimizeToTray: true,
  startWithWindows: false,
  defaultWorkspaceId: studentId,
  weekStartsOn: 1,
  calendarVisibleStart: 7,
  calendarVisibleEnd: 23,
  defaultEventDurationMinutes: 60,
  defaultReminderMinutes: 10,
  dailyWindow: "plus-minus-3",
  allowFutureCheckIn: false,
  recapProvider: "none",
  recapEndpoint: "https://openrouter.ai/api/v1",
  recapModel: "",
  recapAggregatesOnly: true,
  recapAutoMonthly: true,
  recapAutoYearly: true,
  recapConsentedProviders: [],
  linkPreviewEnabled: false,
  updateEnabled: true,
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
  rightPanelOpen: true,
  selectedCalendarItemId: undefined,
  commandPaletteOpen: false,
  tabs: [{ id: "home", module: "home" as ModuleId, title: "Home", pinned: true }],
  activeTabId: "home",
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

export const useDiornaStore = create<DiornaState>()(
  persist(
    (set, get) => ({
      ...initial,
      finishOnboarding: (studentName, personalName, theme, loadSample) => {
        set((state) => ({
          onboardingComplete: true,
          settings: { ...state.settings, theme },
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === studentId
              ? { ...workspace, name: studentName }
              : workspace.id === personalId
                ? { ...workspace, name: personalName }
                : workspace,
          ),
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
            : {}),
        }));
        for (const note of get().notes) void persistNativeNote(note);
        for (const map of get().maps) void persistNativeCanvas(map);
      },
      setWorkspace: (id) =>
        set({
          activeWorkspaceId: id,
          activeModule: "home",
          tabs: [{ id: `home-${id}`, module: "home", title: "Home", pinned: true }],
          activeTabId: `home-${id}`,
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
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      selectCalendarItem: (id) => set({ selectedCalendarItemId: id }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      openTab: (tab) =>
        set((state) => {
          const id = tab.id ?? `${tab.module}-${tab.entityId ?? createId("tab")}`;
          const existing = state.tabs.some((entry) => entry.id === id);
          return {
            tabs: existing
              ? state.tabs
              : [...state.tabs, { ...tab, id, pinned: tab.pinned ?? false }],
            activeTabId: id,
            activeModule: tab.module,
          };
        }),
      closeTab: (id) =>
        set((state) => {
          const tabs = state.tabs.filter((tab) => tab.id !== id);
          const next =
            state.activeTabId === id
              ? tabs.at(-1)
              : state.tabs.find((tab) => tab.id === state.activeTabId);
          return {
            tabs,
            activeTabId: next?.id ?? "",
            activeModule: next?.module ?? "home",
          };
        }),
      setActiveTab: (id) =>
        set((state) => ({
          activeTabId: id,
          activeModule: state.tabs.find((tab) => tab.id === id)?.module ?? state.activeModule,
        })),
      setTabPinned: (id, pinned) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, pinned } : tab)),
        })),
      reorderTabs: (sourceId, targetId) =>
        set((state) => {
          const source = state.tabs.findIndex((tab) => tab.id === sourceId);
          const target = state.tabs.findIndex((tab) => tab.id === targetId);
          if (source < 0 || target < 0 || source === target) return state;
          const tabs = [...state.tabs];
          const [moved] = tabs.splice(source, 1);
          if (moved) tabs.splice(target, 0, moved);
          return { tabs };
        }),
      addNote: (title = "Untitled") => {
        const workspaceId = get().activeWorkspaceId;
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
        const note: Note = {
          id: createId("note"),
          workspaceId,
          path: `notes/${uniqueTitle}.md`,
          title: uniqueTitle,
          body: "<p></p>",
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
      addHabit: (data) => {
        const habit: Habit = {
          id: createId("habit"),
          workspaceId: get().activeWorkspaceId,
          name: data.name,
          categoryId: data.categoryId,
          type: data.type,
          activeWeekdays: data.activeWeekdays ?? [0, 1, 2, 3, 4, 5, 6],
          description: data.description ?? "",
          sortOrder: get().habits.length,
          archived: false,
          ...(data.unit ? { unit: data.unit } : {}),
          ...(data.target !== undefined ? { target: data.target } : {}),
        };
        set((state) => ({ habits: [...state.habits, habit] }));
        return habit;
      },
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
                  workspaceId: state.activeWorkspaceId,
                  habitId,
                  date,
                  done: value,
                }
              : {
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
        set((state) => ({
          workspaces: [
            ...state.workspaces,
            {
              id: createId("workspace"),
              name,
              color,
              folderName: name.replace(/[<>:"/\\|?*]/g, "-"),
              sortOrder: state.workspaces.length,
              kind: "custom",
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      renameWorkspace: (id, name) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id ? { ...workspace, name } : workspace,
          ),
        })),
      deleteWorkspace: (id) =>
        set((state) =>
          state.workspaces.length <= 1
            ? state
            : {
                workspaces: state.workspaces.filter((workspace) => workspace.id !== id),
                activeWorkspaceId:
                  state.activeWorkspaceId === id
                    ? state.workspaces.find((workspace) => workspace.id !== id)!.id
                    : state.activeWorkspaceId,
              },
        ),
      resetAll: () => set({ ...initial }),
    }),
    {
      name: "diorna-state-v1",
      partialize: (state) => state,
      merge: (persisted, current) => {
        const saved = persisted as Partial<DiornaState>;
        return {
          ...current,
          ...saved,
          settings: { ...defaultSettings, ...(saved.settings ?? {}) },
        };
      },
    },
  ),
);

export const selectWorkspace = <T extends { workspaceId: string }>(
  items: T[],
  workspaceId: string,
): T[] => items.filter((item) => item.workspaceId === workspaceId);
