import {
  differenceInCalendarDays,
  eachDayOfInterval,
  formatISO,
  parseISO,
  subDays,
} from "date-fns";
import type { Habit, HabitEntry, ISODate } from "@/shared/models";

export interface HabitStat {
  habitId: string;
  completed: number;
  applicable: number;
  rate: number | null;
  currentStreak: number;
  longestStreak: number;
}

export function dateKey(date: Date): ISODate {
  return formatISO(date, { representation: "date" });
}

export function isHabitApplicable(habit: Habit, date: ISODate): boolean {
  if (habit.archived) return false;
  if (habit.startDate && date < habit.startDate) return false;
  if (habit.endDate && date > habit.endDate) return false;
  return habit.activeWeekdays.includes(parseISO(date).getDay());
}

export function isEntryComplete(habit: Habit, entry?: HabitEntry): boolean {
  if (!entry) return false;
  if (habit.type === "checkbox") return entry.done;
  return entry.value !== undefined && entry.value >= (habit.target ?? 0);
}

export function completionScore(
  habits: Habit[],
  entries: HabitEntry[],
  date: ISODate,
): number | null {
  const applicable = habits.filter((habit) => isHabitApplicable(habit, date));
  if (applicable.length === 0) return null;
  const entryByHabit = new Map(
    entries.filter((entry) => entry.date === date).map((entry) => [entry.habitId, entry]),
  );
  const completed = applicable.filter((habit) =>
    isEntryComplete(habit, entryByHabit.get(habit.id)),
  ).length;
  return Math.round((completed / applicable.length) * 100);
}

export function habitStatistics(
  habit: Habit,
  entries: HabitEntry[],
  start: ISODate,
  end: ISODate,
  today = dateKey(new Date()),
): HabitStat {
  const relevant = new Map(
    entries.filter((entry) => entry.habitId === habit.id).map((entry) => [entry.date, entry]),
  );
  const dates = eachDayOfInterval({
    start: parseISO(start),
    end: parseISO(end),
  }).map(dateKey);
  const applicableDates = dates.filter((date) => isHabitApplicable(habit, date));
  const completed = applicableDates.filter((date) =>
    isEntryComplete(habit, relevant.get(date)),
  ).length;

  let longestStreak = 0;
  let running = 0;
  for (const date of applicableDates) {
    if (isEntryComplete(habit, relevant.get(date))) {
      running += 1;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 0;
    }
  }

  let currentStreak = 0;
  let cursor = parseISO(today);
  const earliest = habit.startDate
    ? parseISO(habit.startDate)
    : subDays(cursor, Math.max(3660, differenceInCalendarDays(parseISO(end), parseISO(start))));
  while (cursor >= earliest) {
    const key = dateKey(cursor);
    if (isHabitApplicable(habit, key)) {
      if (!isEntryComplete(habit, relevant.get(key))) break;
      currentStreak += 1;
    }
    cursor = subDays(cursor, 1);
  }

  return {
    habitId: habit.id,
    completed,
    applicable: applicableDates.length,
    rate: applicableDates.length ? Math.round((completed / applicableDates.length) * 100) : null,
    currentStreak,
    longestStreak,
  };
}

export function averageScoreByWeekday(
  habits: Habit[],
  entries: HabitEntry[],
  start: ISODate,
  end: ISODate,
): Array<number | null> {
  const buckets = Array.from({ length: 7 }, () => [] as number[]);
  for (const day of eachDayOfInterval({
    start: parseISO(start),
    end: parseISO(end),
  })) {
    const score = completionScore(habits, entries, dateKey(day));
    if (score !== null) buckets[day.getDay()]?.push(score);
  }
  return buckets.map((scores) =>
    scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null,
  );
}
