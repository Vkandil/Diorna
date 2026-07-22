import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isAfter,
  isFuture,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import {
  Archive,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { exportNativeXlsx } from "@/core/native";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import type { Category, Habit, HabitEntry, ISODate, Metric, MetricEntry } from "@/shared/models";
import {
  averageScoreByWeekday,
  completionScore,
  dateKey,
  habitStatistics,
  isEntryComplete,
  isHabitApplicable,
  monthOverMonthDelta,
  periodSummary,
} from "./logic";

type Preset = "plus-minus-3" | "7" | "14" | "30" | "week" | "month" | "custom";
type Mode = "habits" | "metrics" | "statistics";

interface WindowPreference {
  preset: Preset;
  center: ISODate;
  start: ISODate;
  end: ISODate;
}

interface ContextMenuState {
  x: number;
  y: number;
  kind: "cell" | "row" | "column";
  habitId?: string;
  date?: ISODate;
}

const todayKey = () => dateKey(new Date());
const defaultWindow = (preset: Preset = "plus-minus-3"): WindowPreference => ({
  preset: preset === "custom" ? "plus-minus-3" : preset,
  center: todayKey(),
  start: dateKey(subDays(new Date(), 3)),
  end: dateKey(addDays(new Date(), 3)),
});

export function DailyView() {
  const state = useDiornaStore();
  const workspaceId = state.activeWorkspaceId;
  const habits = selectWorkspace(state.habits, workspaceId)
    .filter((habit) => !habit.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const entries = selectWorkspace(state.habitEntries, workspaceId);
  const metrics = selectWorkspace(state.metrics, workspaceId).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const metricEntries = selectWorkspace(state.metricEntries, workspaceId);
  const categories = selectWorkspace(state.categories, workspaceId).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const [windowPreference, setWindowPreference] = useState<WindowPreference>(() =>
    defaultWindow(state.settings.dailyWindow),
  );
  const skipWindowSave = useRef(true);
  const [mode, setMode] = useState<Mode>("habits");
  const [habitEditor, setHabitEditor] = useState<Habit | "new">();
  const [metricEditor, setMetricEditor] = useState<Metric | "new">();
  const [chartMetric, setChartMetric] = useState<Metric>();

  useEffect(() => {
    skipWindowSave.current = true;
    const saved = localStorage.getItem(`diorna-daily-window:${workspaceId}`);
    if (!saved) {
      setWindowPreference(defaultWindow(state.settings.dailyWindow));
      return;
    }
    try {
      setWindowPreference({
        ...defaultWindow(state.settings.dailyWindow),
        ...(JSON.parse(saved) as WindowPreference),
      });
    } catch {
      setWindowPreference(defaultWindow(state.settings.dailyWindow));
    }
  }, [state.settings.dailyWindow, workspaceId]);
  useEffect(() => {
    if (skipWindowSave.current) {
      skipWindowSave.current = false;
      return;
    }
    localStorage.setItem(`diorna-daily-window:${workspaceId}`, JSON.stringify(windowPreference));
  }, [windowPreference, workspaceId]);

  const dates = useMemo(
    () => rangeFor(windowPreference, state.settings.weekStartsOn),
    [state.settings.weekStartsOn, windowPreference],
  );
  const todayScore = completionScore(habits, entries, todayKey());
  const shiftWindow = (direction: -1 | 1) => {
    const amount = Math.max(1, dates.length) * direction;
    setWindowPreference((preference) =>
      preference.preset === "custom"
        ? {
            ...preference,
            start: dateKey(addDays(parseISO(preference.start), amount)),
            end: dateKey(addDays(parseISO(preference.end), amount)),
          }
        : { ...preference, center: dateKey(addDays(parseISO(preference.center), amount)) },
    );
  };
  const recenter = () =>
    setWindowPreference((preference) => ({ ...preference, center: todayKey() }));

  useEffect(() => {
    const keyboardNavigation = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.shiftKey && event.key === "ArrowLeft") {
        event.preventDefault();
        shiftWindow(-1);
      } else if (event.shiftKey && event.key === "ArrowRight") {
        event.preventDefault();
        shiftWindow(1);
      } else if (event.key.toLowerCase() === "t") recenter();
    };
    window.addEventListener("keydown", keyboardNavigation);
    return () => window.removeEventListener("keydown", keyboardNavigation);
  });

  const habitRows = (range = dates) => [
    ["Habit", "Category", "Type", "Unit", ...range.map(dateKey)],
    ...habits.map((habit) => [
      habit.name,
      categories.find((category) => category.id === habit.categoryId)?.name ?? "",
      habit.type,
      habit.unit ?? "",
      ...range.map((date) => {
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
  const metricRows = (range = dates) => [
    ["Metric", "Category", "Unit", ...range.map(dateKey)],
    ...metrics.map((metric) => [
      metric.name,
      categories.find((category) => category.id === metric.categoryId)?.name ?? "",
      metric.unit,
      ...range.map((date) =>
        String(
          metricEntries.find(
            (entry) => entry.metricId === metric.id && entry.date === dateKey(date),
          )?.value ?? "",
        ),
      ),
    ]),
  ];
  const exportCsv = () => {
    const rows = [["HABITS"], ...habitRows(), [], ["METRICS"], ...metricRows()];
    downloadText(
      `diorna-daily-${dateKey(dates[0]!)}-${dateKey(dates.at(-1)!)}.csv`,
      rows.map((row) => row.map(csvEscape).join(",")).join("\r\n"),
    );
  };
  const exportXlsx = () =>
    void exportNativeXlsx(`diorna-daily-${dateKey(dates[0]!)}-${dateKey(dates.at(-1)!)}.xlsx`, [
      { name: "Habits", rows: habitRows() },
      { name: "Metrics", rows: metricRows() },
    ]);

  return (
    <div className="daily-page">
      <header className="module-toolbar daily-toolbar">
        <div>
          <span className="eyebrow">Today</span>
          <strong className="daily-score">
            {todayScore === null ? "—" : `${todayScore}% done`}
          </strong>
        </div>
        <div
          className="score-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          {...(todayScore === null ? {} : { "aria-valuenow": todayScore })}
          aria-label={`Today's score ${todayScore ?? "not available"}`}
        >
          <i style={{ width: `${todayScore ?? 0}%` }} />
        </div>
        <span className="toolbar-spacer" />
        <div className="segmented" aria-label="Daily section">
          {(["habits", "metrics", "statistics"] as const).map((entry) => (
            <button
              key={entry}
              className={mode === entry ? "active" : ""}
              onClick={() => setMode(entry)}
            >
              {entry[0]!.toUpperCase() + entry.slice(1)}
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label="Previous window"
          onClick={() => shiftWindow(-1)}
        >
          <ChevronLeft />
        </button>
        <button className="button" title="T" onClick={recenter}>
          Today
        </button>
        <button className="icon-button" aria-label="Next window" onClick={() => shiftWindow(1)}>
          <ChevronRight />
        </button>
        <select
          aria-label="Date window"
          value={windowPreference.preset}
          onChange={(event) =>
            setWindowPreference((preference) => ({
              ...preference,
              preset: event.target.value as Preset,
            }))
          }
        >
          <option value="plus-minus-3">±3 days</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="custom">Custom</option>
        </select>
        {windowPreference.preset === "custom" && (
          <div className="custom-date-range">
            <input
              type="date"
              aria-label="Range start"
              value={windowPreference.start}
              onChange={(event) =>
                setWindowPreference((preference) => ({
                  ...preference,
                  start: event.target.value,
                }))
              }
            />
            <span>–</span>
            <input
              type="date"
              aria-label="Range end"
              min={windowPreference.start}
              value={windowPreference.end}
              onChange={(event) =>
                setWindowPreference((preference) => ({
                  ...preference,
                  end: event.target.value,
                }))
              }
            />
          </div>
        )}
        <button className="button icon-text" onClick={exportCsv}>
          <Download /> CSV
        </button>
        <button className="button icon-text" onClick={exportXlsx}>
          <Download /> XLSX
        </button>
      </header>

      {mode === "habits" && (
        <HabitGrid
          habits={habits}
          dates={dates}
          categories={categories}
          entries={entries}
          onAdd={() => setHabitEditor("new")}
          onEdit={(habit) => setHabitEditor(habit)}
          onNavigate={shiftWindow}
        />
      )}
      {mode === "metrics" && (
        <MetricsGrid
          dates={dates}
          metrics={metrics}
          entries={metricEntries}
          categories={categories}
          onAdd={() => setMetricEditor("new")}
          onEdit={(metric) => setMetricEditor(metric)}
          onChart={setChartMetric}
        />
      )}
      {mode === "statistics" && <StatisticsPanel habits={habits} entries={entries} />}

      {habitEditor && (
        <HabitEditor
          habit={habitEditor === "new" ? undefined : habitEditor}
          categories={categories}
          onClose={() => setHabitEditor(undefined)}
        />
      )}
      {metricEditor && (
        <MetricEditor
          metric={metricEditor === "new" ? undefined : metricEditor}
          categories={categories}
          onClose={() => setMetricEditor(undefined)}
        />
      )}
      {chartMetric && (
        <MetricChart
          metric={chartMetric}
          entries={metricEntries.filter((entry) => entry.metricId === chartMetric.id)}
          onClose={() => setChartMetric(undefined)}
        />
      )}
    </div>
  );
}

function HabitGrid({
  habits,
  dates,
  categories,
  entries,
  onAdd,
  onEdit,
  onNavigate,
}: {
  habits: Habit[];
  dates: Date[];
  categories: Category[];
  entries: HabitEntry[];
  onAdd: () => void;
  onEdit: (habit: Habit) => void;
  onNavigate: (direction: -1 | 1) => void;
}) {
  const state = useDiornaStore();
  const [cursor, setCursor] = useState({
    row: 0,
    col: Math.max(
      0,
      dates.findIndex((date) => isSameDay(date, new Date())),
    ),
  });
  const [editing, setEditing] = useState<{ habitId: string; date: ISODate; value: string }>();
  const [context, setContext] = useState<ContextMenuState>();
  const [entryNote, setEntryNote] = useState<{ habitId: string; date: ISODate; note: string }>();
  const [draggedHabit, setDraggedHabit] = useState<string>();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(`diorna-daily-collapsed:${state.activeWorkspaceId}`);
    return new Set(saved ? (JSON.parse(saved) as string[]) : []);
  });
  const gridRef = useRef<HTMLDivElement>(null);
  const archivedHabits = selectWorkspace(state.habits, state.activeWorkspaceId)
    .filter((habit) => habit.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    localStorage.setItem(
      `diorna-daily-collapsed:${state.activeWorkspaceId}`,
      JSON.stringify([...collapsed]),
    );
  }, [collapsed, state.activeWorkspaceId]);
  useEffect(() => {
    setCursor((value) => ({
      row: Math.min(Math.max(0, habits.length - 1), value.row),
      col: Math.min(Math.max(0, dates.length - 1), value.col),
    }));
  }, [dates.length, habits.length]);

  const grouped = categories
    .map((category) => ({
      category,
      habits: habits.filter((habit) => habit.categoryId === category.id),
    }))
    .filter((group) => group.habits.length);
  const act = (habit: Habit, date: Date) => {
    if (!canEditDate(date, state.settings.allowFutureCheckIn)) return;
    const key = dateKey(date);
    const entry = entries.find((value) => value.habitId === habit.id && value.date === key);
    if (habit.type === "quantity") {
      setEditing({ habitId: habit.id, date: key, value: String(entry?.value ?? "") });
      return;
    }
    state.updateHabitEntry(habit.id, key, !isEntryComplete(habit, entry));
  };
  const commitQuantity = () => {
    if (!editing) return;
    const value = Number(editing.value);
    if (editing.value.trim() && Number.isFinite(value))
      state.updateHabitEntry(editing.habitId, editing.date, value);
    setEditing(undefined);
  };
  const moveCursor = (row: number, col: number) => {
    const next = {
      row: Math.max(0, Math.min(habits.length - 1, row)),
      col: Math.max(0, Math.min(dates.length - 1, col)),
    };
    setCursor(next);
    requestAnimationFrame(() =>
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-row="${next.row}"][data-col="${next.col}"]`)
        ?.focus(),
    );
  };
  const fillColumn = (col: number) => {
    const date = dates[col];
    if (!date || !canEditDate(date, state.settings.allowFutureCheckIn)) return;
    const key = dateKey(date);
    habits.forEach((habit) => {
      if (!isHabitApplicable(habit, key)) return;
      state.updateHabitEntry(habit.id, key, habit.type === "quantity" ? (habit.target ?? 1) : true);
    });
  };
  const keyboard = (event: React.KeyboardEvent) => {
    if (!habits.length || !dates.length || editing) return;
    if (event.ctrlKey && event.key === "ArrowDown") {
      event.preventDefault();
      fillColumn(cursor.col);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (cursor.col === 0) onNavigate(-1);
      else moveCursor(cursor.row, cursor.col - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (cursor.col === dates.length - 1) onNavigate(1);
      else moveCursor(cursor.row, cursor.col + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveCursor(cursor.row - 1, cursor.col);
    } else if (event.key === "ArrowDown" || event.key === "Tab") {
      event.preventDefault();
      moveCursor((cursor.row + 1) % habits.length, cursor.col);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const habit = habits[cursor.row];
      const date = dates[cursor.col];
      if (habit && date) act(habit, date);
    } else if (/^[0-9.-]$/.test(event.key)) {
      const habit = habits[cursor.row];
      const date = dates[cursor.col];
      if (habit?.type === "quantity" && date) {
        event.preventDefault();
        setEditing({ habitId: habit.id, date: dateKey(date), value: event.key });
      }
    }
  };
  const openContext = (event: React.MouseEvent, data: Omit<ContextMenuState, "x" | "y">) => {
    event.preventDefault();
    setContext({ x: event.clientX, y: event.clientY, ...data });
  };
  const contextHabit = habits.find((habit) => habit.id === context?.habitId);
  const contextDate = context?.date ? parseISO(context.date) : undefined;
  const fillRow = (habit: Habit) =>
    dates.forEach((date) => {
      const key = dateKey(date);
      if (isHabitApplicable(habit, key) && canEditDate(date, state.settings.allowFutureCheckIn))
        state.updateHabitEntry(
          habit.id,
          key,
          habit.type === "quantity" ? (habit.target ?? 1) : true,
        );
    });

  return (
    <div className="daily-workspace">
      <div className="daily-grid-actions">
        <span>
          <strong>{habits.length} active habits</strong>
          <small>Arrow keys move · Enter checks · Ctrl+↓ fills a day</small>
        </span>
        <div>
          <button className="button icon-text" onClick={() => setArchiveOpen(true)}>
            <Archive /> Archived {archivedHabits.length ? `(${archivedHabits.length})` : ""}
          </button>
          <button className="button primary icon-text" onClick={onAdd}>
            <Plus /> Add habit
          </button>
        </div>
      </div>
      <div
        className="daily-grid-wrap"
        ref={gridRef}
        tabIndex={0}
        onKeyDown={keyboard}
        onWheel={(event) => {
          if (!event.shiftKey) return;
          event.preventDefault();
          onNavigate(event.deltaY > 0 ? 1 : -1);
        }}
        aria-label="Habit grid"
      >
        <div className="daily-grid" style={{ "--days": dates.length } as React.CSSProperties}>
          <div className="grid-corner">
            <strong>Habit</strong>
            <small>Drag to reorder</small>
          </div>
          {dates.map((date) => {
            const score = completionScore(habits, entries, dateKey(date));
            return (
              <button
                className={`date-cell ${isSameDay(date, new Date()) ? "today" : ""} ${[0, 6].includes(date.getDay()) ? "weekend" : ""}`}
                key={date.toISOString()}
                onContextMenu={(event) =>
                  openContext(event, { kind: "column", date: dateKey(date) })
                }
              >
                <small>{format(date, "EEE")}</small>
                <strong>{format(date, "d")}</strong>
                <span>{score === null ? "—" : `${score}%`}</span>
              </button>
            );
          })}
          <div className="grid-stats-head">Visible statistics</div>
          {grouped.map(({ category, habits: groupHabits }) => {
            const isCollapsed = collapsed.has(category.id);
            return (
              <CategoryRows
                key={category.id}
                category={category}
                habits={groupHabits}
                allHabits={habits}
                dates={dates}
                entries={entries}
                cursor={cursor}
                editing={editing}
                collapsed={isCollapsed}
                onToggle={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(category.id)) next.delete(category.id);
                    else next.add(category.id);
                    return next;
                  })
                }
                onSelect={(row, col, habit) => {
                  setCursor({ row, col });
                  state.selectDailyHabit(habit.id);
                }}
                onAct={act}
                onEditQuantity={setEditing}
                onCommitQuantity={commitQuantity}
                onCancelQuantity={() => setEditing(undefined)}
                onContext={openContext}
                onEdit={onEdit}
                draggedHabit={draggedHabit}
                onDragStart={setDraggedHabit}
                onDrop={(target) => {
                  const source = habits.find((habit) => habit.id === draggedHabit);
                  if (source && source.categoryId === target.categoryId)
                    state.moveHabit(source.id, target.id);
                  setDraggedHabit(undefined);
                }}
              />
            );
          })}
          <div className="score-footer-label">Completion score</div>
          {dates.map((date) => {
            const score = completionScore(habits, entries, dateKey(date));
            return (
              <div
                className={`score-footer ${isSameDay(date, new Date()) ? "today" : ""}`}
                key={`footer-${dateKey(date)}`}
              >
                <strong>{score === null ? "—" : `${score}%`}</strong>
                <i style={{ width: `${score ?? 0}%` }} />
              </div>
            );
          })}
          <div className="grid-stats-footer">Current · longest · completion</div>
        </div>
      </div>
      {context && (
        <>
          <button
            className="context-dismiss"
            aria-label="Close menu"
            onClick={() => setContext(undefined)}
          />
          <div className="daily-context-menu" style={{ left: context.x, top: context.y }}>
            {context.kind === "cell" && contextHabit && context.date && (
              <>
                <button
                  onClick={() => {
                    const existing = entries.find(
                      (entry) => entry.habitId === contextHabit.id && entry.date === context.date,
                    );
                    setEntryNote({
                      habitId: contextHabit.id,
                      date: context.date!,
                      note: existing?.note ?? "",
                    });
                    setContext(undefined);
                  }}
                >
                  <FileText /> Add entry note
                </button>
                <button
                  onClick={() => {
                    state.clearHabitEntry(contextHabit.id, context.date!);
                    setContext(undefined);
                  }}
                >
                  <RotateCcw /> Clear cell
                </button>
              </>
            )}
            {context.kind === "column" && contextDate && (
              <>
                <button
                  onClick={() => {
                    fillColumn(dates.findIndex((date) => isSameDay(date, contextDate)));
                    setContext(undefined);
                  }}
                >
                  <Check /> Fill whole day
                </button>
                <button
                  onClick={() => {
                    habits.forEach((habit) =>
                      state.clearHabitEntry(habit.id, dateKey(contextDate)),
                    );
                    setContext(undefined);
                  }}
                >
                  <RotateCcw /> Clear whole day
                </button>
              </>
            )}
            {contextHabit && (
              <>
                <button
                  onClick={() => {
                    fillRow(contextHabit);
                    setContext(undefined);
                  }}
                >
                  <Check /> Fill visible row
                </button>
                <button
                  onClick={() => {
                    onEdit(contextHabit);
                    setContext(undefined);
                  }}
                >
                  <Edit3 /> Edit habit
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    state.updateHabit(contextHabit.id, { archived: true });
                    if (state.selectedDailyHabitId === contextHabit.id) state.selectDailyHabit();
                    setContext(undefined);
                  }}
                >
                  <Archive /> Archive habit
                </button>
              </>
            )}
          </div>
        </>
      )}
      {entryNote && (
        <EntryNoteDialog
          value={entryNote}
          onClose={() => setEntryNote(undefined)}
          onSave={(note) => {
            state.updateHabitEntryNote(entryNote.habitId, entryNote.date, note);
            setEntryNote(undefined);
          }}
        />
      )}
      {archiveOpen && (
        <ArchivedHabitsDialog habits={archivedHabits} onClose={() => setArchiveOpen(false)} />
      )}
    </div>
  );
}

function CategoryRows({
  category,
  habits,
  allHabits,
  dates,
  entries,
  cursor,
  editing,
  collapsed,
  onToggle,
  onSelect,
  onAct,
  onEditQuantity,
  onCommitQuantity,
  onCancelQuantity,
  onContext,
  onEdit,
  draggedHabit,
  onDragStart,
  onDrop,
}: {
  category: Category;
  habits: Habit[];
  allHabits: Habit[];
  dates: Date[];
  entries: HabitEntry[];
  cursor: { row: number; col: number };
  editing: { habitId: string; date: ISODate; value: string } | undefined;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (row: number, col: number, habit: Habit) => void;
  onAct: (habit: Habit, date: Date) => void;
  onEditQuantity: React.Dispatch<
    React.SetStateAction<{ habitId: string; date: ISODate; value: string } | undefined>
  >;
  onCommitQuantity: () => void;
  onCancelQuantity: () => void;
  onContext: (event: React.MouseEvent, data: Omit<ContextMenuState, "x" | "y">) => void;
  onEdit: (habit: Habit) => void;
  draggedHabit: string | undefined;
  onDragStart: (id?: string) => void;
  onDrop: (habit: Habit) => void;
}) {
  const aggregate = dates
    .map((date) => completionScore(habits, entries, dateKey(date)))
    .filter((score): score is number => score !== null);
  return (
    <>
      <button
        className="group-row"
        style={{ "--category": category.color } as React.CSSProperties}
        onClick={onToggle}
      >
        <span>
          {collapsed ? <ChevronRight /> : <ChevronDown />}
          <i /> {category.name}
        </span>
        <strong>
          {aggregate.length
            ? `${Math.round(aggregate.reduce((a, b) => a + b, 0) / aggregate.length)}%`
            : "—"}
        </strong>
      </button>
      {dates.map((date) => (
        <div key={`${category.id}-${date.toISOString()}`} className="group-fill" />
      ))}
      <div className="group-fill" />
      {!collapsed &&
        habits.map((habit) => {
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
              editing={editing}
              onSelect={onSelect}
              onAct={onAct}
              onEditQuantity={onEditQuantity}
              onCommitQuantity={onCommitQuantity}
              onCancelQuantity={onCancelQuantity}
              onContext={onContext}
              onEdit={onEdit}
              dragging={draggedHabit === habit.id}
              onDragStart={onDragStart}
              onDrop={onDrop}
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
  editing,
  onSelect,
  onAct,
  onEditQuantity,
  onCommitQuantity,
  onCancelQuantity,
  onContext,
  onEdit,
  dragging,
  onDragStart,
  onDrop,
}: {
  habit: Habit;
  dates: Date[];
  entries: HabitEntry[];
  stat: ReturnType<typeof habitStatistics>;
  rowIndex: number;
  cursor: { row: number; col: number };
  editing: { habitId: string; date: ISODate; value: string } | undefined;
  onSelect: (row: number, col: number, habit: Habit) => void;
  onAct: (habit: Habit, date: Date) => void;
  onEditQuantity: React.Dispatch<
    React.SetStateAction<{ habitId: string; date: ISODate; value: string } | undefined>
  >;
  onCommitQuantity: () => void;
  onCancelQuantity: () => void;
  onContext: (event: React.MouseEvent, data: Omit<ContextMenuState, "x" | "y">) => void;
  onEdit: (habit: Habit) => void;
  dragging: boolean;
  onDragStart: (id?: string) => void;
  onDrop: (habit: Habit) => void;
}) {
  const state = useDiornaStore();
  return (
    <>
      <div
        className={`habit-name ${dragging ? "dragging" : ""}`}
        draggable
        onDragStart={() => onDragStart(habit.id)}
        onDragEnd={() => onDragStart(undefined)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => onDrop(habit)}
        onClick={() => state.selectDailyHabit(habit.id)}
        onContextMenu={(event) => onContext(event, { kind: "row", habitId: habit.id })}
      >
        <span title={habit.description || habit.name}>{habit.name}</span>
        <small>
          {habit.type === "quantity" ? `${habit.target ?? "—"} ${habit.unit ?? ""}` : ""}
        </small>
        <button aria-label={`Edit ${habit.name}`} onClick={() => onEdit(habit)}>
          <MoreHorizontal />
        </button>
      </div>
      {dates.map((date, col) => {
        const key = dateKey(date);
        const applicable = isHabitApplicable(habit, key);
        const entry = entries.find((value) => value.habitId === habit.id && value.date === key);
        const complete = isEntryComplete(habit, entry);
        const locked = isFuture(date) && !state.settings.allowFutureCheckIn;
        const activeEditor = editing?.habitId === habit.id && editing.date === key;
        return (
          <div
            key={key}
            role="button"
            tabIndex={applicable && !locked ? 0 : -1}
            data-row={rowIndex}
            data-col={col}
            className={`habit-cell ${cursor.row === rowIndex && cursor.col === col ? "cursor" : ""} ${complete ? "complete" : ""} ${entry?.note ? "has-note" : ""} ${isSameDay(date, new Date()) ? "today" : ""}`}
            aria-disabled={!applicable || locked}
            onFocus={() => onSelect(rowIndex, col, habit)}
            onClick={() => onAct(habit, date)}
            onContextMenu={(event) =>
              onContext(event, { kind: "cell", habitId: habit.id, date: key })
            }
            aria-label={`${habit.name}, ${format(date, "PP")}${complete ? ", complete" : ""}`}
          >
            {activeEditor ? (
              <span className="quantity-editor" onClick={(event) => event.stopPropagation()}>
                <button
                  aria-label="Decrease"
                  onClick={() =>
                    onEditQuantity((current) =>
                      current
                        ? { ...current, value: String((Number(current.value) || 0) - 1) }
                        : current,
                    )
                  }
                >
                  <Minus />
                </button>
                <input
                  autoFocus
                  type="number"
                  step="any"
                  value={editing.value}
                  onChange={(event) =>
                    onEditQuantity((current) =>
                      current ? { ...current, value: event.target.value } : current,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onCommitQuantity();
                    if (event.key === "Escape") onCancelQuantity();
                  }}
                  onBlur={onCommitQuantity}
                />
                <button
                  aria-label="Increase"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    onEditQuantity((current) =>
                      current
                        ? { ...current, value: String((Number(current.value) || 0) + 1) }
                        : current,
                    )
                  }
                >
                  <Plus />
                </button>
                <small>{habit.unit}</small>
              </span>
            ) : habit.type === "quantity" ? (
              <span>
                {entry?.value ?? "·"}
                <small>{habit.unit}</small>
              </span>
            ) : complete ? (
              <Check />
            ) : (
              <i />
            )}
          </div>
        );
      })}
      <div className="habit-row-stats">
        <span title="Current streak">{stat.currentStreak}d current</span>
        <span title="Longest streak">{stat.longestStreak}d best</span>
        <strong>{stat.rate === null ? "—" : `${stat.rate}%`}</strong>
      </div>
    </>
  );
}

function MetricsGrid({
  dates,
  metrics,
  entries,
  categories,
  onAdd,
  onEdit,
  onChart,
}: {
  dates: Date[];
  metrics: Metric[];
  entries: MetricEntry[];
  categories: Category[];
  onAdd: () => void;
  onEdit: (metric: Metric) => void;
  onChart: (metric: Metric) => void;
}) {
  const state = useDiornaStore();
  const [editing, setEditing] = useState<{ metricId: string; date: ISODate; value: string }>();
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const commit = () => {
    if (!editing) return;
    const value = Number(editing.value);
    if (editing.value.trim() && Number.isFinite(value))
      state.updateMetricEntry(editing.metricId, editing.date, value);
    else state.clearMetricEntry(editing.metricId, editing.date);
    setEditing(undefined);
  };
  const moveCursor = (row: number, col: number) => {
    const next = {
      row: Math.max(0, Math.min(metrics.length - 1, row)),
      col: Math.max(0, Math.min(dates.length - 1, col)),
    };
    setCursor(next);
    requestAnimationFrame(() =>
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-metric-row="${next.row}"][data-col="${next.col}"]`)
        ?.focus(),
    );
  };
  const keyboard = (event: React.KeyboardEvent) => {
    if (!metrics.length || !dates.length || editing) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveCursor(cursor.row, cursor.col - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveCursor(cursor.row, cursor.col + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveCursor(cursor.row - 1, cursor.col);
    } else if (event.key === "ArrowDown" || event.key === "Tab") {
      event.preventDefault();
      moveCursor((cursor.row + 1) % metrics.length, cursor.col);
    } else if (event.key === "Enter" || /^[0-9.-]$/.test(event.key)) {
      const metric = metrics[cursor.row];
      const date = dates[cursor.col];
      if (!metric || !date || !canEditDate(date, state.settings.allowFutureCheckIn)) return;
      event.preventDefault();
      const value = entries.find(
        (entry) => entry.metricId === metric.id && entry.date === dateKey(date),
      )?.value;
      setEditing({
        metricId: metric.id,
        date: dateKey(date),
        value: /^[0-9.-]$/.test(event.key) ? event.key : String(value ?? ""),
      });
    }
  };
  return (
    <div className="daily-workspace metric-workspace">
      <div className="daily-grid-actions">
        <span>
          <strong>Tracked metrics</strong>
          <small>Click a cell to enter a value; click a row for its full chart.</small>
        </span>
        <button className="button primary icon-text" onClick={onAdd}>
          <Plus /> Add metric
        </button>
      </div>
      <div
        className="daily-grid-wrap"
        ref={gridRef}
        tabIndex={0}
        onKeyDown={keyboard}
        aria-label="Metric grid"
      >
        <div className="metric-grid" style={{ "--days": dates.length } as React.CSSProperties}>
          <div className="grid-corner">
            <strong>Metric</strong>
            <small>{metrics.length} series</small>
          </div>
          {dates.map((date) => (
            <div
              className={`date-cell ${isSameDay(date, new Date()) ? "today" : ""} ${[0, 6].includes(date.getDay()) ? "weekend" : ""}`}
              key={dateKey(date)}
            >
              <small>{format(date, "EEE")}</small>
              <strong>{format(date, "d")}</strong>
            </div>
          ))}
          <div className="grid-stats-head">Trend</div>
          {metrics.map((metric, rowIndex) => {
            const metricValues = entries
              .filter((entry) => entry.metricId === metric.id)
              .sort((a, b) => a.date.localeCompare(b.date));
            const delta = monthOverMonthDelta(metricValues, todayKey());
            const category = categories.find((entry) => entry.id === metric.categoryId);
            return (
              <MetricRow
                key={metric.id}
                metric={metric}
                category={category}
                dates={dates}
                entries={metricValues}
                editing={editing}
                setEditing={setEditing}
                commit={commit}
                onEdit={onEdit}
                onChart={onChart}
                delta={delta.percent}
                rowIndex={rowIndex}
                cursor={cursor}
                onSelect={(col) => setCursor({ row: rowIndex, col })}
              />
            );
          })}
        </div>
        {!metrics.length && (
          <div className="empty-state">
            <BarChart3 />
            <h2>No metrics yet</h2>
            <p>Track values such as weight, sleep, or strength.</p>
            <button className="button primary" onClick={onAdd}>
              Add metric
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricRow({
  metric,
  category,
  dates,
  entries,
  editing,
  setEditing,
  commit,
  onEdit,
  onChart,
  delta,
  rowIndex,
  cursor,
  onSelect,
}: {
  metric: Metric;
  category: Category | undefined;
  dates: Date[];
  entries: MetricEntry[];
  editing: { metricId: string; date: ISODate; value: string } | undefined;
  setEditing: React.Dispatch<
    React.SetStateAction<{ metricId: string; date: ISODate; value: string } | undefined>
  >;
  commit: () => void;
  onEdit: (metric: Metric) => void;
  onChart: (metric: Metric) => void;
  delta: number | null;
  rowIndex: number;
  cursor: { row: number; col: number };
  onSelect: (col: number) => void;
}) {
  return (
    <>
      <div className="metric-name" role="button" tabIndex={0} onClick={() => onChart(metric)}>
        <i style={{ background: category?.color }} />
        <span>
          <strong>{metric.name}</strong>
          <small>
            {metric.target === undefined ? metric.unit : `Target ${metric.target} ${metric.unit}`}
          </small>
        </span>
        <button
          aria-label={`Edit ${metric.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(metric);
          }}
        >
          <MoreHorizontal />
        </button>
      </div>
      {dates.map((date) => {
        const key = dateKey(date);
        const entry = entries.find((value) => value.date === key);
        const active = editing?.metricId === metric.id && editing.date === key;
        const locked = isFuture(date) && !useDiornaStore.getState().settings.allowFutureCheckIn;
        return (
          <div
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked}
            data-metric-row={rowIndex}
            data-col={dates.indexOf(date)}
            className={`metric-cell ${isSameDay(date, new Date()) ? "today" : ""} ${cursor.row === rowIndex && cursor.col === dates.indexOf(date) ? "cursor" : ""} ${metric.target !== undefined && (entry?.value ?? -Infinity) >= metric.target ? "target" : ""}`}
            key={key}
            onFocus={() => onSelect(dates.indexOf(date))}
            onClick={() => {
              if (!locked)
                setEditing({ metricId: metric.id, date: key, value: String(entry?.value ?? "") });
            }}
          >
            {active ? (
              <input
                autoFocus
                type="number"
                step="any"
                value={editing.value}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commit();
                  if (event.key === "Escape") setEditing(undefined);
                }}
              />
            ) : (
              <span>{entry ? `${entry.value} ${metric.unit}` : "·"}</span>
            )}
          </div>
        );
      })}
      <button className="metric-trend" onClick={() => onChart(metric)}>
        <MiniSparkline values={entries.map((entry) => entry.value)} />
        <strong className={delta !== null && delta < 0 ? "negative" : ""}>
          {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}% MoM`}
        </strong>
      </button>
    </>
  );
}

function MiniSparkline({ values }: { values: number[] }) {
  if (!values.length) return <span className="empty-sparkline">No values</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 28 - ((value - min) / Math.max(1, max - min)) * 24;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function StatisticsPanel({ habits, entries }: { habits: Habit[]; entries: HabitEntry[] }) {
  const weekStartsOn = useDiornaStore((state) => state.settings.weekStartsOn);
  const now = new Date();
  const week = periodSummary(
    habits,
    entries,
    dateKey(startOfWeek(now, { weekStartsOn })),
    dateKey(endOfWeek(now, { weekStartsOn })),
  );
  const month = periodSummary(
    habits,
    entries,
    dateKey(startOfMonth(now)),
    dateKey(endOfMonth(now)),
  );
  const year = periodSummary(habits, entries, dateKey(startOfYear(now)), dateKey(endOfYear(now)));
  const weekdays = averageScoreByWeekday(habits, entries, dateKey(startOfYear(now)), todayKey());
  const [heatmapHabitId, setHeatmapHabitId] = useState(habits[0]?.id ?? "");
  const heatmapHabit = habits.find((habit) => habit.id === heatmapHabitId) ?? habits[0];
  return (
    <div className="statistics-panel">
      <header>
        <Target />
        <div>
          <h2>Completion statistics</h2>
          <p>Only applicable habit days contribute to these scores.</p>
        </div>
      </header>
      <div className="period-score-grid">
        <StatCard label="This week" value={week.score} />
        <StatCard label="This month" value={month.score} />
        <StatCard label="Year to date" value={year.score} />
        <article>
          <small>Best habit</small>
          <strong>{year.best?.habit.name ?? "—"}</strong>
          <span>{year.best ? `${year.best.rate}%` : "No data"}</span>
        </article>
        <article>
          <small>Needs attention</small>
          <strong>{year.worst?.habit.name ?? "—"}</strong>
          <span>{year.worst ? `${year.worst.rate}%` : "No data"}</span>
        </article>
      </div>
      <section className="weekday-chart">
        <header>
          <h3>Average score by weekday</h3>
          <span>Year to date</span>
        </header>
        <div>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
            <article key={day}>
              <i style={{ height: `${weekdays[index] ?? 0}%` }} />
              <strong>{weekdays[index] === null ? "—" : `${weekdays[index]}%`}</strong>
              <small>{day}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="heatmap-card">
        <header>
          <div>
            <h3>Trailing twelve months</h3>
            <p>GitHub-style contribution history for each habit.</p>
          </div>
          <select
            value={heatmapHabit?.id ?? ""}
            onChange={(event) => setHeatmapHabitId(event.target.value)}
          >
            {habits.map((habit) => (
              <option key={habit.id} value={habit.id}>
                {habit.name}
              </option>
            ))}
          </select>
        </header>
        {heatmapHabit ? (
          <HabitHeatmap habit={heatmapHabit} entries={entries} />
        ) : (
          <div className="empty-mini">Create a habit to see its history.</div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <article>
      <small>{label}</small>
      <strong>{value === null ? "—" : `${value}%`}</strong>
      <span>{value === null ? "No applicable habits" : "average completion"}</span>
      <i style={{ width: `${value ?? 0}%` }} />
    </article>
  );
}

export function HabitHeatmap({ habit, entries }: { habit: Habit; entries: HabitEntry[] }) {
  const end = new Date();
  const start = subDays(end, 364);
  const dates = eachDayOfInterval({ start, end });
  const byDate = new Map(
    entries.filter((entry) => entry.habitId === habit.id).map((entry) => [entry.date, entry]),
  );
  const stat = habitStatistics(habit, entries, dateKey(start), dateKey(end));
  return (
    <>
      <div className="habit-heatmap" aria-label={`${habit.name} completion heatmap`}>
        {dates.map((date) => {
          const key = dateKey(date);
          const applicable = isHabitApplicable(habit, key);
          const complete = isEntryComplete(habit, byDate.get(key));
          return (
            <i
              key={key}
              className={`${!applicable ? "inactive" : ""} ${complete ? "complete" : ""}`}
              title={`${format(date, "PP")}: ${!applicable ? "not scheduled" : complete ? "complete" : "not complete"}`}
            />
          );
        })}
      </div>
      <div className="heatmap-legend">
        <span>{stat.rate === null ? "—" : `${stat.rate}% completion`}</span>
        <span>
          {stat.currentStreak} day current streak · {stat.longestStreak} day best
        </span>
      </div>
    </>
  );
}

function HabitEditor({
  habit,
  categories,
  onClose,
}: {
  habit: Habit | undefined;
  categories: Category[];
  onClose: () => void;
}) {
  const state = useDiornaStore();
  const [draft, setDraft] = useState(() => ({
    name: habit?.name ?? "",
    categoryId: habit?.categoryId ?? categories[0]?.id ?? "",
    type: habit?.type ?? ("checkbox" as const),
    unit: habit?.unit ?? "",
    target: habit?.target === undefined ? "" : String(habit.target),
    activeWeekdays: habit?.activeWeekdays ?? [0, 1, 2, 3, 4, 5, 6],
    startDate: habit?.startDate ?? "",
    endDate: habit?.endDate ?? "",
    description: habit?.description ?? "",
  }));
  const save = () => {
    if (!draft.name.trim() || !draft.categoryId) return;
    const values: Partial<Habit> & Pick<Habit, "name" | "categoryId" | "type"> = {
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      type: draft.type,
      activeWeekdays: draft.activeWeekdays,
      description: draft.description.trim(),
      ...(draft.type === "quantity" && draft.unit.trim() ? { unit: draft.unit.trim() } : {}),
      ...(draft.type === "quantity" && draft.target !== "" ? { target: Number(draft.target) } : {}),
      ...(draft.startDate ? { startDate: draft.startDate } : {}),
      ...(draft.endDate ? { endDate: draft.endDate } : {}),
    };
    if (habit)
      state.updateHabit(habit.id, {
        ...values,
        unit: draft.type === "quantity" && draft.unit.trim() ? draft.unit.trim() : null,
        target: draft.type === "quantity" && draft.target !== "" ? Number(draft.target) : null,
        startDate: draft.startDate || null,
        endDate: draft.endDate || null,
      });
    else {
      const created = state.addHabit(values);
      state.selectDailyHabit(created.id);
    }
    onClose();
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="daily-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label={habit ? "Edit habit" : "Add habit"}
      >
        <header>
          <div>
            <span className="eyebrow">Daily Grid</span>
            <h2>{habit ? "Edit habit" : "New habit"}</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="daily-editor-fields">
          <label className="wide">
            <span>Name</span>
            <input
              autoFocus
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Read 30 minutes"
            />
          </label>
          <label>
            <span>Category</span>
            <select
              value={draft.categoryId}
              onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Type</span>
            <select
              value={draft.type}
              onChange={(event) =>
                setDraft({ ...draft, type: event.target.value as Habit["type"] })
              }
            >
              <option value="checkbox">Checkbox</option>
              <option value="quantity">Quantity</option>
            </select>
          </label>
          {draft.type === "quantity" && (
            <>
              <label>
                <span>Daily target</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={draft.target}
                  onChange={(event) => setDraft({ ...draft, target: event.target.value })}
                />
              </label>
              <label>
                <span>Unit</span>
                <input
                  value={draft.unit}
                  onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
                  placeholder="min, sets, L…"
                />
              </label>
            </>
          )}
          <fieldset className="wide weekday-picker">
            <legend>Active weekdays</legend>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={draft.activeWeekdays.includes(index)}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      activeWeekdays: draft.activeWeekdays.includes(index)
                        ? draft.activeWeekdays.filter((value) => value !== index)
                        : [...draft.activeWeekdays, index].sort(),
                    })
                  }
                />
                <span>{day}</span>
              </label>
            ))}
          </fieldset>
          <label>
            <span>Start date (optional)</span>
            <input
              type="date"
              value={draft.startDate}
              onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
            />
          </label>
          <label>
            <span>End date (optional)</span>
            <input
              type="date"
              min={draft.startDate || undefined}
              value={draft.endDate}
              onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
            />
          </label>
          <label className="wide">
            <span>Note / protocol</span>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="Optional instructions or context"
            />
          </label>
        </div>
        <footer>
          {habit ? (
            <button
              className="button danger"
              onClick={() => {
                state.updateHabit(habit.id, { archived: true });
                state.selectDailyHabit();
                onClose();
              }}
            >
              <Archive /> Archive
            </button>
          ) : (
            <span />
          )}
          <div>
            <button className="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={!draft.name.trim() || !draft.categoryId || !draft.activeWeekdays.length}
              onClick={save}
            >
              Save habit
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function MetricEditor({
  metric,
  categories,
  onClose,
}: {
  metric: Metric | undefined;
  categories: Category[];
  onClose: () => void;
}) {
  const state = useDiornaStore();
  const [draft, setDraft] = useState({
    name: metric?.name ?? "",
    unit: metric?.unit ?? "",
    categoryId: metric?.categoryId ?? categories[0]?.id ?? "",
    target: metric?.target === undefined ? "" : String(metric.target),
  });
  const save = () => {
    if (!draft.name.trim() || !draft.unit.trim() || !draft.categoryId) return;
    const values = {
      name: draft.name.trim(),
      unit: draft.unit.trim(),
      categoryId: draft.categoryId,
      ...(draft.target === "" ? {} : { target: Number(draft.target) }),
    };
    if (metric)
      state.updateMetric(metric.id, {
        ...values,
        target: draft.target === "" ? null : Number(draft.target),
      });
    else state.addMetric(values);
    onClose();
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="daily-editor-modal compact"
        role="dialog"
        aria-modal="true"
        aria-label={metric ? "Edit metric" : "Add metric"}
      >
        <header>
          <div>
            <span className="eyebrow">Daily Grid</span>
            <h2>{metric ? "Edit metric" : "New metric"}</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="daily-editor-fields">
          <label className="wide">
            <span>Name</span>
            <input
              autoFocus
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Bench press"
            />
          </label>
          <label>
            <span>Unit</span>
            <input
              value={draft.unit}
              onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
              placeholder="kg"
            />
          </label>
          <label>
            <span>Optional target</span>
            <input
              type="number"
              step="any"
              value={draft.target}
              onChange={(event) => setDraft({ ...draft, target: event.target.value })}
            />
          </label>
          <label className="wide">
            <span>Category</span>
            <select
              value={draft.categoryId}
              onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer>
          {metric ? (
            <button
              className="button danger"
              onClick={() => {
                state.deleteMetric(metric.id);
                onClose();
              }}
            >
              <Trash2 /> Delete
            </button>
          ) : (
            <span />
          )}
          <div>
            <button className="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={!draft.name.trim() || !draft.unit.trim() || !draft.categoryId}
              onClick={save}
            >
              Save metric
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function MetricChart({
  metric,
  entries,
  onClose,
}: {
  metric: Metric;
  entries: MetricEntry[];
  onClose: () => void;
}) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const delta = monthOverMonthDelta(entries, todayKey());
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="metric-chart-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${metric.name} chart`}
      >
        <header>
          <div>
            <span className="eyebrow">Metric history</span>
            <h2>{metric.name}</h2>
            <p>
              {sorted.at(-1)?.value ?? "—"} {metric.unit} ·{" "}
              {delta.percent === null
                ? "No month-over-month comparison"
                : `${delta.percent > 0 ? "+" : ""}${delta.percent}% month over month`}
            </p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="full-line-chart">
          {sorted.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sorted}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  unit={metric.unit}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--accent)"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <BarChart3 />
              <h3>No values yet</h3>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function EntryNoteDialog({
  value,
  onClose,
  onSave,
}: {
  value: { habitId: string; date: ISODate; note: string };
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState(value.note);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="entry-note-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Entry note"
      >
        <header>
          <div>
            <span className="eyebrow">{format(parseISO(value.date), "PPPP")}</span>
            <h2>Entry note</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        <textarea
          autoFocus
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What happened on this day?"
        />
        <footer>
          <button className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" onClick={() => onSave(note)}>
            Save note
          </button>
        </footer>
      </section>
    </div>
  );
}

function ArchivedHabitsDialog({ habits, onClose }: { habits: Habit[]; onClose: () => void }) {
  const state = useDiornaStore();
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="entry-note-dialog archived-habits-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Archived habits"
      >
        <header>
          <div>
            <span className="eyebrow">History retained</span>
            <h2>Archived habits</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="archived-habit-list">
          {habits.map((habit) => (
            <article key={habit.id}>
              <span>
                <strong>{habit.name}</strong>
                <small>
                  {habit.type === "quantity"
                    ? `${habit.target ?? "—"} ${habit.unit ?? ""}`
                    : "Checkbox habit"}
                </small>
              </span>
              <button
                className="button"
                onClick={() => state.updateHabit(habit.id, { archived: false })}
              >
                Restore
              </button>
            </article>
          ))}
          {!habits.length && (
            <div className="empty-state">
              <Archive />
              <h3>No archived habits</h3>
              <p>Archived rows retain their complete history.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function rangeFor(preference: WindowPreference, weekStartsOn: 0 | 1): Date[] {
  if (preference.preset === "custom") {
    const start = parseISO(preference.start);
    const end = parseISO(preference.end);
    return eachDayOfInterval({ start, end: isAfter(start, end) ? start : end });
  }
  const center = parseISO(preference.center);
  if (preference.preset === "plus-minus-3")
    return eachDayOfInterval({ start: addDays(center, -3), end: addDays(center, 3) });
  if (preference.preset === "week")
    return eachDayOfInterval({
      start: startOfWeek(center, { weekStartsOn }),
      end: endOfWeek(center, { weekStartsOn }),
    });
  if (preference.preset === "month")
    return eachDayOfInterval({ start: startOfMonth(center), end: endOfMonth(center) });
  const count = Number(preference.preset);
  return eachDayOfInterval({ start: center, end: addDays(center, count - 1) });
}

function canEditDate(date: Date, allowFuture: boolean): boolean {
  return !isFuture(date) || allowFuture;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadText(filename: string, value: string) {
  const blob = new Blob([value], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
