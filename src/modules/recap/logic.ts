import { eachDayOfInterval, formatISO, parseISO } from "date-fns";
import { completionScore, habitStatistics } from "@/modules/daily/logic";
import type {
  CalendarItem,
  CanvasMap,
  Flashcard,
  Habit,
  HabitEntry,
  Metric,
  MetricEntry,
  Note,
  RecapStatistics,
} from "@/shared/models";

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
  categoryNames: Record<string, string>;
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
    habitStatistics(habit, input.habitEntries, input.periodStart, input.periodEnd, input.periodEnd),
  );
  const previousHabitStats = input.habits.map((habit) =>
    habitStatistics(habit, input.habitEntries, previousStart, previousEnd, previousEnd),
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
      score: completionScore(input.habits, input.habitEntries, key),
    };
  });

  const best = sorted[0];
  const worst = sorted.at(-1);
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
    },
    metrics,
    tasks: {
      completed: completedItems.length,
      previousCompleted: previousCompletedItems.length,
      onTime,
      overdue: completedItems.length - onTime,
      byCategory,
    },
    notes: {
      created: createdNotes.length,
      edited: editedNotes.length,
      wordsWritten: createdNotes.reduce((sum, note) => sum + note.wordCount, 0),
      titles: createdNotes.map((note) => note.title),
    },
    maps: {
      created: input.maps.filter((map) =>
        inRange(map.updatedAt, input.periodStart, input.periodEnd),
      ).length,
      nodesCreated: input.maps
        .filter((map) => inRange(map.updatedAt, input.periodStart, input.periodEnd))
        .reduce((sum, map) => sum + map.nodes.length, 0),
    },
    flashcards: { reviewed: 0, retentionRate: null, courses: [] },
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
  const habitLine =
    stats.habits.overallRate === null
      ? "**Habits.** No applicable habits were tracked in this period."
      : `**Habits.** Overall completion was ${stats.habits.overallRate}%${habitDelta === null ? "" : `, ${habitDelta >= 0 ? "up" : "down"} ${Math.abs(habitDelta)} points`}. ${stats.habits.best ? `Strongest: ${stats.habits.best.name} at ${stats.habits.best.rate}%.` : ""}${stats.habits.worst ? ` Weakest: ${stats.habits.worst.name} at ${stats.habits.worst.rate}%.` : ""}`;
  return [
    `# ${stats.periodStart} to ${stats.periodEnd} — ${workspaceName}`,
    `**Tasks.** You completed ${stats.tasks.completed} task${stats.tasks.completed === 1 ? "" : "s"}, ${Math.abs(taskDelta)} ${taskDelta >= 0 ? "more" : "fewer"} than the previous period. ${stats.tasks.onTime} were completed on time.`,
    ...metricLines,
    habitLine,
    `**Knowledge work.** You created ${stats.notes.created} notes, edited ${stats.notes.edited}, and added ${stats.notes.wordsWritten} words. You created ${stats.maps.created} maps containing ${stats.maps.nodesCreated} nodes.`,
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
