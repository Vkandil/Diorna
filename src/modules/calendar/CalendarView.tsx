import { useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, Plus } from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { parseQuickItem } from "./parser";
import type { CalendarItem } from "@/shared/models";

type View = "day" | "week" | "month" | "agenda";

export function CalendarView() {
  const state = useDiornaStore();
  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState(new Date());
  const [quick, setQuick] = useState("");
  const categories = selectWorkspace(state.categories, state.activeWorkspaceId);
  const items = selectWorkspace(state.items, state.activeWorkspaceId).filter(
    (item) => !item.trashedAt,
  );
  const [visibleCategories, setVisibleCategories] = useState(
    () => new Set(categories.map((entry) => entry.id)),
  );
  const visibleItems = items.filter((item) => visibleCategories.has(item.categoryId));
  const overdue = visibleItems.filter(
    (item) =>
      item.kind === "task" && !item.completedAt && item.dueAt && new Date(item.dueAt) < new Date(),
  );
  const unscheduled = visibleItems.filter(
    (item) => item.kind === "task" && !item.startAt && !item.completedAt,
  );
  const move = (direction: number) =>
    setDate(
      view === "month"
        ? addMonths(date, direction)
        : view === "week"
          ? addWeeks(date, direction)
          : addDays(date, direction),
    );
  const submitQuick = () => {
    if (!quick.trim()) return;
    const parsed = parseQuickItem(quick);
    const category =
      categories.find((entry) => entry.name.toLowerCase() === parsed.category?.toLowerCase()) ??
      categories[0];
    if (!category) return;
    const task = quick.trimStart().startsWith("[]");
    state.addItem({
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
  return (
    <div className="calendar-page">
      <header className="module-toolbar calendar-toolbar">
        <button className="button" onClick={() => setDate(new Date())}>
          Today
        </button>
        <button className="icon-button" onClick={() => move(-1)}>
          <ChevronLeft />
        </button>
        <button className="icon-button" onClick={() => move(1)}>
          <ChevronRight />
        </button>
        <h2>{format(date, view === "month" ? "MMMM yyyy" : "MMMM d, yyyy")}</h2>
        <div className="segmented">
          {(["day", "week", "month", "agenda"] as View[]).map((entry) => (
            <button
              className={entry === view ? "active" : ""}
              key={entry}
              onClick={() => setView(entry)}
            >
              {entry[0]!.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="button primary icon-text">
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
          placeholder="Quick add: gym tomorrow 6pm #sport…"
        />
        {quick && (
          <span className="parse-preview">
            {parseQuickItem(quick).tokens.map((token) => (
              <b key={token.text} className={token.kind}>
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
            onClick={(event) =>
              setVisibleCategories((current) => {
                if (event.altKey) return new Set([category.id]);
                const next = new Set(current);
                if (next.has(category.id)) next.delete(category.id);
                else next.add(category.id);
                return next;
              })
            }
          >
            <i style={{ background: category.color }} />
            {category.name}
          </button>
        ))}
        <button onClick={() => setVisibleCategories(new Set(categories.map((entry) => entry.id)))}>
          Reset
        </button>
      </div>
      {overdue.length > 0 && (
        <section className="overdue-bar">
          <CircleAlert />
          <strong>{overdue.length} overdue</strong>
          {overdue.slice(0, 3).map((item) => (
            <span key={item.id}>{item.title}</span>
          ))}
          <button
            onClick={() =>
              overdue.forEach((item) =>
                state.updateItem(item.id, { dueAt: new Date().toISOString() }),
              )
            }
          >
            Move all to today
          </button>
        </section>
      )}
      {unscheduled.length > 0 && (
        <section className="unscheduled-tray">
          <strong>Unscheduled</strong>
          {unscheduled.map((item) => (
            <button
              draggable
              onDragStart={(event) => event.dataTransfer.setData("text/diorna-item", item.id)}
              key={item.id}
            >
              {item.title}
            </button>
          ))}
          <small>Drag a task onto the calendar to time-block it</small>
        </section>
      )}
      <div className="calendar-body">
        {view === "month" ? (
          <MonthView date={date} items={visibleItems} />
        ) : view === "agenda" ? (
          <AgendaView items={visibleItems} />
        ) : (
          <TimelineView date={date} items={visibleItems} days={view === "day" ? 1 : 7} />
        )}
      </div>
    </div>
  );
}

function MonthView({ date, items }: { date: Date; items: CalendarItem[] }) {
  const state = useDiornaStore();
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });
  return (
    <div className="month-grid">
      <div className="weekday-row">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <strong key={day}>{day}</strong>
        ))}
      </div>
      <div className="month-days">
        {days.map((day) => {
          const dayItems = items.filter((item) =>
            isSameDay(new Date(item.startAt ?? item.dueAt ?? 0), day),
          );
          return (
            <div
              key={day.toISOString()}
              className={`${day.getMonth() !== date.getMonth() ? "outside" : ""} ${isSameDay(day, new Date()) ? "today" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const id = event.dataTransfer.getData("text/diorna-item");
                const item = items.find((entry) => entry.id === id);
                if (!item) return;
                const original = new Date(item.startAt ?? item.dueAt ?? day);
                const moved = new Date(day);
                moved.setHours(original.getHours(), original.getMinutes(), 0, 0);
                const duration =
                  item.endAt && item.startAt
                    ? new Date(item.endAt).getTime() - new Date(item.startAt).getTime()
                    : 60 * 60_000;
                state.updateItem(id, {
                  startAt: moved.toISOString(),
                  ...(item.kind === "event"
                    ? {
                        endAt: new Date(moved.getTime() + duration).toISOString(),
                      }
                    : {}),
                });
              }}
            >
              <span>{format(day, "d")}</span>
              {dayItems.slice(0, 4).map((item) => (
                <button
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/diorna-item", item.id)}
                  className={item.completedAt ? "complete" : ""}
                  key={item.id}
                  style={
                    {
                      "--item": state.categories.find((category) => category.id === item.categoryId)
                        ?.color,
                    } as React.CSSProperties
                  }
                >
                  {item.kind === "task" && <Check size={11} />} {item.title}
                </button>
              ))}
              {dayItems.length > 4 && <button className="more">+{dayItems.length - 4} more</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({ date, items, days }: { date: Date; items: CalendarItem[]; days: number }) {
  const state = useDiornaStore();
  const start = days === 7 ? startOfWeek(date, { weekStartsOn: 1 }) : date;
  const dates = Array.from({ length: days }, (_, index) => addDays(start, index));
  const hours = Array.from({ length: 16 }, (_, index) => index + 7);
  return (
    <div className="timeline">
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
      <div className="timeline-scroll">
        <div className="hour-labels">
          {hours.map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
          ))}
        </div>
        <div className="timeline-days" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
          {dates.map((day) => (
            <div
              className="timeline-day"
              key={day.toISOString()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const id = event.dataTransfer.getData("text/diorna-item");
                const item = items.find((entry) => entry.id === id);
                if (!item) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const minutes = Math.max(
                  0,
                  Math.min(16 * 60, Math.round((((event.clientY - rect.top) / 54) * 60) / 15) * 15),
                );
                const moved = new Date(day);
                moved.setHours(7 + Math.floor(minutes / 60), minutes % 60, 0, 0);
                const duration =
                  item.endAt && item.startAt
                    ? new Date(item.endAt).getTime() - new Date(item.startAt).getTime()
                    : 60 * 60_000;
                state.updateItem(id, {
                  startAt: moved.toISOString(),
                  ...(item.kind === "event"
                    ? {
                        endAt: new Date(moved.getTime() + duration).toISOString(),
                      }
                    : {}),
                });
              }}
            >
              {hours.map((hour) => (
                <i key={hour} />
              ))}
              {items
                .filter((item) => item.startAt && isSameDay(new Date(item.startAt), day))
                .map((item) => {
                  const startAt = new Date(item.startAt!);
                  const duration = item.endAt
                    ? (new Date(item.endAt).getTime() - startAt.getTime()) / 60_000
                    : 60;
                  return (
                    <button
                      draggable
                      onDragStart={(event) =>
                        event.dataTransfer.setData("text/diorna-item", item.id)
                      }
                      key={item.id}
                      className="time-item"
                      style={
                        {
                          top: `${((startAt.getHours() - 7) * 60 + startAt.getMinutes()) * 0.9}px`,
                          height: `${Math.max(28, duration * 0.9)}px`,
                          "--item": state.categories.find(
                            (category) => category.id === item.categoryId,
                          )?.color,
                        } as React.CSSProperties
                      }
                    >
                      <strong>{item.title}</strong>
                      <small>{format(startAt, "HH:mm")}</small>
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

function AgendaView({ items }: { items: CalendarItem[] }) {
  const state = useDiornaStore();
  const sorted = [...items]
    .filter((item) => item.startAt ?? item.dueAt)
    .sort((a, b) => (a.startAt ?? a.dueAt!).localeCompare(b.startAt ?? b.dueAt!));
  return (
    <div className="agenda-view">
      {sorted.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            if (item.kind === "task" && !item.completedAt) {
              state.updateItem(item.id, {
                completedAt: new Date().toISOString(),
              });
            }
          }}
        >
          <span className="agenda-date">
            <strong>{format(new Date(item.startAt ?? item.dueAt!), "d")}</strong>
            <small>{format(new Date(item.startAt ?? item.dueAt!), "MMM")}</small>
          </span>
          <i
            style={{
              background: state.categories.find((entry) => entry.id === item.categoryId)?.color,
            }}
          />
          <span>
            <strong className={item.completedAt ? "strike" : ""}>{item.title}</strong>
            <small>
              <Clock3 /> {format(new Date(item.startAt ?? item.dueAt!), "EEEE · HH:mm")}
            </small>
          </span>
          {item.priority !== "none" && <b>{item.priority}</b>}
        </button>
      ))}
    </div>
  );
}
