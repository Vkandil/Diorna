import { eachDayOfInterval, formatISO, parseISO } from "date-fns";
import { averageScoreByWeekday, completionScore, habitStatistics } from "@/modules/daily/logic";
import { longestReviewStreak } from "@/modules/student/flashcards";
import type {
  CalendarItem,
  CanvasMap,
  Course,
  Flashcard,
  FocusSession,
  Habit,
  HabitEntry,
  Metric,
  MetricEntry,
  Note,
  Project,
  RecapStatistics,
  ReviewLog,
  TrainingActivity,
  TrainingSession,
} from "@/shared/models";
import { sessionDistance, sessionDurationMinutes, sessionVolume } from "@/modules/training/logic";
import { focusPeriodStats } from "@/modules/focus/logic";

export interface RecapInput {
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  habits: Habit[];
  habitEntries: HabitEntry[];
  metrics: Metric[];
  metricEntries: MetricEntry[];
  items: CalendarItem[];
  notes: Note[];
  maps: CanvasMap[];
  flashcards: Flashcard[];
  reviewLogs: ReviewLog[];
  courses: Course[];
  trainingActivities?: TrainingActivity[];
  trainingSessions?: TrainingSession[];
  projects?: Project[];
  focusSessions?: FocusSession[];
  categoryNames: Record<string, string>;
}

export function recapTransmissionPayload(
  stats: RecapStatistics,
  aggregatesOnly: boolean,
): RecapStatistics {
  if (!aggregatesOnly) return structuredClone(stats);
  const habitNames = new Map(
    (stats.habits.rates ?? []).map((habit, index) => [habit.name, `Habit ${index + 1}`]),
  );
  const redactCategories = (values: Record<string, number>) =>
    Object.fromEntries(
      Object.values(values).map((value, index) => [`Category ${index + 1}`, value]),
    );
  return {
    ...structuredClone(stats),
    workspaceId: "redacted",
    habits: {
      ...stats.habits,
      ...(stats.habits.best
        ? {
            best: {
              ...stats.habits.best,
              name: habitNames.get(stats.habits.best.name) ?? "Habit",
            },
          }
        : {}),
      ...(stats.habits.worst
        ? {
            worst: {
              ...stats.habits.worst,
              name: habitNames.get(stats.habits.worst.name) ?? "Habit",
            },
          }
        : {}),
      rates: (stats.habits.rates ?? []).map((habit, index) => ({
        ...habit,
        name: `Habit ${index + 1}`,
      })),
    },
    metrics: stats.metrics.map((metric, index) => ({
      ...metric,
      name: `Metric ${index + 1}`,
      unit: "units",
    })),
    tasks: {
      ...stats.tasks,
      byCategory: redactCategories(stats.tasks.byCategory),
    },
    ...(stats.events
      ? {
          events: {
            ...stats.events,
            byCategory: redactCategories(stats.events.byCategory),
          },
        }
      : {}),
    notes: {
      ...stats.notes,
      titles: [],
      tags: {},
      courses: {},
    },
    flashcards: { ...stats.flashcards, courses: [] },
    ...(stats.training
      ? {
          training: {
            ...stats.training,
            byActivity: Object.fromEntries(
              Object.values(stats.training.byActivity).map((value, index) => [
                `Activity ${index + 1}`,
                value,
              ]),
            ),
          },
        }
      : {}),
    ...(stats.projects
      ? {
          projects: {
            ...stats.projects,
            completedNames: [],
          },
        }
      : {}),
    ...(stats.monthlyRecaps
      ? {
          monthlyRecaps: stats.monthlyRecaps.map((month) => ({
            ...month,
            metrics: Object.fromEntries(
              Object.values(month.metrics).map((value, index) => [`Metric ${index + 1}`, value]),
            ),
          })),
        }
      : {}),
  };
}

const inRange = (value: string | undefined, start: string, end: string) =>
  Boolean(value && value.slice(0, 10) >= start && value.slice(0, 10) <= end);

export function aggregateRecap(input: RecapInput): RecapStatistics {
  const periodDays = eachDayOfInterval({
    start: parseISO(input.periodStart),
    end: parseISO(input.periodEnd),
  });
  const durationDays = periodDays.length;
  const previousEnd = formatISO(new Date(parseISO(input.periodStart).getTime() - 86_400_000), {
    representation: "date",
  });
  const previousStart = input.previousPeriodStart;
  const habitStats = input.habits.map((habit) =>
    habitStatistics(
      habit,
      input.habitEntries,
      input.periodStart,
      input.periodEnd,
      input.periodEnd,
      true,
    ),
  );
  const previousHabitStats = input.habits.map((habit) =>
    habitStatistics(habit, input.habitEntries, previousStart, previousEnd, previousEnd, true),
  );
  const applicable = habitStats.reduce((sum, stat) => sum + stat.applicable, 0);
  const completed = habitStats.reduce((sum, stat) => sum + stat.completed, 0);
  const previousApplicable = previousHabitStats.reduce((sum, stat) => sum + stat.applicable, 0);
  const previousCompleted = previousHabitStats.reduce((sum, stat) => sum + stat.completed, 0);
  const rated = habitStats.filter((stat) => stat.rate !== null);
  const sorted = [...rated].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const habitById = new Map(input.habits.map((habit) => [habit.id, habit]));

  const metrics = input.metrics.flatMap((metric) => {
    const current = input.metricEntries
      .filter(
        (entry) =>
          entry.metricId === metric.id &&
          entry.date >= input.periodStart &&
          entry.date <= input.periodEnd,
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!current.length) return [];
    const first = current[0]!.value;
    const last = current.at(-1)!.value;
    const allBeforeEnd = input.metricEntries.filter(
      (entry) => entry.metricId === metric.id && entry.date <= input.periodEnd,
    );
    return [
      {
        name: metric.name,
        unit: metric.unit,
        first,
        last,
        absoluteChange: round(last - first),
        percentChange: first === 0 ? null : round(((last - first) / Math.abs(first)) * 100),
        personalRecord: last === Math.max(...allBeforeEnd.map((entry) => entry.value)),
        values: current.map((entry) => ({ date: entry.date, value: entry.value })),
      },
    ];
  });

  const completedItems = input.items.filter(
    (item) => item.kind === "task" && inRange(item.completedAt, input.periodStart, input.periodEnd),
  );
  const previousCompletedItems = input.items.filter(
    (item) => item.kind === "task" && inRange(item.completedAt, previousStart, previousEnd),
  );
  const byCategory: Record<string, number> = {};
  completedItems.forEach((item) => {
    const category = input.categoryNames[item.categoryId] ?? "Other";
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  });
  const onTime = completedItems.filter(
    (item) => !item.dueAt || (item.completedAt && item.completedAt <= item.dueAt),
  ).length;
  const attendedEvents = input.items.filter(
    (item) =>
      item.kind === "event" &&
      !item.trashedAt &&
      inRange(item.startAt, input.periodStart, input.periodEnd),
  );
  const eventsByCategory: Record<string, number> = {};
  attendedEvents.forEach((item) => {
    const category = input.categoryNames[item.categoryId] ?? "Other";
    eventsByCategory[category] = (eventsByCategory[category] ?? 0) + 1;
  });

  const createdNotes = input.notes.filter((note) =>
    inRange(note.createdAt, input.periodStart, input.periodEnd),
  );
  const editedNotes = input.notes.filter((note) =>
    inRange(note.updatedAt, input.periodStart, input.periodEnd),
  );
  const dailyScores = periodDays.map((date) => {
    const key = formatISO(date, { representation: "date" });
    return {
      date: key,
      score: completionScore(input.habits, input.habitEntries, key, true),
    };
  });
  const reviewed = input.reviewLogs.filter((log) =>
    inRange(log.reviewedAt, input.periodStart, input.periodEnd),
  );
  const cardsById = new Map(input.flashcards.map((card) => [card.id, card]));
  const notesById = new Map(input.notes.map((note) => [note.id, note]));
  const courseNamesById = new Map(input.courses.map((course) => [course.id, course.name]));
  const noteTags: Record<string, number> = {};
  const noteCourses: Record<string, number> = {};
  createdNotes.forEach((note) => {
    note.tags.forEach((tag) => (noteTags[tag] = (noteTags[tag] ?? 0) + 1));
    const course = note.courseId ? courseNamesById.get(note.courseId) : undefined;
    if (course) noteCourses[course] = (noteCourses[course] ?? 0) + 1;
  });
  const reviewedCourses = [
    ...new Set(
      reviewed.flatMap((log) => {
        const note = notesById.get(cardsById.get(log.flashcardId)?.noteId ?? "");
        const name = note?.courseId ? courseNamesById.get(note.courseId) : undefined;
        return name ? [name] : [];
      }),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const best = sorted[0];
  const worst = sorted.at(-1);
  const allTrainingSessions = (input.trainingSessions ?? []).filter(
    (session) => session.status === "completed",
  );
  const trainingSessions = allTrainingSessions.filter((session) =>
    inRange(session.startedAt, input.periodStart, input.periodEnd),
  );
  const previousTrainingSessions = allTrainingSessions.filter((session) =>
    inRange(session.startedAt, previousStart, previousEnd),
  );
  const activityNames = new Map(
    (input.trainingActivities ?? []).map((activity) => [activity.id, activity.name]),
  );
  const trainingByActivity: Record<string, number> = {};
  const distanceByUnit: Record<string, number> = {};
  trainingSessions.forEach((session) => {
    const name = activityNames.get(session.activityId) ?? "Training";
    trainingByActivity[name] = (trainingByActivity[name] ?? 0) + 1;
    Object.entries(sessionDistance(session)).forEach(([unit, distance]) => {
      distanceByUnit[unit] = round((distanceByUnit[unit] ?? 0) + distance);
    });
  });
  const previousExerciseBest = new Map<string, number>();
  allTrainingSessions
    .filter((session) => session.startedAt.slice(0, 10) < input.periodStart)
    .forEach((session) =>
      session.results.forEach((result) => {
        const bestLoad =
          result.loadMode === "assisted" ||
          result.loadMode === "bodyweight" ||
          result.loadMode === "none"
            ? 0
            : Math.max(0, ...result.sets.map((set) => set.load ?? 0));
        previousExerciseBest.set(
          result.exerciseId,
          Math.max(previousExerciseBest.get(result.exerciseId) ?? 0, bestLoad),
        );
      }),
    );
  const currentExerciseBest = new Map<string, number>();
  trainingSessions.forEach((session) =>
    session.results.forEach((result) => {
      const bestLoad =
        result.loadMode === "assisted" ||
        result.loadMode === "bodyweight" ||
        result.loadMode === "none"
          ? 0
          : Math.max(0, ...result.sets.map((set) => set.load ?? 0));
      currentExerciseBest.set(
        result.exerciseId,
        Math.max(currentExerciseBest.get(result.exerciseId) ?? 0, bestLoad),
      );
    }),
  );
  const projects = (input.projects ?? []).filter((project) => !project.archived);
  const focus = focusPeriodStats(input.focusSessions ?? [], input.periodStart, input.periodEnd);
  const previousFocus = focusPeriodStats(input.focusSessions ?? [], previousStart, previousEnd);
  const completedProjects = projects.filter((project) =>
    inRange(project.completedAt, input.periodStart, input.periodEnd),
  );
  const previousCompletedProjects = projects.filter((project) =>
    inRange(project.completedAt, previousStart, previousEnd),
  );
  const activeProjects = projects.filter((project) =>
    ["planned", "active", "on-hold"].includes(project.status),
  );
  const projectTasks = input.items.filter(
    (item) =>
      item.kind === "task" &&
      Boolean(item.projectId) &&
      !item.trashedAt &&
      (inRange(item.completedAt, input.periodStart, input.periodEnd) ||
        inRange(item.dueAt, input.periodStart, input.periodEnd)),
  );
  const completedProjectTasks = projectTasks.filter((item) => item.completedAt);
  const projectKinds: Record<string, number> = {};
  activeProjects.forEach((project) => {
    projectKinds[project.kind] = (projectKinds[project.kind] ?? 0) + 1;
  });
  const stats: RecapStatistics = {
    workspaceId: input.workspaceId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    previousPeriodStart: previousStart,
    habits: {
      overallRate: applicable ? Math.round((completed / applicable) * 100) : null,
      previousRate: previousApplicable
        ? Math.round((previousCompleted / previousApplicable) * 100)
        : null,
      ...(best
        ? {
            best: {
              name: habitById.get(best.habitId)?.name ?? "Habit",
              rate: best.rate!,
            },
          }
        : {}),
      ...(worst
        ? {
            worst: {
              name: habitById.get(worst.habitId)?.name ?? "Habit",
              rate: worst.rate!,
            },
          }
        : {}),
      rates: habitStats.map((stat) => ({
        name: habitById.get(stat.habitId)?.name ?? "Habit",
        rate: stat.rate,
        currentStreak: stat.currentStreak,
        longestStreak: stat.longestStreak,
      })),
      weekdayAverages: averageScoreByWeekday(
        input.habits,
        input.habitEntries,
        input.periodStart,
        input.periodEnd,
        true,
      ),
    },
    metrics,
    tasks: {
      completed: completedItems.length,
      previousCompleted: previousCompletedItems.length,
      onTime,
      overdue: completedItems.length - onTime,
      byCategory,
    },
    events: {
      attended: attendedEvents.length,
      byCategory: eventsByCategory,
    },
    notes: {
      created: createdNotes.length,
      edited: editedNotes.length,
      wordsWritten: createdNotes.reduce((sum, note) => sum + note.wordCount, 0),
      titles: createdNotes.map((note) => note.title),
      tags: noteTags,
      courses: noteCourses,
    },
    maps: {
      created: input.maps.filter((map) =>
        inRange(map.updatedAt, input.periodStart, input.periodEnd),
      ).length,
      nodesCreated: input.maps
        .filter((map) => inRange(map.updatedAt, input.periodStart, input.periodEnd))
        .reduce((sum, map) => sum + map.nodes.length, 0),
    },
    flashcards: {
      reviewed: reviewed.length,
      retentionRate: reviewed.length
        ? Math.round(
            (reviewed.filter((log) => log.grade !== "again").length / reviewed.length) * 100,
          )
        : null,
      streak: longestReviewStreak(reviewed.map((log) => log.reviewedAt)),
      courses: reviewedCourses,
    },
    training: {
      sessions: trainingSessions.length,
      previousSessions: previousTrainingSessions.length,
      durationMinutes: trainingSessions.reduce(
        (sum, session) => sum + sessionDurationMinutes(session),
        0,
      ),
      previousDurationMinutes: previousTrainingSessions.reduce(
        (sum, session) => sum + sessionDurationMinutes(session),
        0,
      ),
      volume: round(trainingSessions.reduce((sum, session) => sum + sessionVolume(session), 0)),
      distanceByUnit,
      byActivity: trainingByActivity,
      personalRecords: [...currentExerciseBest].filter(
        ([exerciseId, value]) => value > (previousExerciseBest.get(exerciseId) ?? 0),
      ).length,
    },
    projects: {
      active: activeProjects.length,
      completed: completedProjects.length,
      previousCompleted: previousCompletedProjects.length,
      atRisk: activeProjects.filter((project) => project.health !== "on-track").length,
      milestonesCompleted: projects.reduce(
        (sum, project) =>
          sum +
          project.milestones.filter((milestone) =>
            inRange(milestone.completedAt, input.periodStart, input.periodEnd),
          ).length,
        0,
      ),
      tasksCompleted: completedProjectTasks.length,
      taskCompletionRate: projectTasks.length
        ? Math.round((completedProjectTasks.length / projectTasks.length) * 100)
        : null,
      byKind: projectKinds,
      completedNames: completedProjects.map((project) => project.name),
    },
    focus: {
      sessions: focus.sessions,
      previousSessions: previousFocus.sessions,
      plannedMinutes: focus.plannedMinutes,
      actualMinutes: focus.actualMinutes,
      previousActualMinutes: previousFocus.actualMinutes,
      completedAsPlanned: focus.completedAsPlanned,
      focusRating: focus.averageRating,
      distractions: focus.distractions,
      byMode: focus.byMode,
    },
    dailyScores,
  };
  void durationDays;
  return stats;
}

export function buildTemplateNarrative(stats: RecapStatistics, workspaceName: string): string {
  const habitDelta =
    stats.habits.overallRate !== null && stats.habits.previousRate !== null
      ? stats.habits.overallRate - stats.habits.previousRate
      : null;
  const metricLines = stats.metrics.map(
    (metric) =>
      `**${metric.name}: ${metric.absoluteChange >= 0 ? "progress" : "decline"}.** ${metric.first} → ${metric.last} ${metric.unit}${metric.percentChange === null ? "" : ` (${signed(metric.percentChange)}%)`}.${metric.personalRecord ? " This is a new personal record." : ""}`,
  );
  const taskDelta = stats.tasks.completed - stats.tasks.previousCompleted;
  const categoryLines = Object.entries(stats.tasks.byCategory).map(
    ([category, count]) =>
      `**${category}.** ${count} completed task${count === 1 ? "" : "s"} in this category.`,
  );
  const eventLines = Object.entries(stats.events?.byCategory ?? {}).map(
    ([category, count]) =>
      `**${category} events.** ${count} attended event${count === 1 ? "" : "s"} in this category.`,
  );
  const habitLine =
    stats.habits.overallRate === null
      ? "**Habits.** No applicable habits were tracked in this period."
      : `**Habits.** Overall completion was ${stats.habits.overallRate}%${habitDelta === null ? "" : habitDelta === 0 ? ", unchanged from the previous period" : `, ${habitDelta > 0 ? "up" : "down"} ${Math.abs(habitDelta)} points`}. ${stats.habits.best ? `Strongest: ${stats.habits.best.name} at ${stats.habits.best.rate}%.` : ""}${stats.habits.worst ? ` Weakest: ${stats.habits.worst.name} at ${stats.habits.worst.rate}%.` : ""}`;
  const trainingLine = stats.training?.sessions
    ? `**Training.** You completed ${stats.training.sessions} session${stats.training.sessions === 1 ? "" : "s"} over ${stats.training.durationMinutes} minutes${stats.training.volume ? `, with ${stats.training.volume} total strength volume` : ""}.${stats.training.personalRecords ? ` ${stats.training.personalRecords} exercise record${stats.training.personalRecords === 1 ? "" : "s"} improved.` : ""}`
    : "**Training.** No completed training sessions were recorded in this period.";
  const projectLine = stats.projects
    ? `**Projects.** ${stats.projects.active} active, ${stats.projects.completed} completed and ${stats.projects.atRisk} needing attention. ${stats.projects.milestonesCompleted} milestone${stats.projects.milestonesCompleted === 1 ? "" : "s"} and ${stats.projects.tasksCompleted} linked task${stats.projects.tasksCompleted === 1 ? "" : "s"} were completed.${stats.projects.completedNames.length ? ` Finished: ${stats.projects.completedNames.join(", ")}.` : ""}`
    : "";
  const focusLine = stats.focus
    ? `**Focus.** You protected ${stats.focus.actualMinutes} minutes across ${stats.focus.sessions} completed session${stats.focus.sessions === 1 ? "" : "s"}, compared with ${stats.focus.plannedMinutes} minutes planned.${stats.focus.focusRating === null ? "" : ` Average focus quality was ${stats.focus.focusRating}/5.`} ${stats.focus.distractions} distraction${stats.focus.distractions === 1 ? " was" : "s were"} captured rather than acted on immediately.`
    : "";
  return [
    `# ${stats.periodStart} to ${stats.periodEnd} — ${workspaceName}`,
    `**Tasks.** You completed ${stats.tasks.completed} task${stats.tasks.completed === 1 ? "" : "s"}, ${Math.abs(taskDelta)} ${taskDelta >= 0 ? "more" : "fewer"} than the previous period. ${stats.tasks.onTime} were completed on time.`,
    ...categoryLines,
    ...eventLines,
    ...metricLines,
    habitLine,
    ...(projectLine ? [projectLine] : []),
    ...(focusLine ? [focusLine] : []),
    trainingLine,
    `**Knowledge work.** You created ${stats.notes.created} notes, edited ${stats.notes.edited}, and added ${stats.notes.wordsWritten} words. You created ${stats.maps.created} maps containing ${stats.maps.nodesCreated} nodes.`,
    ...(stats.flashcards.reviewed
      ? [
          `**Study.** You reviewed ${stats.flashcards.reviewed} flashcard${stats.flashcards.reviewed === 1 ? "" : "s"} with ${stats.flashcards.retentionRate}% retention and a ${stats.flashcards.streak}-day streak${stats.flashcards.courses.length ? ` across ${stats.flashcards.courses.join(", ")}` : ""}.`,
        ]
      : []),
  ].join("\n\n");
}

export function validateNarrativeNumbers(
  narrative: string,
  stats: RecapStatistics,
): { valid: boolean; unexpected: number[] } {
  const allowed = new Set<number>();
  collectNumbers(stats, allowed);
  allowed.add(Math.abs(stats.tasks.completed - stats.tasks.previousCompleted));
  if (stats.habits.overallRate !== null && stats.habits.previousRate !== null) {
    allowed.add(Math.abs(stats.habits.overallRate - stats.habits.previousRate));
  }
  const values = [...narrative.matchAll(/(?<![\p{L}\d])[-+]?\d+(?:\.\d+)?/gu)].map((match) =>
    Number(match[0]),
  );
  const unexpected = values.filter((value) => !allowed.has(value) && !allowed.has(Math.abs(value)));
  return { valid: unexpected.length === 0, unexpected };
}

function collectNumbers(value: unknown, target: Set<number>): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target.add(value);
    target.add(Math.abs(value));
    return;
  }
  if (Array.isArray(value)) value.forEach((entry) => collectNumbers(entry, target));
  else if (typeof value === "string") {
    for (const match of value.matchAll(/\d+(?:\.\d+)?/g)) target.add(Number(match[0]));
  } else if (value && typeof value === "object")
    Object.values(value).forEach((entry) => collectNumbers(entry, target));
}

const round = (value: number) => Math.round(value * 10) / 10;
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
