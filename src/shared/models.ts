export type Id = string;
export type ISODate = string;
export type ISODateTime = string;

export interface Workspace {
  id: Id;
  name: string;
  color: string;
  folderName: string;
  sortOrder: number;
  kind: "student" | "personal" | "custom";
  createdAt: ISODateTime;
}

export interface Category {
  id: Id;
  workspaceId: Id;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}

export interface Note {
  id: Id;
  workspaceId: Id;
  path: string;
  title: string;
  body: string;
  courseId?: Id;
  tags: string[];
  properties: Record<string, NoteProperty>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  wordCount: number;
  starred?: boolean;
  trashedAt?: ISODateTime;
}

export interface NoteProperty {
  type:
    | "text"
    | "number"
    | "date"
    | "deadline"
    | "checkbox"
    | "single-select"
    | "multi-select"
    | "url"
    | "note-reference";
  value: string | number | boolean | string[];
}

export interface Course {
  id: Id;
  workspaceId: Id;
  name: string;
  code: string;
  color: string;
  semester: string;
  instructor: string;
  credits: number;
  schedule: string;
  sortOrder: number;
}

export interface StudyTemplate {
  id: Id;
  workspaceId: Id;
  name: string;
  body: string;
  builtIn: boolean;
  defaultCourseId?: Id | undefined;
  sortOrder: number;
}

export interface ReferenceRecord {
  id: Id;
  workspaceId: Id;
  citationKey: string;
  title: string;
  authors: string[];
  year?: number;
  container?: string;
  doi?: string;
  url?: string;
}

export type ItemKind = "task" | "event";
export type Priority = "none" | "low" | "medium" | "high";

export interface CalendarItem {
  id: Id;
  workspaceId: Id;
  kind: ItemKind;
  title: string;
  description: string;
  categoryId: Id;
  startAt?: ISODateTime;
  endAt?: ISODateTime;
  allDay: boolean;
  dueAt?: ISODateTime;
  completedAt?: ISODateTime;
  priority: Priority;
  subtasks: Array<{ id: Id; title: string; done: boolean }>;
  noteId?: Id;
  courseId?: Id;
  rrule?: string;
  rruleExceptions: ISODateTime[];
  reminders: number[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  trashedAt?: ISODateTime;
}

export type HabitType = "checkbox" | "quantity";

export interface Habit {
  id: Id;
  workspaceId: Id;
  name: string;
  categoryId: Id;
  type: HabitType;
  unit?: string;
  target?: number;
  activeWeekdays: number[];
  startDate?: ISODate;
  endDate?: ISODate;
  description: string;
  sortOrder: number;
  archived: boolean;
}

export interface HabitEntry {
  workspaceId: Id;
  habitId: Id;
  date: ISODate;
  done: boolean;
  value?: number;
  note?: string;
}

export interface Metric {
  id: Id;
  workspaceId: Id;
  name: string;
  unit: string;
  categoryId: Id;
  target?: number;
  sortOrder: number;
}

export interface MetricEntry {
  workspaceId: Id;
  metricId: Id;
  date: ISODate;
  value: number;
}

export interface Flashcard {
  id: Id;
  workspaceId: Id;
  noteId: Id;
  blockId: Id;
  front: string;
  back: string;
  cardType: "basic" | "cloze";
  ease: number;
  intervalDays: number;
  dueDate: ISODate;
  reps: number;
  lapses: number;
  lastReviewedAt?: ISODateTime;
}

export interface ReviewLog {
  id: Id;
  workspaceId: Id;
  flashcardId: Id;
  reviewedAt: ISODateTime;
  grade: FlashcardGrade;
  intervalBefore: number;
  intervalAfter: number;
}

export type FlashcardGrade = "again" | "hard" | "good" | "easy";

export interface CanvasNode {
  id: Id;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  color?: string;
  diorna?: {
    nodeType?: "note" | "text" | "image" | "link" | "group" | "submap";
    locked?: boolean;
    collapsed?: boolean;
    icon?: string;
    borderColor?: string;
    borderWidth?: number;
    presentationOrder?: number;
    linkTitle?: string;
    linkDescription?: string;
    favicon?: string;
    linkFetchedAt?: ISODateTime;
  };
}

export interface CanvasEdge {
  id: Id;
  fromNode: Id;
  toNode: Id;
  fromSide?: "top" | "right" | "bottom" | "left";
  toSide?: "top" | "right" | "bottom" | "left";
  label?: string;
  color?: string;
  diorna?: {
    width?: number;
    lineStyle?: "solid" | "dashed" | "dotted";
    routing?: "bezier" | "straight" | "orthogonal";
    arrowheads?: "none" | "one-way" | "bidirectional";
  };
}

export interface CanvasMap {
  id: Id;
  workspaceId: Id;
  name: string;
  path: string;
  parentMapId?: Id;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  updatedAt: ISODateTime;
  trashedAt?: ISODateTime;
}

export interface RecapStatistics {
  workspaceId: Id;
  periodStart: ISODate;
  periodEnd: ISODate;
  previousPeriodStart: ISODate;
  habits: {
    overallRate: number | null;
    previousRate: number | null;
    best?: { name: string; rate: number };
    worst?: { name: string; rate: number };
  };
  metrics: Array<{
    name: string;
    unit: string;
    first: number;
    last: number;
    absoluteChange: number;
    percentChange: number | null;
    personalRecord: boolean;
  }>;
  tasks: {
    completed: number;
    previousCompleted: number;
    onTime: number;
    overdue: number;
    byCategory: Record<string, number>;
  };
  notes: {
    created: number;
    edited: number;
    wordsWritten: number;
    titles: string[];
  };
  maps: { created: number; nodesCreated: number };
  flashcards: {
    reviewed: number;
    retentionRate: number | null;
    streak: number;
    courses: string[];
  };
  dailyScores: Array<{ date: ISODate; score: number | null }>;
}

export interface Recap {
  id: Id;
  workspaceId: Id;
  periodType: "month" | "year" | "custom";
  periodStart: ISODate;
  periodEnd: ISODate;
  noteId: Id;
  stats: RecapStatistics;
  narrative: string;
  modelUsed: string;
  generatedAt: ISODateTime;
  revision: number;
}

export type ModuleId =
  | "home"
  | "notes"
  | "maps"
  | "calendar"
  | "daily"
  | "recap"
  | "settings"
  | "components";

export interface AppSettings {
  language: "en" | "fr";
  theme: "light" | "dark" | "system";
  accentColor: string;
  density: "compact" | "comfortable";
  minimizeToTray: boolean;
  startWithWindows: boolean;
  defaultWorkspaceId?: Id;
  weekStartsOn: 0 | 1;
  calendarVisibleStart: number;
  calendarVisibleEnd: number;
  defaultReminderMinutes: number;
  dailyWindow: "plus-minus-3" | "7" | "14" | "30" | "week" | "month" | "custom";
  allowFutureCheckIn: boolean;
  recapProvider: "none" | "remote" | "local";
  recapEndpoint: string;
  recapModel: string;
  recapAggregatesOnly: boolean;
  recapAutoMonthly: boolean;
  recapAutoYearly: boolean;
  recapConsentedProviders: string[];
  linkPreviewEnabled: boolean;
  updateEnabled: boolean;
}
