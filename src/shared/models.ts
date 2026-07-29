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
  starred?: boolean | undefined;
  trashedAt?: ISODateTime | undefined;
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
  projectId?: Id | undefined;
  trainingTemplateId?: Id;
  trainingSessionId?: Id;
  sourceNoteLine?: number;
  rrule?: string;
  rruleExceptions: ISODateTime[];
  reminders: number[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  trashedAt?: ISODateTime | undefined;
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

export type TrainingActivityKind =
  | "strength"
  | "running"
  | "cycling"
  | "swimming"
  | "team"
  | "mobility"
  | "custom";

export type TrainingMeasureType = "sets" | "duration" | "distance" | "mixed";

export type TrainingLoadMode = "external" | "bodyweight" | "bodyweight-plus" | "assisted" | "none";

export interface TrainingActivity {
  id: Id;
  workspaceId: Id;
  name: string;
  kind: TrainingActivityKind;
  color: string;
  icon: string;
  dailyHabitId?: Id;
  archived: boolean;
  sortOrder: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TrainingExercise {
  id: Id;
  workspaceId: Id;
  activityId: Id;
  name: string;
  measureType: TrainingMeasureType;
  loadMode?: TrainingLoadMode;
  loadUnit: "kg" | "lb";
  distanceUnit: "m" | "km" | "mi";
  notes: string;
  archived: boolean;
  sortOrder: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TrainingSet {
  id: Id;
  reps?: number | undefined;
  load?: number | undefined;
  durationSeconds?: number | undefined;
  distance?: number | undefined;
  completed: boolean;
}

export interface TrainingExerciseResult {
  id: Id;
  exerciseId: Id;
  name: string;
  measureType: TrainingMeasureType;
  loadMode?: TrainingLoadMode;
  loadUnit: "kg" | "lb";
  distanceUnit: "m" | "km" | "mi";
  sets: TrainingSet[];
  notes: string;
}

export interface TrainingTemplateExercise {
  id: Id;
  exerciseId: Id;
  name: string;
  measureType: TrainingMeasureType;
  loadMode?: TrainingLoadMode;
  loadUnit: "kg" | "lb";
  distanceUnit: "m" | "km" | "mi";
  plannedSets: number;
  defaultReps?: number;
  defaultLoad?: number;
  defaultDurationSeconds?: number;
  defaultDistance?: number;
}

export interface TrainingTemplate {
  id: Id;
  workspaceId: Id;
  activityId: Id;
  name: string;
  exercises: TrainingTemplateExercise[];
  notes: string;
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TrainingSession {
  id: Id;
  workspaceId: Id;
  activityId: Id;
  templateId?: Id;
  calendarItemId?: Id;
  title: string;
  status: "in-progress" | "completed";
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  results: TrainingExerciseResult[];
  notes: string;
  importedFromNoteId?: Id;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface TrainingImportSession {
  date: ISODate;
  title: string;
  exercises: Array<{
    name: string;
    measureType: TrainingMeasureType;
    sets: Array<Omit<TrainingSet, "id">>;
  }>;
}

export type ProjectKind = "work" | "study" | "personal" | "health" | "custom";
export type ProjectStatus = "idea" | "planned" | "active" | "on-hold" | "completed" | "cancelled";
export type ProjectHealth = "on-track" | "at-risk" | "blocked";
export type ProjectProgressMode = "automatic" | "manual" | "metric";

export interface ProjectMilestone {
  id: Id;
  title: string;
  dueDate?: ISODate | undefined;
  completedAt?: ISODateTime | undefined;
  notes: string;
  sortOrder: number;
}

export interface ProjectUpdate {
  id: Id;
  createdAt: ISODateTime;
  summary: string;
  wins: string;
  blockers: string;
  nextSteps: string;
}

export interface Project {
  id: Id;
  workspaceId: Id;
  name: string;
  outcome: string;
  description: string;
  kind: ProjectKind;
  status: ProjectStatus;
  health: ProjectHealth;
  color: string;
  categoryId?: Id | undefined;
  goalId?: Id | undefined;
  startDate?: ISODate | undefined;
  targetDate?: ISODate | undefined;
  nextAction: string;
  stakeholders: string[];
  tags: string[];
  progressMode: ProjectProgressMode;
  manualProgress: number;
  metricId?: Id | undefined;
  metricStartValue?: number | undefined;
  metricTargetValue?: number | undefined;
  milestones: ProjectMilestone[];
  updates: ProjectUpdate[];
  linkedNoteIds: Id[];
  linkedMapIds: Id[];
  linkedHabitIds: Id[];
  linkedTrainingActivityIds: Id[];
  favorite: boolean;
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt?: ISODateTime | undefined;
}

export type GoalStatus = "active" | "paused" | "completed" | "cancelled";
export type GoalHorizon = "month" | "quarter" | "year" | "multi-year" | "custom";
export type GoalProgressMode = "projects" | "manual" | "metric";

export interface Goal {
  id: Id;
  workspaceId: Id;
  title: string;
  purpose: string;
  successDefinition: string;
  status: GoalStatus;
  horizon: GoalHorizon;
  color: string;
  targetDate?: ISODate | undefined;
  progressMode: GoalProgressMode;
  manualProgress: number;
  metricId?: Id | undefined;
  metricStartValue?: number | undefined;
  metricTargetValue?: number | undefined;
  linkedHabitIds: Id[];
  tags: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt?: ISODateTime | undefined;
}

export type FocusMode = "deep-work" | "study" | "creative" | "admin" | "meeting-prep" | "personal";

export type FocusSourceType =
  | "calendar"
  | "project"
  | "goal"
  | "note"
  | "map"
  | "habit"
  | "training"
  | "custom";

export interface FocusPriority {
  id: Id;
  workspaceId: Id;
  date: ISODate;
  title: string;
  sourceType: FocusSourceType;
  sourceId?: Id | undefined;
  plannedMinutes: number;
  sortOrder: number;
  completedAt?: ISODateTime | undefined;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type FocusDistractionKind = "thought" | "message" | "task" | "environment" | "other";

export interface FocusDistraction {
  id: Id;
  kind: FocusDistractionKind;
  note: string;
  capturedAt: ISODateTime;
  handled: boolean;
}

export interface FocusReview {
  focusRating: number;
  energyBefore: number;
  energyAfter: number;
  outcome: string;
  wins: string;
  blockers: string;
  nextAction: string;
  sourceCompleted: boolean;
}

export type FocusSessionStatus = "planned" | "running" | "paused" | "completed" | "cancelled";

export interface FocusSession {
  id: Id;
  workspaceId: Id;
  title: string;
  intention: string;
  mode: FocusMode;
  status: FocusSessionStatus;
  sourceType: FocusSourceType;
  sourceId?: Id | undefined;
  priorityId?: Id | undefined;
  calendarItemId?: Id | undefined;
  scheduledAt?: ISODateTime | undefined;
  plannedMinutes: number;
  elapsedSeconds: number;
  timerStartedAt?: ISODateTime | undefined;
  startedAt?: ISODateTime | undefined;
  endedAt?: ISODateTime | undefined;
  pauseCount: number;
  distractionShield: string[];
  distractions: FocusDistraction[];
  review?: FocusReview | undefined;
  tags: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
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
    nodeType?:
      | "note"
      | "text"
      | "image"
      | "video"
      | "audio"
      | "pdf"
      | "file"
      | "link"
      | "group"
      | "submap";
    locked?: boolean;
    collapsed?: boolean;
    icon?: string;
    borderColor?: string;
    borderWidth?: number;
    presentationOrder?: number;
    linkTitle?: string;
    linkDescription?: string;
    linkSiteName?: string;
    linkImage?: string;
    linkImageFile?: string;
    favicon?: string;
    faviconFile?: string;
    linkFetchedAt?: ISODateTime;
    textStyle?: "body" | "title" | "subtitle" | "label" | "quote";
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
  trashedAt?: ISODateTime | undefined;
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
    rates?: Array<{
      name: string;
      rate: number | null;
      currentStreak: number;
      longestStreak: number;
    }>;
    weekdayAverages?: Array<number | null>;
  };
  metrics: Array<{
    name: string;
    unit: string;
    first: number;
    last: number;
    absoluteChange: number;
    percentChange: number | null;
    personalRecord: boolean;
    values?: Array<{ date: ISODate; value: number }>;
  }>;
  tasks: {
    completed: number;
    previousCompleted: number;
    onTime: number;
    overdue: number;
    byCategory: Record<string, number>;
  };
  events?: {
    attended: number;
    byCategory: Record<string, number>;
  };
  notes: {
    created: number;
    edited: number;
    wordsWritten: number;
    titles: string[];
    tags?: Record<string, number>;
    courses?: Record<string, number>;
  };
  maps: { created: number; nodesCreated: number };
  flashcards: {
    reviewed: number;
    retentionRate: number | null;
    streak: number;
    courses: string[];
  };
  training?: {
    sessions: number;
    previousSessions: number;
    durationMinutes: number;
    previousDurationMinutes: number;
    volume: number;
    distanceByUnit: Record<string, number>;
    byActivity: Record<string, number>;
    personalRecords: number;
  };
  projects?: {
    active: number;
    completed: number;
    previousCompleted: number;
    atRisk: number;
    milestonesCompleted: number;
    tasksCompleted: number;
    taskCompletionRate: number | null;
    byKind: Record<string, number>;
    completedNames: string[];
  };
  focus?: {
    sessions: number;
    previousSessions: number;
    plannedMinutes: number;
    actualMinutes: number;
    previousActualMinutes: number;
    completedAsPlanned: number;
    focusRating: number | null;
    distractions: number;
    byMode: Record<string, number>;
  };
  dailyScores: Array<{ date: ISODate; score: number | null }>;
  monthlyRecaps?: Array<{
    periodStart: ISODate;
    habitRate: number | null;
    tasksCompleted: number;
    metrics: Record<string, number>;
  }>;
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
  | "projects"
  | "focus"
  | "calendar"
  | "daily"
  | "training"
  | "recap"
  | "settings"
  | "components";

export interface AppSettings {
  language: "en" | "fr";
  theme: "diorna" | "light" | "dark" | "system";
  accentColor: string;
  density: "compact" | "comfortable";
  interfaceFont: string;
  editorFont: string;
  editorFontSize: number;
  editorLineWidth: number;
  minimizeToTray: boolean;
  startWithWindows: boolean;
  defaultWorkspaceId: Id | "";
  updateChannel: "stable" | "beta";
  vaultLocation: string;
  weekStartsOn: 0 | 1;
  calendarVisibleStart: number;
  calendarVisibleEnd: number;
  calendarHourHeight: number;
  defaultEventDurationMinutes: number;
  defaultReminderMinutes: number;
  dailyWindow: "plus-minus-3" | "7" | "14" | "30" | "week" | "month" | "custom";
  allowFutureCheckIn: boolean;
  dailyWeekStartsOn: 0 | 1;
  spellCheck: boolean;
  spellCheckLanguage: "en-US" | "fr-FR";
  autoPairBrackets: boolean;
  tabBehavior: "indent" | "focus";
  defaultNoteFolder: string;
  defaultTemplateId: string;
  recapProvider: "none" | "remote" | "local";
  recapEndpoint: string;
  recapModel: string;
  recapTemperature: number;
  recapMaxTokens: number;
  recapAggregatesOnly: boolean;
  recapAutoMonthly: boolean;
  recapAutoYearly: boolean;
  recapConsentedProviders: string[];
  aiRequestTimeoutSeconds: number;
  aiRepairTimeoutSeconds: number;
  aiMaxTokens: number;
  aiMapNoteOrganization: "tags" | "folder" | "both";
  aiMapFolderRoot: string;
  linkPreviewEnabled: boolean;
  linkPreviewSettingsVersion: number;
  updateEnabled: boolean;
  backupLocation: string;
  backupFrequency: "daily" | "weekly" | "launch";
  backupRetention: number;
  dashboardWidgetOrder: Record<Id, string[]>;
  dashboardHiddenWidgets: Record<Id, string[]>;
  rightPanelWidth: number;
  keymap: Record<string, string>;
}
