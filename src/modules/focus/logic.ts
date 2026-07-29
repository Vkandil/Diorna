import type {
  CalendarItem,
  FocusMode,
  FocusPriority,
  FocusSession,
  Project,
} from "@/shared/models";

export interface FocusRecommendation {
  id: string;
  type: "calendar" | "project";
  title: string;
  detail: string;
  sourceId: string;
  plannedMinutes: number;
  urgency: "overdue" | "today" | "soon" | "normal";
}

export interface FocusPeriodStats {
  sessions: number;
  plannedMinutes: number;
  actualMinutes: number;
  completedAsPlanned: number;
  accuracy: number | null;
  averageRating: number | null;
  distractions: number;
  byMode: Record<string, number>;
}

export const focusModeLabels: Record<FocusMode, string> = {
  "deep-work": "Deep work",
  study: "Study",
  creative: "Creative",
  admin: "Admin",
  "meeting-prep": "Meeting prep",
  personal: "Personal",
};

export interface FocusTimerState {
  elapsedSeconds: number;
  remainingSeconds: number;
  overtimeSeconds: number;
  displaySeconds: number;
  overtime: boolean;
}

export function focusElapsedSeconds(session: FocusSession, now = Date.now()): number {
  const live =
    session.status === "running" && session.timerStartedAt
      ? Math.max(0, Math.floor((now - Date.parse(session.timerStartedAt)) / 1_000))
      : 0;
  return Math.max(0, session.elapsedSeconds + live);
}

export function focusTimerState(session: FocusSession, now = Date.now()): FocusTimerState {
  const elapsedSeconds = focusElapsedSeconds(session, now);
  const plannedSeconds = session.plannedMinutes * 60;
  const overtime = elapsedSeconds > plannedSeconds;
  const remainingSeconds = Math.max(0, plannedSeconds - elapsedSeconds);
  const overtimeSeconds = Math.max(0, elapsedSeconds - plannedSeconds);
  return {
    elapsedSeconds,
    remainingSeconds,
    overtimeSeconds,
    displaySeconds: overtime ? overtimeSeconds : remainingSeconds,
    overtime,
  };
}

export function formatFocusTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function findFocusStudioSession(sessions: FocusSession[]): FocusSession | undefined {
  return sessions
    .filter((session) => session.status === "running" || session.status === "paused")
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "running" ? -1 : 1;
      return right.updatedAt.localeCompare(left.updatedAt);
    })[0];
}

export function focusActualMinutes(session: FocusSession, now = Date.now()): number {
  return Math.round(focusElapsedSeconds(session, now) / 60);
}

export function focusProgress(session: FocusSession, now = Date.now()): number {
  const plannedSeconds = Math.max(60, session.plannedMinutes * 60);
  return Math.min(100, Math.round((focusElapsedSeconds(session, now) / plannedSeconds) * 100));
}

export function focusPeriodStats(
  sessions: FocusSession[],
  startDate: string,
  endDate: string,
): FocusPeriodStats {
  const completed = sessions.filter(
    (session) =>
      session.status === "completed" &&
      Boolean(session.endedAt) &&
      session.endedAt!.slice(0, 10) >= startDate &&
      session.endedAt!.slice(0, 10) <= endDate,
  );
  const plannedMinutes = completed.reduce((sum, session) => sum + session.plannedMinutes, 0);
  const actualMinutes = completed.reduce((sum, session) => sum + focusActualMinutes(session), 0);
  const completedAsPlanned = completed.filter(
    (session) => focusActualMinutes(session) >= session.plannedMinutes * 0.8,
  ).length;
  const ratings = completed.flatMap((session) =>
    session.review?.focusRating ? [session.review.focusRating] : [],
  );
  const byMode: Record<string, number> = {};
  completed.forEach((session) => {
    byMode[session.mode] = (byMode[session.mode] ?? 0) + focusActualMinutes(session);
  });
  return {
    sessions: completed.length,
    plannedMinutes,
    actualMinutes,
    completedAsPlanned,
    accuracy: plannedMinutes ? Math.round((actualMinutes / plannedMinutes) * 100) : null,
    averageRating: ratings.length
      ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
      : null,
    distractions: completed.reduce((sum, session) => sum + session.distractions.length, 0),
    byMode,
  };
}

export function buildFocusRecommendations(
  items: CalendarItem[],
  projects: Project[],
  now = new Date(),
): {
  urgent: FocusRecommendation[];
  upcoming: FocusRecommendation[];
  projectActions: FocusRecommendation[];
} {
  const timestamp = now.getTime();
  const today = localDate(now);
  const tomorrow = localDate(new Date(timestamp + 86_400_000));
  const openItems = items.filter((item) => !item.trashedAt && !item.completedAt);
  const urgent = openItems
    .filter((item) => {
      if (item.kind !== "task") return false;
      const due = item.dueAt ?? item.startAt;
      return Boolean(due && (due.slice(0, 10) <= tomorrow || item.priority === "high"));
    })
    .sort((left, right) => {
      const priority = (value: CalendarItem) =>
        value.priority === "high" ? 0 : value.priority === "medium" ? 1 : 2;
      return (
        priority(left) - priority(right) ||
        (left.dueAt ?? left.startAt ?? "").localeCompare(right.dueAt ?? right.startAt ?? "")
      );
    })
    .slice(0, 6)
    .map((item) => {
      const due = item.dueAt ?? item.startAt!;
      const date = localDate(new Date(due));
      return {
        id: `calendar-${item.id}`,
        type: "calendar" as const,
        title: item.title,
        detail: date < today ? `Overdue · ${date}` : date === today ? "Due today" : `Due ${date}`,
        sourceId: item.id,
        plannedMinutes: 45,
        urgency:
          date < today
            ? ("overdue" as const)
            : date === today
              ? ("today" as const)
              : ("soon" as const),
      };
    });

  const upcoming = openItems
    .filter(
      (item) =>
        item.kind === "event" &&
        Boolean(item.startAt) &&
        Date.parse(item.startAt!) >= timestamp &&
        Date.parse(item.startAt!) <= timestamp + 48 * 3_600_000,
    )
    .sort((left, right) => left.startAt!.localeCompare(right.startAt!))
    .slice(0, 6)
    .map((item) => ({
      id: `event-${item.id}`,
      type: "calendar" as const,
      title: item.title,
      detail: new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(item.startAt!)),
      sourceId: item.id,
      plannedMinutes: 25,
      urgency:
        localDate(new Date(item.startAt!)) === today ? ("today" as const) : ("soon" as const),
    }));

  const projectActions = projects
    .filter(
      (project) =>
        !project.archived &&
        ["planned", "active"].includes(project.status) &&
        Boolean(project.nextAction.trim()),
    )
    .sort((left, right) => {
      const health = (value: Project) =>
        value.health === "blocked" ? 0 : value.health === "at-risk" ? 1 : 2;
      return health(left) - health(right) || right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 5)
    .map((project) => ({
      id: `project-${project.id}`,
      type: "project" as const,
      title: project.nextAction,
      detail: `${project.name} · ${project.health.replace("-", " ")}`,
      sourceId: project.id,
      plannedMinutes: 50,
      urgency:
        project.health === "blocked"
          ? ("overdue" as const)
          : project.health === "at-risk"
            ? ("soon" as const)
            : ("normal" as const),
    }));
  return { urgent, upcoming, projectActions };
}

export function orderedFocusPriorities(priorities: FocusPriority[], date: string): FocusPriority[] {
  return priorities
    .filter((priority) => priority.date === date)
    .sort(
      (left, right) =>
        Number(Boolean(left.completedAt)) - Number(Boolean(right.completedAt)) ||
        left.sortOrder - right.sortOrder,
    );
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
