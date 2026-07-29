import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  addDays,
  addMinutes,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subSeconds,
} from "date-fns";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  Link2,
  Plus,
  Repeat2,
  RotateCcw,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { createId } from "@/shared/id";
import type { CalendarItem, Category, Course, Note, Priority, Project } from "@/shared/models";
import { parseQuickItem } from "./parser";
import { describeRecurrence, occurrencesBetween, type ItemOccurrence } from "./recurrence";
import { buildRrule, normalizeWholeSeriesEdit, splitRule, type ItemDraft } from "./series";

type View = "day" | "week" | "month" | "agenda";
type RecurrenceScope = "this" | "following" | "all";
type ItemInput = Omit<CalendarItem, "id" | "workspaceId" | "createdAt" | "updatedAt">;
type CalendarPatch = { [K in keyof CalendarItem]?: CalendarItem[K] | undefined };
type UndoAction = { label: string; run: () => void };
type PendingScopeAction = {
  title: string;
  occurrence: ItemOccurrence;
  apply: (scope: RecurrenceScope) => void;
};

const views: View[] = ["day", "week", "month", "agenda"];

export function CalendarView() {
  const state = useDiornaStore();
  const workspaceId = state.activeWorkspaceId;
  const categories = useMemo(
    () => selectWorkspace(state.categories, workspaceId).sort((a, b) => a.sortOrder - b.sortOrder),
    [state.categories, workspaceId],
  );
  const notes = selectWorkspace(state.notes, workspaceId).filter((note) => !note.trashedAt);
  const courses = selectWorkspace(state.courses, workspaceId).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const projects = selectWorkspace(state.projects, workspaceId).filter(
    (project) => !project.archived && project.status !== "cancelled",
  );
  const items = selectWorkspace(state.items, workspaceId).filter((item) => !item.trashedAt);
  const [view, setView] = useState<View>(() =>
    readLocal(`diorna-calendar-view-${workspaceId}`, "week"),
  );
  const [date, setDate] = useState(new Date());
  const [quick, setQuick] = useState("");
  const [editor, setEditor] = useState<{
    item?: CalendarItem;
    occurrenceStart?: string;
    seed?: Date;
  } | null>(null);
  const [scopeAction, setScopeAction] = useState<PendingScopeAction | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(() =>
    loadCategoryFilter(workspaceId, view, categories),
  );
  const [hideCompleted, setHideCompleted] = useState<Record<View, boolean>>(() =>
    loadHiddenCompleted(workspaceId),
  );
  const [moreDay, setMoreDay] = useState<Date | null>(null);
  const [, setClockTick] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const undo = useRef<UndoAction[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const id = localStorage.getItem("diorna-open-calendar-item");
    if (!id) return;
    const item = items.find((entry) => entry.id === id);
    if (item) {
      setDate(new Date(item.startAt ?? item.dueAt ?? new Date()));
      setEditor({ item });
    }
    localStorage.removeItem("diorna-open-calendar-item");
  }, [items]);

  useEffect(() => {
    const saved = loadCategoryFilter(workspaceId, view, categories);
    setVisibleCategories(saved);
    setHideCompleted(loadHiddenCompleted(workspaceId));
  }, [workspaceId, view, categories]);

  useEffect(() => {
    setView(readLocal(`diorna-calendar-view-${workspaceId}`, "week"));
  }, [workspaceId]);

  useEffect(() => {
    localStorage.setItem(`diorna-calendar-view-${workspaceId}`, view);
  }, [view, workspaceId]);

  useEffect(() => {
    localStorage.setItem(`diorna-calendar-completed-${workspaceId}`, JSON.stringify(hideCompleted));
  }, [hideCompleted, workspaceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (editor || scopeAction) return;
      const key = event.key.toLowerCase();
      const selectedView = ({ d: "day", w: "week", m: "month", a: "agenda" } as const)[key];
      if (selectedView) {
        event.preventDefault();
        setView(selectedView);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      } else if ((event.ctrlKey || event.metaKey) && key === "z") {
        const action = undo.current.pop();
        if (action) {
          action.run();
          setUndoCount(undo.current.length);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const range = useMemo(
    () => viewRange(view, date, state.settings.weekStartsOn),
    [date, state.settings.weekStartsOn, view],
  );
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("diorna-calendar-context", {
        detail: {
          view,
          start: range.start.toISOString(),
          end: range.end.toISOString(),
        },
      }),
    );
  }, [range.end, range.start, view]);
  const occurrences = useMemo(
    () =>
      items
        .filter(
          (item) =>
            visibleCategories.has(item.categoryId) && !(hideCompleted[view] && item.completedAt),
        )
        .flatMap((item) => occurrencesBetween(item, range.start, range.end))
        .sort((a, b) => occurrenceDate(a).getTime() - occurrenceDate(b).getTime()),
    [hideCompleted, items, range.end, range.start, view, visibleCategories],
  );
  const overdue = items.filter(
    (item) =>
      visibleCategories.has(item.categoryId) &&
      item.kind === "task" &&
      !item.completedAt &&
      item.dueAt &&
      new Date(item.dueAt) < new Date(),
  );
  const unscheduled = items.filter(
    (item) =>
      visibleCategories.has(item.categoryId) &&
      item.kind === "task" &&
      !item.startAt &&
      !item.dueAt &&
      !item.completedAt,
  );

  const move = (direction: number) =>
    setDate((current) =>
      view === "month"
        ? addMonths(current, direction)
        : view === "week"
          ? addWeeks(current, direction)
          : addDays(current, direction),
    );

  const storeCategoryFilter = (next: Set<string>) => {
    localStorage.setItem(
      `diorna-calendar-filters-${workspaceId}-${view}`,
      JSON.stringify([...next]),
    );
    setVisibleCategories(next);
  };

  const rememberUpdate = (item: CalendarItem, changes: CalendarPatch, label: string) => {
    const before = Object.fromEntries(
      Object.keys(changes).map((key) => [key, item[key as keyof CalendarItem]]),
    ) as Partial<CalendarItem>;
    state.updateItem(item.id, changes as Partial<CalendarItem>);
    undo.current.push({ label, run: () => state.updateItem(item.id, before) });
    if (undo.current.length > 100) undo.current.shift();
    setUndoCount(undo.current.length);
  };

  const addWithUndo = (input: ItemDraft) => {
    const item = state.addItem(compactInput(input));
    undo.current.push({
      label: `Create ${item.title}`,
      run: () => state.updateItem(item.id, { trashedAt: new Date().toISOString() }),
    });
    setUndoCount(undo.current.length);
    return item;
  };

  const duplicate = (item: CalendarItem, start?: Date) => {
    const {
      id: _id,
      workspaceId: _workspaceId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...input
    } = item;
    void _id;
    void _workspaceId;
    void _createdAt;
    void _updatedAt;
    const anchor = new Date(item.startAt ?? item.dueAt ?? new Date());
    const moved = start ?? addMinutes(anchor, 30);
    const duration =
      item.endAt && item.startAt
        ? new Date(item.endAt).getTime() - new Date(item.startAt).getTime()
        : 60 * 60_000;
    addWithUndo({
      ...input,
      title: `${item.title} copy`,
      ...(item.kind === "task" && !item.startAt
        ? { dueAt: moved.toISOString() }
        : {
            startAt: moved.toISOString(),
            ...(item.endAt ? { endAt: new Date(moved.getTime() + duration).toISOString() } : {}),
          }),
      rrule: undefined,
      rruleExceptions: [],
      completedAt: undefined,
      trashedAt: undefined,
    });
  };

  const moveOccurrence = (occurrence: ItemOccurrence, moved: Date, duration?: number) => {
    const base = items.find((item) => item.id === occurrence.id);
    if (!base) return;
    const apply = (scope: RecurrenceScope) => {
      applyOccurrenceChange({
        base,
        occurrence,
        scope,
        moved,
        ...(duration === undefined ? {} : { duration }),
        update: (item, changes, label) => rememberUpdate(item, changes, label),
        add: addWithUndo,
      });
    };
    if (base.rrule) setScopeAction({ title: `Move “${base.title}”`, occurrence, apply });
    else apply("all");
  };

  const openOccurrence = (occurrence: ItemOccurrence) => {
    const base = items.find((item) => item.id === occurrence.id);
    if (base) {
      state.selectCalendarItem(base.id);
      setEditor({ item: base, occurrenceStart: occurrence.occurrenceStart });
    }
  };

  const submitQuick = () => {
    if (!quick.trim() || !categories[0]) return;
    const parsed = parseQuickItem(quick, new Date(), state.settings.defaultEventDurationMinutes);
    const category =
      categories.find((entry) => entry.name.toLowerCase() === parsed.category?.toLowerCase()) ??
      categories[0];
    const task = quick.trimStart().startsWith("[]");
    addWithUndo({
      kind: task ? "task" : "event",
      title: parsed.title.replace(/^\[\]\s*/, ""),
      description: "",
      categoryId: category.id,
      ...(task ? { dueAt: parsed.startAt } : { startAt: parsed.startAt, endAt: parsed.endAt }),
      allDay: false,
      priority: parsed.priority,
      subtasks: [],
      ...(parsed.recurrence ? { rrule: parsed.recurrence } : {}),
      rruleExceptions: [],
      reminders: [state.settings.defaultReminderMinutes],
    });
    setQuick("");
  };

  const saveEditor = (input: ItemDraft, scope: RecurrenceScope) => {
    if (!editor?.item) {
      const created = addWithUndo(input);
      state.selectCalendarItem(created.id);
      setEditor(null);
      return;
    }
    const base = editor.item;
    if (base.rrule && editor.occurrenceStart && scope !== "all") {
      const occurrence = occurrencesBetween(
        base,
        subSeconds(new Date(editor.occurrenceStart), 1),
        addMinutes(new Date(editor.occurrenceStart), 1),
      )[0] ?? {
        ...base,
        occurrenceStart: editor.occurrenceStart,
        recurrenceId: `${base.id}:${editor.occurrenceStart}`,
      };
      applyEditedOccurrence(base, occurrence, input, scope, rememberUpdate, addWithUndo);
    } else {
      rememberUpdate(
        base,
        base.rrule && editor.occurrenceStart
          ? normalizeWholeSeriesEdit(base, editor.occurrenceStart, input)
          : input,
        `Edit ${base.title}`,
      );
    }
    setEditor(null);
  };

  const skipOccurrence = (occurrence: ItemOccurrence) => {
    const base = items.find((item) => item.id === occurrence.id);
    if (!base?.rrule) return;
    rememberUpdate(
      base,
      { rruleExceptions: [...new Set([...base.rruleExceptions, occurrence.occurrenceStart])] },
      `Skip ${base.title}`,
    );
  };

  return (
    <div className="calendar-page">
      <header className="module-toolbar calendar-toolbar">
        <button className="button" onClick={() => setDate(new Date())}>
          Today
        </button>
        <button className="icon-button" aria-label="Previous period" onClick={() => move(-1)}>
          <ChevronLeft />
        </button>
        <button className="icon-button" aria-label="Next period" onClick={() => move(1)}>
          <ChevronRight />
        </button>
        <button
          className="icon-button"
          aria-label="Undo calendar change"
          title={undo.current.at(-1)?.label ?? "Nothing to undo"}
          disabled={!undoCount}
          onClick={() => {
            const action = undo.current.pop();
            if (action) action.run();
            setUndoCount(undo.current.length);
          }}
        >
          <RotateCcw />
        </button>
        <label className="calendar-date-picker">
          <CalendarDays />
          <input
            type="date"
            aria-label="Choose date"
            value={format(date, "yyyy-MM-dd")}
            onChange={(event) => setDate(localDate(event.target.value))}
          />
        </label>
        <h2>{format(date, view === "month" ? "MMMM yyyy" : "MMMM d, yyyy")}</h2>
        <div className="segmented" aria-label="Calendar view">
          {views.map((entry) => (
            <button
              className={entry === view ? "active" : ""}
              key={entry}
              title={`${entry} (${entry[0]!.toUpperCase()})`}
              onClick={() => setView(entry)}
            >
              {entry[0]!.toUpperCase()}
            </button>
          ))}
        </div>
        <label className="calendar-hide-completed">
          <input
            type="checkbox"
            checked={hideCompleted[view]}
            onChange={(event) =>
              setHideCompleted((current) => ({ ...current, [view]: event.target.checked }))
            }
          />
          Hide completed
        </label>
        <button className="button primary icon-text" onClick={() => setEditor({ seed: date })}>
          <Plus /> New item
        </button>
      </header>

      <div className="quick-add">
        <Plus size={15} />
        <input
          value={quick}
          onChange={(event) => setQuick(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitQuick();
          }}
          placeholder="Quick add: [] essay Friday 5pm !high #study every week…"
        />
        {quick && (
          <span className="parse-preview">
            {parseQuickItem(
              quick,
              new Date(),
              state.settings.defaultEventDurationMinutes,
            ).tokens.map((token, index) => (
              <b key={`${token.text}-${index}`} className={token.kind}>
                {token.text}
              </b>
            ))}
          </span>
        )}
        <kbd>Enter</kbd>
      </div>

      <div className="category-filter">
        {categories.map((category) => (
          <button
            key={category.id}
            className={visibleCategories.has(category.id) ? "active" : ""}
            title="Alt-click to isolate"
            onClick={(event) => {
              if (event.altKey) {
                storeCategoryFilter(new Set([category.id]));
                return;
              }
              const current = visibleCategories;
              const next = new Set(current);
              if (next.has(category.id)) next.delete(category.id);
              else next.add(category.id);
              storeCategoryFilter(next);
            }}
          >
            <i style={{ background: category.color }} />
            {category.name}
          </button>
        ))}
        <button onClick={() => storeCategoryFilter(new Set(categories.map((entry) => entry.id)))}>
          <RotateCcw /> Reset
        </button>
      </div>

      {overdue.length > 0 && (
        <section className="overdue-bar">
          <CircleAlert />
          <strong>{overdue.length} overdue</strong>
          {overdue.slice(0, 3).map((item) => (
            <button key={item.id} onClick={() => setEditor({ item })}>
              {item.title}
            </button>
          ))}
          <button
            onClick={() =>
              overdue.forEach((item) => {
                const due = new Date(item.dueAt!);
                const today = new Date();
                due.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
                rememberUpdate(item, { dueAt: due.toISOString() }, `Move ${item.title} to today`);
              })
            }
          >
            Move all to today
          </button>
        </section>
      )}

      <div className="calendar-workspace">
        <aside className="calendar-sidebar">
          <MiniMonth date={date} weekStartsOn={state.settings.weekStartsOn} onSelect={setDate} />
          <section>
            <header>
              <strong>Unscheduled</strong>
              <span>{unscheduled.length}</span>
            </header>
            {unscheduled.map((item) => (
              <button
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/diorna-item", item.id)}
                onDoubleClick={() => setEditor({ item })}
                key={item.id}
              >
                <i style={{ background: colorOf(categories, item.categoryId) }} />
                {item.title}
              </button>
            ))}
            {!unscheduled.length && <small>All tasks are scheduled.</small>}
            <p>Drag a task onto the calendar to time-block it.</p>
          </section>
        </aside>

        <div className="calendar-body" tabIndex={0} aria-label="Calendar content">
          {view === "month" ? (
            <MonthView
              date={date}
              occurrences={occurrences}
              categories={categories}
              weekStartsOn={state.settings.weekStartsOn}
              onOpen={openOccurrence}
              onMove={moveOccurrence}
              onDuplicate={duplicate}
              onMore={setMoreDay}
              items={items}
            />
          ) : view === "agenda" ? (
            <AgendaView
              occurrences={occurrences}
              categories={categories}
              onOpen={openOccurrence}
              onComplete={(occurrence) => {
                const base = items.find((item) => item.id === occurrence.id);
                if (!base) return;
                const changes = {
                  completedAt: base.completedAt ? undefined : new Date().toISOString(),
                };
                const apply = (scope: RecurrenceScope) => {
                  if (!base.rrule || scope === "all")
                    rememberUpdate(
                      base,
                      changes,
                      `${base.completedAt ? "Reopen" : "Complete"} ${base.title}`,
                    );
                  else
                    applyEditedOccurrence(
                      base,
                      occurrence,
                      occurrenceDraft(base, occurrence, changes),
                      scope,
                      rememberUpdate,
                      addWithUndo,
                    );
                };
                if (base.rrule)
                  setScopeAction({
                    title: `${base.completedAt ? "Reopen" : "Complete"} “${base.title}”`,
                    occurrence,
                    apply,
                  });
                else apply("all");
              }}
            />
          ) : (
            <TimelineView
              date={date}
              occurrences={occurrences}
              days={view === "day" ? 1 : 7}
              categories={categories}
              items={items}
              visibleStart={state.settings.calendarVisibleStart}
              visibleEnd={state.settings.calendarVisibleEnd}
              hourHeight={state.settings.calendarHourHeight}
              weekStartsOn={state.settings.weekStartsOn}
              onOpen={openOccurrence}
              onMove={moveOccurrence}
              onDuplicate={duplicate}
            />
          )}
        </div>
      </div>

      {moreDay && (
        <DayPopover
          date={moreDay}
          occurrences={occurrences.filter((item) => isSameDay(occurrenceDate(item), moreDay))}
          categories={categories}
          onClose={() => setMoreDay(null)}
          onOpen={(item) => {
            setMoreDay(null);
            openOccurrence(item);
          }}
        />
      )}
      {editor && (
        <ItemEditor
          {...(editor.item ? { item: editor.item } : {})}
          {...(editor.occurrenceStart ? { occurrenceStart: editor.occurrenceStart } : {})}
          seed={editor.seed ?? date}
          categories={categories}
          notes={notes}
          courses={courses}
          projects={projects}
          defaultReminder={state.settings.defaultReminderMinutes}
          defaultDuration={state.settings.defaultEventDurationMinutes}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
          {...(editor.item
            ? {
                onDuplicate: () => {
                  duplicate(editor.item!);
                  setEditor(null);
                },
                onDelete: () => {
                  rememberUpdate(
                    editor.item!,
                    { trashedAt: new Date().toISOString() },
                    `Delete ${editor.item!.title}`,
                  );
                  setEditor(null);
                },
              }
            : {})}
          {...(editor.item?.rrule && editor.occurrenceStart
            ? {
                onSkip: () => {
                  const occurrence = {
                    ...editor.item!,
                    occurrenceStart: editor.occurrenceStart!,
                    recurrenceId: `${editor.item!.id}:${editor.occurrenceStart}`,
                  };
                  skipOccurrence(occurrence);
                  setEditor(null);
                },
              }
            : {})}
        />
      )}
      {scopeAction && (
        <ScopeDialog
          title={scopeAction.title}
          onClose={() => setScopeAction(null)}
          onChoose={(scope) => {
            scopeAction.apply(scope);
            setScopeAction(null);
          }}
        />
      )}
    </div>
  );
}

function MiniMonth({
  date,
  weekStartsOn,
  onSelect,
}: {
  date: Date;
  weekStartsOn: 0 | 1;
  onSelect: (date: Date) => void;
}) {
  const [cursor, setCursor] = useState(date);
  useEffect(() => setCursor(date), [date]);
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn });
  const days = eachDayOfInterval({ start, end: endOfWeek(endOfMonth(cursor), { weekStartsOn }) });
  const labels =
    weekStartsOn === 1 ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <section className="mini-month">
      <header>
        <button aria-label="Previous month" onClick={() => setCursor(addMonths(cursor, -1))}>
          <ChevronLeft />
        </button>
        <strong>{format(cursor, "MMMM yyyy")}</strong>
        <button aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))}>
          <ChevronRight />
        </button>
      </header>
      <div className="mini-weekdays">
        {labels.map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="mini-days">
        {days.map((day) => (
          <button
            key={day.toISOString()}
            className={`${day.getMonth() !== cursor.getMonth() ? "outside" : ""} ${isSameDay(day, date) ? "selected" : ""} ${isSameDay(day, new Date()) ? "today" : ""}`}
            onClick={() => onSelect(day)}
          >
            {format(day, "d")}
          </button>
        ))}
      </div>
    </section>
  );
}

function MonthView({
  date,
  occurrences,
  categories,
  weekStartsOn,
  onOpen,
  onMove,
  onDuplicate,
  onMore,
  items,
}: {
  date: Date;
  occurrences: ItemOccurrence[];
  categories: Category[];
  weekStartsOn: 0 | 1;
  onOpen: (item: ItemOccurrence) => void;
  onMove: (item: ItemOccurrence, date: Date) => void;
  onDuplicate: (item: CalendarItem, date?: Date) => void;
  onMore: (date: Date) => void;
  items: CalendarItem[];
}) {
  const [dropDate, setDropDate] = useState<string>();
  const [draggingId, setDraggingId] = useState<string>();
  const pointerDrag = useRef<{
    item: ItemOccurrence;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>();
  const suppressOpenUntil = useRef(0);
  const start = startOfWeek(startOfMonth(date), { weekStartsOn });
  const end = endOfWeek(endOfMonth(date), { weekStartsOn });
  const days = eachDayOfInterval({ start, end });
  const labels =
    weekStartsOn === 1
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dateAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-date]")?.dataset.date;
  const clearDrag = () => {
    pointerDrag.current = undefined;
    setDraggingId(undefined);
    setDropDate(undefined);
  };
  const movePointerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) {
      drag.moved = true;
      setDraggingId(drag.item.recurrenceId);
    }
    if (!drag.moved) return;
    event.preventDefault();
    setDropDate(dateAt(event.clientX, event.clientY));
  };
  const finishPointerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const targetDate = drag.moved ? dateAt(event.clientX, event.clientY) : undefined;
    clearDrag();
    if (!drag.moved || !targetDate) return;

    suppressOpenUntil.current = Date.now() + 500;
    const base = items.find((entry) => entry.id === drag.item.id);
    if (!base) return;
    const original = occurrenceDate(drag.item);
    const moved = localDate(targetDate);
    moved.setHours(original.getHours(), original.getMinutes(), 0, 0);
    if (event.ctrlKey) onDuplicate(base, moved);
    else onMove(drag.item, moved);
  };
  const startMouseDrag = (item: ItemOccurrence, event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const handleMove = (moveEvent: MouseEvent) => {
      if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) >= 4) {
        moved = true;
        setDraggingId(item.recurrenceId);
      }
      if (!moved) return;
      moveEvent.preventDefault();
      setDropDate(dateAt(moveEvent.clientX, moveEvent.clientY));
    };
    const handleUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      const targetDate = moved ? dateAt(upEvent.clientX, upEvent.clientY) : undefined;
      clearDrag();
      if (!moved || !targetDate) return;
      suppressOpenUntil.current = Date.now() + 500;
      const base = items.find((entry) => entry.id === item.id);
      if (!base) return;
      const original = occurrenceDate(item);
      const next = localDate(targetDate);
      next.setHours(original.getHours(), original.getMinutes(), 0, 0);
      if (upEvent.ctrlKey) onDuplicate(base, next);
      else onMove(item, next);
    };
    window.addEventListener("mousemove", handleMove, { passive: false });
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      className="month-grid"
      aria-label="Month calendar. Drag an item to another day to move it."
    >
      <div className="weekday-row">
        {labels.map((day) => (
          <strong key={day}>{day}</strong>
        ))}
      </div>
      <div className="month-days">
        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayItems = occurrences.filter((item) => isSameDay(occurrenceDate(item), day));
          return (
            <div
              key={day.toISOString()}
              data-date={dayKey}
              className={`${day.getMonth() !== date.getMonth() ? "outside" : ""} ${isSameDay(day, new Date()) ? "today" : ""} ${dropDate === dayKey ? "drop-target" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
                setDropDate(dayKey);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setDropDate(undefined);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDropDate(undefined);
                const recurrenceId = event.dataTransfer.getData("text/diorna-occurrence");
                const occurrence = occurrences.find((entry) => entry.recurrenceId === recurrenceId);
                if (!occurrence) return;
                const base = items.find((entry) => entry.id === occurrence.id);
                if (!base) return;
                const original = occurrenceDate(occurrence);
                const moved = localDate(dayKey);
                moved.setHours(original.getHours(), original.getMinutes(), 0, 0);
                if (event.ctrlKey) onDuplicate(base, moved);
                else onMove(occurrence, moved);
              }}
            >
              <span>{format(day, "d")}</span>
              {dayItems.slice(0, 4).map((item) => (
                <button
                  title={`Drag ${item.title} to another day`}
                  onMouseDown={(event) => startMouseDrag(item, event)}
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse") return;
                    if (event.button !== 0) return;
                    pointerDrag.current = {
                      item,
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startY: event.clientY,
                      moved: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={movePointerDrag}
                  onPointerUp={finishPointerDrag}
                  onPointerCancel={clearDrag}
                  onClick={(event) => {
                    if (Date.now() < suppressOpenUntil.current) {
                      event.preventDefault();
                      return;
                    }
                    onOpen(item);
                  }}
                  className={`${item.completedAt ? "complete" : ""} ${draggingId === item.recurrenceId ? "dragging" : ""}`}
                  key={item.recurrenceId}
                  style={{ "--item": colorOf(categories, item.categoryId) } as React.CSSProperties}
                >
                  {item.kind === "task" && <Check size={11} />}
                  {item.rrule && <Repeat2 size={10} />}
                  {item.title}
                </button>
              ))}
              {dayItems.length > 4 && (
                <button className="more" onClick={() => onMore(day)}>
                  +{dayItems.length - 4} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({
  date,
  occurrences,
  days,
  categories,
  items,
  visibleStart,
  visibleEnd,
  hourHeight,
  weekStartsOn,
  onOpen,
  onMove,
  onDuplicate,
}: {
  date: Date;
  occurrences: ItemOccurrence[];
  days: number;
  categories: Category[];
  items: CalendarItem[];
  visibleStart: number;
  visibleEnd: number;
  hourHeight: number;
  weekStartsOn: 0 | 1;
  onOpen: (item: ItemOccurrence) => void;
  onMove: (item: ItemOccurrence, date: Date, duration?: number) => void;
  onDuplicate: (item: CalendarItem, date?: Date) => void;
}) {
  const start = days === 7 ? startOfWeek(date, { weekStartsOn }) : date;
  const dates = Array.from({ length: days }, (_, index) => addDays(start, index));
  const safeStart = Math.max(0, Math.min(23, visibleStart));
  const safeEnd = Math.max(safeStart + 1, Math.min(24, visibleEnd));
  const hours = Array.from({ length: safeEnd - safeStart }, (_, index) => safeStart + index);
  const safeHourHeight = Math.max(40, Math.min(120, hourHeight));
  const pxPerMinute = safeHourHeight / 60;
  const allDay = occurrences.filter((item) => item.allDay || !item.startAt);
  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroll = timelineRef.current?.closest<HTMLElement>(".calendar-body");
    if (scroll) scroll.scrollTop = 0;
  }, [days, safeEnd, safeHourHeight, safeStart]);
  return (
    <div className="timeline" ref={timelineRef}>
      <div className="timeline-header">
        <span />
        <div style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
          {dates.map((day) => (
            <strong className={isSameDay(day, new Date()) ? "today" : ""} key={day.toISOString()}>
              <small>{format(day, "EEE")}</small>
              {format(day, "d")}
            </strong>
          ))}
        </div>
      </div>
      <div className="all-day-row">
        <strong>All day</strong>
        <div style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
          {dates.map((day) => (
            <div className={isSameDay(day, new Date()) ? "today" : ""} key={day.toISOString()}>
              {allDay
                .filter((item) => isSameDay(occurrenceDate(item), day))
                .map((item) => (
                  <button
                    key={item.recurrenceId}
                    style={
                      { "--item": colorOf(categories, item.categoryId) } as React.CSSProperties
                    }
                    onClick={() => onOpen(item)}
                  >
                    {item.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
      <div
        className="timeline-scroll"
        style={{ "--calendar-hour-height": `${safeHourHeight}px` } as React.CSSProperties}
      >
        <div className="hour-labels">
          {hours.map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
          ))}
        </div>
        <div className="timeline-days" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
          {dates.map((day) => (
            <div
              className={`timeline-day ${isSameDay(day, new Date()) ? "today" : ""}`}
              key={day.toISOString()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const id = event.dataTransfer.getData("text/diorna-item");
                const recurrenceId = event.dataTransfer.getData("text/diorna-occurrence");
                const base = items.find((entry) => entry.id === id);
                if (!base) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const minutes = Math.max(
                  safeStart * 60,
                  Math.min(
                    safeEnd * 60 - 15,
                    Math.round(
                      (safeStart * 60 + ((event.clientY - rect.top) / safeHourHeight) * 60) / 15,
                    ) * 15,
                  ),
                );
                const moved = new Date(day);
                moved.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
                if (event.ctrlKey) onDuplicate(base, moved);
                else {
                  const occurrence = occurrences.find(
                    (entry) => entry.recurrenceId === recurrenceId,
                  ) ?? {
                    ...base,
                    occurrenceStart: base.startAt ?? base.dueAt ?? moved.toISOString(),
                    recurrenceId: `${base.id}:${base.startAt ?? base.dueAt ?? moved.toISOString()}`,
                  };
                  onMove(occurrence, moved);
                }
              }}
            >
              {hours.map((hour) => (
                <i key={hour} />
              ))}
              {isSameDay(day, new Date()) &&
                new Date().getHours() >= safeStart &&
                new Date().getHours() < safeEnd && (
                  <span
                    className="current-time-line"
                    style={{
                      top: `${
                        (new Date().getHours() * 60 + new Date().getMinutes() - safeStart * 60) *
                        pxPerMinute
                      }px`,
                    }}
                  />
                )}
              {occurrences
                .filter((item) => {
                  if (item.allDay || !item.startAt || !isSameDay(new Date(item.startAt), day))
                    return false;
                  const startMinutes =
                    new Date(item.startAt).getHours() * 60 + new Date(item.startAt).getMinutes();
                  const endMinutes = item.endAt
                    ? new Date(item.endAt).getHours() * 60 + new Date(item.endAt).getMinutes()
                    : startMinutes + 60;
                  return endMinutes > safeStart * 60 && startMinutes < safeEnd * 60;
                })
                .map((item) => {
                  const startAt = new Date(item.startAt!);
                  const duration = item.endAt
                    ? Math.max(15, (new Date(item.endAt).getTime() - startAt.getTime()) / 60_000)
                    : 60;
                  const startMinutes = startAt.getHours() * 60 + startAt.getMinutes();
                  const visibleTop = Math.max(startMinutes, safeStart * 60);
                  const visibleEnd = Math.min(startMinutes + duration, safeEnd * 60);
                  return (
                    <button
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/diorna-item", item.id);
                        event.dataTransfer.setData("text/diorna-occurrence", item.recurrenceId);
                      }}
                      onClick={() => onOpen(item)}
                      key={item.recurrenceId}
                      className={`time-item ${item.completedAt ? "complete" : ""}`}
                      style={
                        {
                          top: `${(visibleTop - safeStart * 60) * pxPerMinute}px`,
                          height: `${Math.max(28, (visibleEnd - visibleTop) * pxPerMinute)}px`,
                          "--item": colorOf(categories, item.categoryId),
                        } as React.CSSProperties
                      }
                    >
                      <strong>{item.title}</strong>
                      <small>
                        {format(startAt, "HH:mm")}
                        {item.endAt ? `–${format(new Date(item.endAt), "HH:mm")}` : ""}
                      </small>
                      {item.rrule && <Repeat2 className="recurrence-mark" />}
                      <span
                        className="resize-handle"
                        title="Drag to resize"
                        draggable
                        onDragStart={(event) => {
                          event.stopPropagation();
                          event.dataTransfer.setData("text/diorna-resize", item.recurrenceId);
                        }}
                        onDragEnd={(event) => {
                          const rect = (
                            event.currentTarget.parentElement?.parentElement as HTMLElement | null
                          )?.getBoundingClientRect();
                          if (!rect) return;
                          const endMinutes = Math.max(
                            15,
                            Math.round(
                              ((event.clientY - rect.top) / pxPerMinute +
                                safeStart * 60 -
                                startMinutes) /
                                15,
                            ) * 15,
                          );
                          onMove(item, startAt, endMinutes);
                        }}
                      />
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgendaView({
  occurrences,
  categories,
  onOpen,
  onComplete,
}: {
  occurrences: ItemOccurrence[];
  categories: Category[];
  onOpen: (item: ItemOccurrence) => void;
  onComplete: (item: ItemOccurrence) => void;
}) {
  const groups = occurrences
    .filter((item) => item.startAt ?? item.dueAt)
    .reduce((result, item) => {
      const key = format(occurrenceDate(item), "yyyy-MM-dd");
      const entries = result.get(key) ?? [];
      entries.push(item);
      result.set(key, entries);
      return result;
    }, new Map<string, ItemOccurrence[]>());
  return (
    <div className="agenda-view">
      {[...groups].map(([key, entries]) => (
        <section key={key}>
          <header>
            <strong>{format(localDate(key), "EEEE")}</strong>
            <span>{format(localDate(key), "MMMM d, yyyy")}</span>
          </header>
          {entries.map((item) => (
            <article
              key={item.recurrenceId}
              className={item.completedAt ? "complete" : ""}
              onDoubleClick={() => onOpen(item)}
            >
              <button
                className="agenda-complete"
                aria-label={item.completedAt ? "Reopen task" : "Complete task"}
                onClick={() => item.kind === "task" && onComplete(item)}
              >
                {item.kind === "task" ? <Check /> : <Clock3 />}
              </button>
              <i style={{ background: colorOf(categories, item.categoryId) }} />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.allDay ? "All day" : format(occurrenceDate(item), "HH:mm")}
                  {item.rrule ? ` · ${describeRecurrence(item.rrule)}` : ""}
                </small>
              </span>
              {item.priority === "high" && <b>High</b>}
              <button onClick={() => onOpen(item)}>Details</button>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function DayPopover({
  date,
  occurrences,
  categories,
  onClose,
  onOpen,
}: {
  date: Date;
  occurrences: ItemOccurrence[];
  categories: Category[];
  onClose: () => void;
  onOpen: (item: ItemOccurrence) => void;
}) {
  return (
    <div className="calendar-popover-backdrop" onMouseDown={onClose}>
      <section className="day-popover" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>{format(date, "EEEE")}</strong>
            <span>{format(date, "MMMM d")}</span>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X />
          </button>
        </header>
        {occurrences.map((item) => (
          <button key={item.recurrenceId} onClick={() => onOpen(item)}>
            <i style={{ background: colorOf(categories, item.categoryId) }} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.allDay ? "All day" : format(occurrenceDate(item), "HH:mm")}</small>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}

function ScopeDialog({
  title,
  onChoose,
  onClose,
}: {
  title: string;
  onChoose: (scope: RecurrenceScope) => void;
  onClose: () => void;
}) {
  return (
    <div className="calendar-modal-backdrop" role="dialog" aria-modal="true">
      <section className="scope-dialog">
        <header>
          <Repeat2 />
          <div>
            <h2>{title}</h2>
            <p>Which occurrences should change?</p>
          </div>
        </header>
        <button onClick={() => onChoose("this")}>
          <strong>This occurrence</strong>
          <small>Keep the rest of the series unchanged</small>
        </button>
        <button onClick={() => onChoose("following")}>
          <strong>This and following</strong>
          <small>Split the series from this occurrence</small>
        </button>
        <button onClick={() => onChoose("all")}>
          <strong>All occurrences</strong>
          <small>Update the entire series</small>
        </button>
        <button className="button" onClick={onClose}>
          Cancel
        </button>
      </section>
    </div>
  );
}

function ItemEditor({
  item,
  occurrenceStart,
  seed,
  categories,
  notes,
  courses,
  projects,
  defaultReminder,
  defaultDuration,
  onClose,
  onSave,
  onDuplicate,
  onDelete,
  onSkip,
}: {
  item?: CalendarItem;
  occurrenceStart?: string;
  seed: Date;
  categories: Category[];
  notes: Note[];
  courses: Course[];
  projects: Project[];
  defaultReminder: number;
  defaultDuration: number;
  onClose: () => void;
  onSave: (item: ItemDraft, scope: RecurrenceScope) => void;
  onDuplicate?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onSkip?: (() => void) | undefined;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const initial = useMemo(
    () =>
      editorInput(
        item,
        occurrenceStart,
        seed,
        categories[0]?.id ?? "",
        defaultReminder,
        defaultDuration,
      ),
    [item, occurrenceStart, seed, categories, defaultReminder, defaultDuration],
  );
  const [draft, setDraft] = useState(initial);
  const [scope, setScope] = useState<RecurrenceScope>("this");
  const [repeat, setRepeat] = useState(() => recurrencePreset(item?.rrule));
  const [weekdays, setWeekdays] = useState<number[]>(() => recurrenceWeekdays(item?.rrule));
  const [ends, setEnds] = useState<"never" | "count" | "date">(() =>
    item?.rrule?.includes("COUNT=") ? "count" : item?.rrule?.includes("UNTIL=") ? "date" : "never",
  );
  const [endValue, setEndValue] = useState(() => recurrenceEndValue(item?.rrule));
  const [subtask, setSubtask] = useState("");
  const descriptionRef = useRef<HTMLDivElement>(null);
  const update = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const timed = draft.kind === "event" || Boolean(draft.startAt);
  const formatDescription = (command: string, value?: string) => {
    descriptionRef.current?.focus();
    document.execCommand(command, false, value);
    if (descriptionRef.current) update("description", descriptionRef.current.innerHTML);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.categoryId) return;
    const rrule = buildRrule(repeat, weekdays, ends, endValue, draft.startAt ?? draft.dueAt);
    onSave(
      {
        ...draft,
        title: draft.title.trim(),
        description: descriptionHtml(draft.description),
        ...(rrule ? { rrule } : { rrule: undefined }),
      },
      scope,
    );
  };
  return (
    <div
      className="calendar-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={item ? "Edit calendar item" : "New calendar item"}
    >
      <form className="item-editor" onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">{item ? "Edit item" : "New item"}</span>
            <h2>{item?.title ?? "Plan something"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="item-kind segmented">
          {(["event", "task"] as const).map((kind) => (
            <button
              type="button"
              key={kind}
              className={draft.kind === kind ? "active" : ""}
              onClick={() => update("kind", kind)}
            >
              {kind}
            </button>
          ))}
        </div>
        <label className="item-title">
          <span>Title *</span>
          <input
            autoFocus
            required
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="What needs your time?"
          />
        </label>
        <label>
          <span>Description</span>
          <div className="rich-field">
            <div>
              <button
                type="button"
                aria-label="Bold"
                onMouseDown={(event) => {
                  event.preventDefault();
                  formatDescription("bold");
                }}
              >
                B
              </button>
              <button
                type="button"
                aria-label="Italic"
                onMouseDown={(event) => {
                  event.preventDefault();
                  formatDescription("italic");
                }}
              >
                <em>I</em>
              </button>
              <button
                type="button"
                aria-label="Bulleted list"
                onMouseDown={(event) => {
                  event.preventDefault();
                  formatDescription("insertUnorderedList");
                }}
              >
                List
              </button>
              <button
                type="button"
                aria-label="Insert link"
                onMouseDown={(event) => {
                  event.preventDefault();
                  formatDescription("createLink", "https://");
                }}
              >
                <Link2 />
              </button>
            </div>
            <div
              aria-label="Description"
              role="textbox"
              aria-multiline="true"
              contentEditable
              ref={descriptionRef}
              suppressContentEditableWarning
              data-placeholder="Notes, links, or context…"
              dangerouslySetInnerHTML={{ __html: descriptionHtml(draft.description) }}
              onInput={(event) => update("description", event.currentTarget.innerHTML)}
            />
          </div>
        </label>
        <div className="editor-grid two">
          <label>
            <span>Category *</span>
            <select
              required
              value={draft.categoryId}
              onChange={(event) => update("categoryId", event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select
              value={draft.priority}
              onChange={(event) => update("priority", event.target.value as Priority)}
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <div className="editor-grid two">
          <label>
            <span>{draft.kind === "task" && !timed ? "Due" : "Starts"}</span>
            <input
              type="datetime-local"
              value={toDateTimeLocal(draft.startAt ?? draft.dueAt)}
              onChange={(event) => {
                const value = fromDateTimeLocal(event.target.value);
                if (draft.kind === "task" && !timed) update("dueAt", value);
                else update("startAt", value);
              }}
            />
          </label>
          {timed && (
            <label>
              <span>Ends</span>
              <input
                type="datetime-local"
                value={toDateTimeLocal(draft.endAt)}
                min={toDateTimeLocal(draft.startAt)}
                onChange={(event) => update("endAt", fromDateTimeLocal(event.target.value))}
              />
            </label>
          )}
        </div>
        <div className="editor-grid compact">
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(event) => update("allDay", event.target.checked)}
            />
            All day
          </label>
          {draft.kind === "task" && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={timed}
                onChange={(event) =>
                  setDraft((current) =>
                    event.target.checked
                      ? {
                          ...current,
                          startAt: current.dueAt ?? seed.toISOString(),
                          endAt: addMinutes(
                            new Date(current.dueAt ?? seed),
                            defaultDuration,
                          ).toISOString(),
                          dueAt: undefined,
                        }
                      : {
                          ...current,
                          dueAt: current.startAt,
                          startAt: undefined,
                          endAt: undefined,
                        },
                  )
                }
              />
              Time-blocked
            </label>
          )}
          {draft.kind === "task" && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={Boolean(draft.completedAt)}
                onChange={(event) =>
                  update("completedAt", event.target.checked ? new Date().toISOString() : undefined)
                }
              />
              Completed
            </label>
          )}
        </div>
        {timed && (
          <label>
            <span>Duration (minutes)</span>
            <input
              type="number"
              min={15}
              step={15}
              value={
                draft.startAt && draft.endAt
                  ? Math.max(
                      15,
                      Math.round(
                        (new Date(draft.endAt).getTime() - new Date(draft.startAt).getTime()) /
                          60_000,
                      ),
                    )
                  : defaultDuration
              }
              onChange={(event) => {
                if (draft.startAt)
                  update(
                    "endAt",
                    addMinutes(
                      new Date(draft.startAt),
                      Math.max(15, Number(event.target.value)),
                    ).toISOString(),
                  );
              }}
            />
          </label>
        )}
        <fieldset className="recurrence-editor">
          <legend>
            <Repeat2 /> Recurrence
          </legend>
          <div className="editor-grid two">
            <label>
              <span>Repeats</span>
              <select value={repeat} onChange={(event) => setRepeat(event.target.value)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Every weekday</option>
                <option value="weekly">Weekly</option>
                <option value="monthly-date">Monthly on this date</option>
                <option value="monthly-weekday">Monthly on this weekday</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            {repeat !== "none" && (
              <label>
                <span>Ends</span>
                <select
                  value={ends}
                  onChange={(event) => setEnds(event.target.value as typeof ends)}
                >
                  <option value="never">Never</option>
                  <option value="count">After occurrences</option>
                  <option value="date">On date</option>
                </select>
              </label>
            )}
          </div>
          {repeat === "weekly" && (
            <div className="weekday-picker">
              {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
                <button
                  type="button"
                  key={`${label}-${index}`}
                  className={weekdays.includes(index) ? "active" : ""}
                  onClick={() =>
                    setWeekdays((current) =>
                      current.includes(index)
                        ? current.filter((day) => day !== index)
                        : [...current, index],
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {repeat !== "none" && ends !== "never" && (
            <label>
              <span>{ends === "count" ? "Occurrences" : "End date"}</span>
              <input
                type={ends === "count" ? "number" : "date"}
                min={ends === "count" ? "1" : format(seed, "yyyy-MM-dd")}
                value={endValue}
                onChange={(event) => setEndValue(event.target.value)}
              />
            </label>
          )}
        </fieldset>
        <div className="editor-grid two">
          <label>
            <span>Reminder minutes before</span>
            <input
              value={draft.reminders.join(", ")}
              onChange={(event) =>
                update(
                  "reminders",
                  event.target.value
                    .split(",")
                    .map(Number)
                    .filter((value) => Number.isFinite(value) && value >= 0),
                )
              }
              placeholder="10, 60, 1440"
            />
          </label>
          <label>
            <span>Course</span>
            <select
              value={draft.courseId ?? ""}
              onChange={(event) => update("courseId", event.target.value || undefined)}
            >
              <option value="">No course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} — {course.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="editor-grid two">
          <label>
            <span>Linked note</span>
            <select
              value={draft.noteId ?? ""}
              onChange={(event) => update("noteId", event.target.value || undefined)}
            >
              <option value="">No linked note</option>
              {notes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Project</span>
            <select
              value={draft.projectId ?? ""}
              onChange={(event) => update("projectId", event.target.value || undefined)}
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {draft.kind === "task" && (
          <fieldset className="subtasks-editor">
            <legend>Subtasks</legend>
            {draft.subtasks.map((entry) => (
              <label key={entry.id}>
                <input
                  type="checkbox"
                  checked={entry.done}
                  onChange={(event) =>
                    update(
                      "subtasks",
                      draft.subtasks.map((sub) =>
                        sub.id === entry.id ? { ...sub, done: event.target.checked } : sub,
                      ),
                    )
                  }
                />
                <input
                  value={entry.title}
                  onChange={(event) =>
                    update(
                      "subtasks",
                      draft.subtasks.map((sub) =>
                        sub.id === entry.id ? { ...sub, title: event.target.value } : sub,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    update(
                      "subtasks",
                      draft.subtasks.filter((sub) => sub.id !== entry.id),
                    )
                  }
                >
                  <X />
                </button>
              </label>
            ))}
            <div>
              <input
                value={subtask}
                onChange={(event) => setSubtask(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (subtask.trim()) {
                      update("subtasks", [
                        ...draft.subtasks,
                        { id: createId("subtask"), title: subtask.trim(), done: false },
                      ]);
                      setSubtask("");
                    }
                  }
                }}
                placeholder="Add a subtask and press Enter"
              />
            </div>
          </fieldset>
        )}
        {item?.rrule && occurrenceStart && (
          <label>
            <span>Apply edits to</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as RecurrenceScope)}
            >
              <option value="this">This occurrence</option>
              <option value="following">This and following</option>
              <option value="all">All occurrences</option>
            </select>
          </label>
        )}
        <footer>
          <div>
            {onDelete && (
              <button className="button danger" type="button" onClick={onDelete}>
                <Trash2 /> Delete
              </button>
            )}
            {onSkip && (
              <button className="button" type="button" onClick={onSkip}>
                <SkipForward /> Skip occurrence
              </button>
            )}
            {onDuplicate && (
              <button className="button" type="button" onClick={onDuplicate}>
                <Copy /> Duplicate
              </button>
            )}
          </div>
          <div>
            <button className="button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" type="submit">
              Save item
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function editorInput(
  item: CalendarItem | undefined,
  occurrenceStart: string | undefined,
  seed: Date,
  categoryId: string,
  defaultReminder: number,
  defaultDuration: number,
): ItemDraft {
  if (item) {
    const offset =
      occurrenceStart && (item.startAt ?? item.dueAt)
        ? new Date(occurrenceStart).getTime() - new Date(item.startAt ?? item.dueAt!).getTime()
        : 0;
    return {
      ...mergeDraft(item),
      ...(item.startAt
        ? { startAt: new Date(new Date(item.startAt).getTime() + offset).toISOString() }
        : {}),
      ...(item.endAt
        ? { endAt: new Date(new Date(item.endAt).getTime() + offset).toISOString() }
        : {}),
      ...(item.dueAt
        ? { dueAt: new Date(new Date(item.dueAt).getTime() + offset).toISOString() }
        : {}),
    };
  }
  const start = new Date(seed);
  if (isSameDay(start, new Date()) && start.getHours() === 0)
    start.setHours(new Date().getHours() + 1, 0, 0, 0);
  else if (start.getHours() === 0) start.setHours(9, 0, 0, 0);
  return {
    kind: "event",
    title: "",
    description: "",
    categoryId,
    startAt: start.toISOString(),
    endAt: addMinutes(start, defaultDuration).toISOString(),
    allDay: false,
    priority: "none",
    subtasks: [],
    rruleExceptions: [],
    reminders: [defaultReminder],
  };
}

function applyOccurrenceChange({
  base,
  occurrence,
  scope,
  moved,
  duration,
  update,
  add,
}: {
  base: CalendarItem;
  occurrence: ItemOccurrence;
  scope: RecurrenceScope;
  moved: Date;
  duration?: number;
  update: (item: CalendarItem, changes: CalendarPatch, label: string) => void;
  add: (input: ItemDraft) => CalendarItem;
}) {
  const anchor = new Date(base.startAt ?? base.dueAt ?? occurrence.occurrenceStart);
  const delta = moved.getTime() - new Date(occurrence.occurrenceStart).getTime();
  const newAnchor = new Date(anchor.getTime() + delta);
  const occurrenceEnd =
    duration !== undefined
      ? addMinutes(moved, duration).toISOString()
      : base.endAt
        ? new Date(new Date(base.endAt).getTime() + delta).toISOString()
        : undefined;
  const seriesEnd =
    duration !== undefined ? addMinutes(newAnchor, duration).toISOString() : occurrenceEnd;
  const changes: CalendarPatch = base.startAt
    ? {
        startAt: newAnchor.toISOString(),
        ...(scope === "all" && seriesEnd
          ? { endAt: seriesEnd }
          : occurrenceEnd
            ? { endAt: occurrenceEnd }
            : {}),
      }
    : base.dueAt
      ? { dueAt: newAnchor.toISOString() }
      : { startAt: moved.toISOString(), endAt: addMinutes(moved, duration ?? 60).toISOString() };
  if (!base.rrule || scope === "all") {
    update(base, changes, `Move ${base.title}`);
    return;
  }
  const exception = [...new Set([...base.rruleExceptions, occurrence.occurrenceStart])];
  if (scope === "this") {
    update(base, { rruleExceptions: exception }, `Move one ${base.title}`);
    add({
      ...mergeDraft(base, changes),
      rrule: undefined,
      rruleExceptions: [],
      completedAt: undefined,
      trashedAt: undefined,
    });
    return;
  }
  const split = splitRule(base.rrule, occurrence.occurrenceStart, base);
  update(base, { rrule: split.previous }, `Split ${base.title}`);
  add({
    ...mergeDraft(base, changes),
    rrule: split.following,
    rruleExceptions: base.rruleExceptions.filter(
      (entry) => new Date(entry) >= new Date(occurrence.occurrenceStart),
    ),
    completedAt: undefined,
    trashedAt: undefined,
  });
}

function applyEditedOccurrence(
  base: CalendarItem,
  occurrence: ItemOccurrence,
  input: ItemDraft,
  scope: RecurrenceScope,
  update: (item: CalendarItem, changes: CalendarPatch, label: string) => void,
  add: (input: ItemDraft) => CalendarItem,
) {
  if (scope === "this") {
    update(
      base,
      { rruleExceptions: [...new Set([...base.rruleExceptions, occurrence.occurrenceStart])] },
      `Edit one ${base.title}`,
    );
    add({
      ...input,
      rrule: undefined,
      rruleExceptions: [],
      completedAt: undefined,
      trashedAt: undefined,
    });
  } else {
    const split = splitRule(base.rrule!, occurrence.occurrenceStart, base);
    update(base, { rrule: split.previous }, `Split ${base.title}`);
    add({
      ...input,
      rrule:
        normalizeRule(input.rrule) === normalizeRule(base.rrule)
          ? split.following
          : (input.rrule ?? split.following),
      rruleExceptions: [],
      completedAt: undefined,
      trashedAt: undefined,
    });
  }
}

function recurrencePreset(rule?: string) {
  if (!rule) return "none";
  const body = rule.toUpperCase();
  if (body.includes("FREQ=DAILY")) return "daily";
  if (body.includes("BYDAY=MO,TU,WE,TH,FR")) return "weekdays";
  if (body.includes("FREQ=WEEKLY")) return "weekly";
  if (body.includes("FREQ=MONTHLY") && body.includes("BYMONTHDAY=")) return "monthly-date";
  if (body.includes("FREQ=MONTHLY")) return "monthly-weekday";
  if (body.includes("FREQ=YEARLY")) return "yearly";
  return "none";
}
function normalizeRule(rule?: string) {
  return rule?.replace(/^RRULE:/, "").toUpperCase();
}
function descriptionHtml(value: string) {
  if (/<[a-z][\s\S]*>/i.test(value))
    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a"],
      ALLOWED_ATTR: ["href"],
    });
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML.replace(/\n/g, "<br>");
}
function recurrenceWeekdays(rule?: string) {
  const match = rule?.match(/BYDAY=([^;]+)/);
  if (!match) return [];
  const days = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  return match[1]!
    .split(",")
    .map((day) => days.indexOf(day.replace(/^[-+]?\d+/, "")))
    .filter((day) => day >= 0);
}
function recurrenceEndValue(rule?: string) {
  const count = rule?.match(/COUNT=(\d+)/)?.[1];
  if (count) return count;
  const until = rule?.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
  return until ? `${until[1]}-${until[2]}-${until[3]}` : "";
}
function viewRange(view: View, date: Date, weekStartsOn: 0 | 1) {
  if (view === "day") return { start: startOfDay(date), end: endOfDay(date) };
  if (view === "week")
    return { start: startOfWeek(date, { weekStartsOn }), end: endOfWeek(date, { weekStartsOn }) };
  if (view === "agenda") return { start: startOfDay(date), end: endOfDay(addMonths(date, 3)) };
  return {
    start: startOfWeek(startOfMonth(date), { weekStartsOn }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn }),
  };
}
function occurrenceDate(item: Pick<CalendarItem, "startAt" | "dueAt">) {
  return new Date(item.startAt ?? item.dueAt ?? 0);
}
function colorOf(categories: Category[], id: string) {
  return categories.find((category) => category.id === id)?.color ?? "var(--accent)";
}
function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}
function toDateTimeLocal(value?: string) {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}
function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}
function readLocal<T extends string>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  return (value || fallback) as T;
}
function loadCategoryFilter(workspaceId: string, view: View, categories: Category[]) {
  try {
    const stored = localStorage.getItem(`diorna-calendar-filters-${workspaceId}-${view}`);
    if (stored === null) return new Set(categories.map((entry) => entry.id));
    const value = JSON.parse(stored) as string[];
    return new Set(value.filter((id) => categories.some((category) => category.id === id)));
  } catch {
    return new Set(categories.map((entry) => entry.id));
  }
}
function loadHiddenCompleted(workspaceId: string): Record<View, boolean> {
  try {
    return {
      day: false,
      week: false,
      month: false,
      agenda: false,
      ...JSON.parse(localStorage.getItem(`diorna-calendar-completed-${workspaceId}`) ?? "{}"),
    };
  } catch {
    return { day: false, week: false, month: false, agenda: false };
  }
}
function compactInput(input: ItemDraft): ItemInput {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as ItemInput;
}
function mergeDraft(item: CalendarItem, changes: CalendarPatch = {}): ItemDraft {
  const { id, workspaceId, createdAt, updatedAt, ...draft } = item;
  void id;
  void workspaceId;
  void createdAt;
  void updatedAt;
  return Object.assign(draft, changes);
}
function occurrenceDraft(
  base: CalendarItem,
  occurrence: ItemOccurrence,
  changes: CalendarPatch = {},
) {
  const draft = mergeDraft(base, changes);
  if (base.startAt) {
    draft.startAt = occurrence.startAt;
    draft.endAt = occurrence.endAt;
  } else if (base.dueAt) {
    draft.startAt = undefined;
    draft.endAt = undefined;
    draft.dueAt = occurrence.occurrenceStart;
  }
  return draft;
}
