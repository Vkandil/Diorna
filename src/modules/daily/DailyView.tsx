import { useMemo, useRef, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isFuture,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  Plus,
  Target,
} from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import {
  completionScore,
  dateKey,
  habitStatistics,
  isEntryComplete,
  isHabitApplicable,
} from "./logic";
import type { Habit } from "@/shared/models";
import { exportNativeXlsx } from "@/core/native";

type Preset = "plus-minus-3" | "7" | "14" | "30" | "week" | "month";

export function DailyView() {
  const state = useDiornaStore();
  const habits = selectWorkspace(state.habits, state.activeWorkspaceId)
    .filter((habit) => !habit.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const entries = selectWorkspace(state.habitEntries, state.activeWorkspaceId);
  const [center, setCenter] = useState(new Date());
  const [preset, setPreset] = useState<Preset>("plus-minus-3");
  const [mode, setMode] = useState<"habits" | "metrics">("habits");
  const dates = useMemo(() => rangeFor(center, preset), [center, preset]);
  const score = completionScore(habits, entries, dateKey(new Date()));
  const habitRows = () => [
    ["Habit", ...dates.map(dateKey)],
    ...habits.map((habit) => [
      habit.name,
      ...dates.map((date) => {
        const entry = entries.find(
          (value) => value.habitId === habit.id && value.date === dateKey(date),
        );
        return habit.type === "quantity"
          ? String(entry?.value ?? "")
          : isEntryComplete(habit, entry)
            ? "1"
            : "0";
      }),
    ]),
  ];
  const exportCsv = () => {
    const rows = habitRows();
    const blob = new Blob([rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `diorna-daily-${dateKey(dates[0]!)}-${dateKey(dates.at(-1)!)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const exportXlsx = () => {
    const metrics = selectWorkspace(state.metrics, state.activeWorkspaceId);
    const metricEntries = selectWorkspace(state.metricEntries, state.activeWorkspaceId);
    const metricRows = [
      ["Metric", "Unit", ...dates.map(dateKey)],
      ...metrics.map((metric) => [
        metric.name,
        metric.unit,
        ...dates.map((date) =>
          String(
            metricEntries.find(
              (entry) => entry.metricId === metric.id && entry.date === dateKey(date),
            )?.value ?? "",
          ),
        ),
      ]),
    ];
    void exportNativeXlsx(`diorna-daily-${dateKey(dates[0]!)}-${dateKey(dates.at(-1)!)}.xlsx`, [
      { name: "Habits", rows: habitRows() },
      { name: "Metrics", rows: metricRows },
    ]);
  };
  return (
    <div className="daily-page">
      <header className="module-toolbar">
        <div>
          <span className="eyebrow">Today</span>
          <strong className="daily-score">{score === null ? "—" : `${score}% done`}</strong>
        </div>
        <div className="score-progress">
          <i style={{ width: `${score ?? 0}%` }} />
        </div>
        <span className="toolbar-spacer" />
        <div className="segmented">
          <button className={mode === "habits" ? "active" : ""} onClick={() => setMode("habits")}>
            Habits
          </button>
          <button className={mode === "metrics" ? "active" : ""} onClick={() => setMode("metrics")}>
            Metrics
          </button>
        </div>
        <button className="icon-button" onClick={() => setCenter(addDays(center, -dates.length))}>
          <ChevronLeft />
        </button>
        <button className="button" onClick={() => setCenter(new Date())}>
          Today
        </button>
        <button className="icon-button" onClick={() => setCenter(addDays(center, dates.length))}>
          <ChevronRight />
        </button>
        <select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}>
          <option value="plus-minus-3">±3 days</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
        <button className="button icon-text" onClick={exportCsv}>
          <Download /> CSV
        </button>
        <button className="button icon-text" onClick={exportXlsx}>
          <Download /> XLSX
        </button>
      </header>
      {mode === "habits" ? (
        <HabitGrid habits={habits} dates={dates} />
      ) : (
        <MetricsGrid dates={dates} />
      )}
      <StatisticsSummary habits={habits} />
    </div>
  );
}

function HabitGrid({ habits, dates }: { habits: Habit[]; dates: Date[] }) {
  const state = useDiornaStore();
  const entries = selectWorkspace(state.habitEntries, state.activeWorkspaceId);
  const categories = selectWorkspace(state.categories, state.activeWorkspaceId);
  const [cursor, setCursor] = useState({
    row: 0,
    col: dates.findIndex((date) => isSameDay(date, new Date())),
  });
  const ref = useRef<HTMLDivElement>(null);
  const grouped = categories
    .map((category) => ({
      category,
      habits: habits.filter((habit) => habit.categoryId === category.id),
    }))
    .filter((group) => group.habits.length);
  const act = (habit: Habit, date: Date, direct?: string) => {
    if (isFuture(date) && !state.settings.allowFutureCheckIn) return;
    const key = dateKey(date);
    const entry = entries.find((value) => value.habitId === habit.id && value.date === key);
    if (habit.type === "quantity")
      state.updateHabitEntry(
        habit.id,
        key,
        direct ? Number(direct) : (entry?.value ?? habit.target ?? 1),
      );
    else state.updateHabitEntry(habit.id, key, !isEntryComplete(habit, entry));
  };
  const keyboard = (event: React.KeyboardEvent) => {
    if (!habits.length) return;
    if (event.key === "ArrowLeft")
      setCursor((value) => ({ ...value, col: Math.max(0, value.col - 1) }));
    else if (event.key === "ArrowRight")
      setCursor((value) => ({
        ...value,
        col: Math.min(dates.length - 1, value.col + 1),
      }));
    else if (event.key === "ArrowUp")
      setCursor((value) => ({ ...value, row: Math.max(0, value.row - 1) }));
    else if (event.key === "ArrowDown" || event.key === "Tab") {
      event.preventDefault();
      setCursor((value) => ({
        ...value,
        row: Math.min(habits.length - 1, value.row + 1),
      }));
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const habit = habits[cursor.row];
      const date = dates[cursor.col];
      if (habit && date) act(habit, date);
    } else if (/^\d$/.test(event.key)) {
      const habit = habits[cursor.row];
      const date = dates[cursor.col];
      if (habit?.type === "quantity" && date) act(habit, date, event.key);
    }
  };
  return (
    <div
      className="daily-grid-wrap"
      ref={ref}
      tabIndex={0}
      onKeyDown={keyboard}
      aria-label="Habit grid"
    >
      <div className="daily-grid" style={{ "--days": dates.length } as React.CSSProperties}>
        <div className="grid-corner">
          <strong>Habit</strong>
          <small>{habits.length} active</small>
        </div>
        {dates.map((date) => {
          const score = completionScore(habits, entries, dateKey(date));
          return (
            <div
              className={`date-cell ${isSameDay(date, new Date()) ? "today" : ""} ${[0, 6].includes(date.getDay()) ? "weekend" : ""}`}
              key={date.toISOString()}
            >
              <small>{format(date, "EEE")}</small>
              <strong>{format(date, "d")}</strong>
              <span>{score === null ? "—" : `${score}%`}</span>
            </div>
          );
        })}
        {grouped.map(({ category, habits: groupHabits }) => (
          <GroupRows
            key={category.id}
            category={category}
            habits={groupHabits}
            allHabits={habits}
            dates={dates}
            cursor={cursor}
            setCursor={setCursor}
            act={act}
            entries={entries}
          />
        ))}
      </div>
    </div>
  );
}

function GroupRows({
  category,
  habits,
  allHabits,
  dates,
  cursor,
  setCursor,
  act,
  entries,
}: {
  category: ReturnType<
    typeof selectWorkspace<ReturnType<typeof useDiornaStore.getState>["categories"][number]>
  >[number];
  habits: Habit[];
  allHabits: Habit[];
  dates: Date[];
  cursor: { row: number; col: number };
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>;
  act: (habit: Habit, date: Date, direct?: string) => void;
  entries: ReturnType<typeof useDiornaStore.getState>["habitEntries"];
}) {
  const categoryHabits = habits;
  const aggregate = dates
    .map((date) => completionScore(categoryHabits, entries, dateKey(date)))
    .filter((score): score is number => score !== null);
  return (
    <>
      <div className="group-row" style={{ "--category": category.color } as React.CSSProperties}>
        <span>
          <i />
          {category.name}
        </span>
        <strong>
          {aggregate.length
            ? `${Math.round(aggregate.reduce((a, b) => a + b, 0) / aggregate.length)}%`
            : "—"}
        </strong>
      </div>
      <div className="group-fill" />
      {dates.map((date) => (
        <div key={`${category.id}-${date.toISOString()}`} className="group-fill" />
      ))}
      {habits.map((habit) => {
        const stat = habitStatistics(habit, entries, dateKey(dates[0]!), dateKey(dates.at(-1)!));
        const rowIndex = allHabits.findIndex((entry) => entry.id === habit.id);
        return (
          <HabitRow
            key={habit.id}
            habit={habit}
            dates={dates}
            entries={entries}
            stat={stat}
            rowIndex={rowIndex}
            cursor={cursor}
            setCursor={setCursor}
            act={act}
          />
        );
      })}
    </>
  );
}

function HabitRow({
  habit,
  dates,
  entries,
  stat,
  rowIndex,
  cursor,
  setCursor,
  act,
}: {
  habit: Habit;
  dates: Date[];
  entries: ReturnType<typeof useDiornaStore.getState>["habitEntries"];
  stat: ReturnType<typeof habitStatistics>;
  rowIndex: number;
  cursor: { row: number; col: number };
  setCursor: React.Dispatch<React.SetStateAction<{ row: number; col: number }>>;
  act: (habit: Habit, date: Date, direct?: string) => void;
}) {
  return (
    <>
      <div className="habit-name">
        <span>{habit.name}</span>
        <small>
          {habit.type === "quantity"
            ? `${habit.target ?? 0} ${habit.unit ?? ""}`
            : `${stat.currentStreak}d streak`}
        </small>
        <button>
          <MoreHorizontal />
        </button>
      </div>
      {dates.map((date, col) => {
        const key = dateKey(date);
        const applicable = isHabitApplicable(habit, key);
        const entry = entries.find((value) => value.habitId === habit.id && value.date === key);
        const complete = isEntryComplete(habit, entry);
        const locked = isFuture(date) && !useDiornaStore.getState().settings.allowFutureCheckIn;
        return (
          <button
            key={key}
            className={`habit-cell ${cursor.row === rowIndex && cursor.col === col ? "cursor" : ""} ${complete ? "complete" : ""}`}
            disabled={!applicable || locked}
            onFocus={() => setCursor({ row: rowIndex, col })}
            onClick={() => act(habit, date)}
          >
            {habit.type === "quantity" ? (
              <span>
                {entry?.value ?? "·"}
                <small>{habit.unit}</small>
              </span>
            ) : complete ? (
              <Check />
            ) : (
              <i />
            )}
          </button>
        );
      })}
    </>
  );
}

function MetricsGrid({ dates: _dates }: { dates: Date[] }) {
  const state = useDiornaStore();
  const metrics = selectWorkspace(state.metrics, state.activeWorkspaceId);
  const entries = selectWorkspace(state.metricEntries, state.activeWorkspaceId);
  return (
    <div className="metrics-panel">
      <header>
        <div>
          <Target />
          <h2>Tracked metrics</h2>
          <p>Numeric series for progress and recaps.</p>
        </div>
        <button className="button primary">
          <Plus /> Add metric
        </button>
      </header>
      {metrics.map((metric) => {
        const values = entries
          .filter((entry) => entry.metricId === metric.id)
          .sort((a, b) => a.date.localeCompare(b.date));
        const first = values[0]?.value;
        const last = values.at(-1)?.value;
        return (
          <div className="metric-row" key={metric.id}>
            <span>
              <strong>{metric.name}</strong>
              <small>
                Target {metric.target ?? "—"} {metric.unit}
              </small>
            </span>
            <div className="sparkline">
              {values.map((entry, index) => (
                <i
                  key={entry.date}
                  style={{
                    height: `${Math.max(8, (entry.value / Math.max(...values.map((v) => v.value))) * 46)}px`,
                    left: `${(index / Math.max(1, values.length - 1)) * 100}%`,
                  }}
                />
              ))}
            </div>
            <strong>
              {last ?? "—"} {metric.unit}
            </strong>
            <b>
              {first && last
                ? `${last - first >= 0 ? "+" : ""}${Math.round(((last - first) / first) * 100)}%`
                : "—"}
            </b>
          </div>
        );
      })}
      {!metrics.length && (
        <div className="empty-state">
          <BarChart3 />
          <h2>No metrics yet</h2>
          <p>Track values like weight, sleep, or strength.</p>
        </div>
      )}
    </div>
  );
}

function StatisticsSummary({ habits }: { habits: Habit[] }) {
  const state = useDiornaStore();
  const entries = selectWorkspace(state.habitEntries, state.activeWorkspaceId);
  const today = dateKey(new Date());
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const stats = habits
    .map((habit) => ({
      habit,
      stat: habitStatistics(habit, entries, monthStart, today),
    }))
    .filter((value) => value.stat.rate !== null)
    .sort((a, b) => (b.stat.rate ?? 0) - (a.stat.rate ?? 0));
  return (
    <section className="daily-stat-strip">
      <div>
        <small>Month completion</small>
        <strong>
          {stats.length
            ? `${Math.round(stats.reduce((sum, value) => sum + (value.stat.rate ?? 0), 0) / stats.length)}%`
            : "—"}
        </strong>
      </div>
      <div>
        <small>Best habit</small>
        <strong>{stats[0]?.habit.name ?? "—"}</strong>
      </div>
      <div>
        <small>Needs attention</small>
        <strong>{stats.at(-1)?.habit.name ?? "—"}</strong>
      </div>
      <div>
        <small>Longest current streak</small>
        <strong>{Math.max(0, ...stats.map((value) => value.stat.currentStreak))} days</strong>
      </div>
    </section>
  );
}

function rangeFor(center: Date, preset: Preset): Date[] {
  if (preset === "plus-minus-3")
    return eachDayOfInterval({
      start: addDays(center, -3),
      end: addDays(center, 3),
    });
  if (preset === "week")
    return eachDayOfInterval({
      start: startOfWeek(center, { weekStartsOn: 1 }),
      end: endOfWeek(center, { weekStartsOn: 1 }),
    });
  if (preset === "month")
    return eachDayOfInterval({
      start: startOfMonth(center),
      end: endOfMonth(center),
    });
  const count = Number(preset);
  return eachDayOfInterval({ start: center, end: addDays(center, count - 1) });
}
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
