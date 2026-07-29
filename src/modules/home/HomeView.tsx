import { useEffect, useRef, useState } from "react";
import { differenceInCalendarDays, format, isBefore, startOfToday } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  EyeOff,
  Flame,
  FolderKanban,
  GripVertical,
  Layers3,
  Settings2,
  Sparkles,
  Timer,
} from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { completionScore, dateKey, habitStatistics } from "@/modules/daily/logic";
import { projectProgress } from "@/modules/projects/logic";
import { focusActualMinutes } from "@/modules/focus/logic";

const studentDefaults = [
  "score",
  "agenda",
  "focus",
  "courses",
  "flashcards",
  "streaks",
  "recent",
  "recap",
];
const personalDefaults = ["score", "agenda", "focus", "projects", "streaks", "recent", "recap"];
const labels: Record<string, string> = {
  score: "Today’s completion",
  agenda: "Agenda and deadlines",
  courses: "Courses",
  flashcards: "Flashcards due",
  projects: "Active projects",
  streaks: "Current streaks",
  recent: "Recently edited",
  recap: "Monthly recap",
  focus: "Focus today",
};

export function HomeView() {
  const state = useDiornaStore();
  const [draggedWidget, setDraggedWidget] = useState<string>();
  const [dragTarget, setDragTarget] = useState<string>();
  const pointerDrag = useRef<{ id: string; pointerId: number }>();
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId)!;
  const defaults = workspace.kind === "student" ? studentDefaults : personalDefaults;
  const savedOrder = state.settings.dashboardWidgetOrder[workspace.id] ?? defaults;
  const order = [...savedOrder, ...defaults.filter((id) => !savedOrder.includes(id))];
  const hidden = state.settings.dashboardHiddenWidgets[workspace.id] ?? [];
  const notes = selectWorkspace(state.notes, workspace.id)
    .filter((note) => !note.trashedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const habits = selectWorkspace(state.habits, workspace.id).filter((habit) => !habit.archived);
  const entries = selectWorkspace(state.habitEntries, workspace.id);
  const items = selectWorkspace(state.items, workspace.id).filter((item) => !item.trashedAt);
  const courses = selectWorkspace(state.courses, workspace.id);
  const dueCards = selectWorkspace(state.flashcards, workspace.id).filter(
    (card) => card.dueDate <= dateKey(new Date()),
  );
  const today = dateKey(new Date());
  const score = completionScore(habits, entries, today);
  const focusPriorities = selectWorkspace(state.focusPriorities, workspace.id).filter(
    (priority) => priority.date === today,
  );
  const focusSessions = selectWorkspace(state.focusSessions, workspace.id).filter(
    (session) => session.status === "completed" && session.endedAt?.slice(0, 10) === today,
  );
  const activeFocus = selectWorkspace(state.focusSessions, workspace.id).find((session) =>
    ["running", "paused"].includes(session.status),
  );
  const upcoming = items
    .filter((item) => {
      const when = item.dueAt ?? item.startAt;
      if (item.completedAt || !when) return false;
      return workspace.kind === "student" || dateKey(new Date(when)) === today;
    })
    .sort((a, b) => (a.dueAt ?? a.startAt ?? "").localeCompare(b.dueAt ?? b.startAt ?? ""))
    .slice(0, workspace.kind === "student" ? 10 : 5);
  const streaks = habits
    .map((habit) => ({
      habit,
      stat: habitStatistics(habit, entries, habit.startDate ?? "2020-01-01", today),
    }))
    .sort((a, b) => b.stat.currentStreak - a.stat.currentStreak)
    .slice(0, 3);
  const projects = selectWorkspace(state.projects, workspace.id)
    .filter(
      (project) => !project.archived && ["planned", "active", "on-hold"].includes(project.status),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
    .map((project) => {
      const linked = items.filter((item) => item.projectId === project.id && item.kind === "task");
      return {
        project,
        open: linked.filter((item) => !item.completedAt).length,
        progress: projectProgress(project, items, state.metricEntries),
      };
    });

  const updateLayout = (nextOrder: string[], nextHidden = hidden) =>
    state.updateSettings({
      dashboardWidgetOrder: {
        ...state.settings.dashboardWidgetOrder,
        [workspace.id]: nextOrder,
      },
      dashboardHiddenWidgets: {
        ...state.settings.dashboardHiddenWidgets,
        [workspace.id]: nextHidden,
      },
    });
  const reorder = (source: string, target: string) => {
    const next = [...order];
    const from = next.indexOf(source);
    const to = next.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    updateLayout(next);
  };
  useEffect(() => {
    const widgetAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-widget-id]")?.dataset.widgetId;
    const onPointerMove = (event: PointerEvent) => {
      if (pointerDrag.current?.pointerId !== event.pointerId) return;
      event.preventDefault();
      setDragTarget(widgetAt(event.clientX, event.clientY));
    };
    const finish = (event: PointerEvent) => {
      const drag = pointerDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const target = widgetAt(event.clientX, event.clientY);
      if (target) reorder(drag.id, target);
      pointerDrag.current = undefined;
      setDraggedWidget(undefined);
      setDragTarget(undefined);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  });

  const widgets: Record<string, React.ReactNode> = {
    score: (
      <section className="widget score-widget">
        <header>
          <span>Today’s completion</span>
          <CheckCircle2 size={17} />
        </header>
        <div className="score-ring" style={{ "--score": `${score ?? 0}%` } as React.CSSProperties}>
          <strong>{score === null ? "—" : `${score}%`}</strong>
          <small>{score === null ? "No habits due" : "done"}</small>
        </div>
        <div className="mini-habits">
          {habits.slice(0, 4).map((habit) => {
            const done = entries.some(
              (entry) =>
                entry.habitId === habit.id &&
                entry.date === today &&
                (entry.done ||
                  (habit.type === "quantity" &&
                    (entry.value ?? 0) >= Math.max(1, habit.target ?? 1))),
            );
            return (
              <button
                key={habit.id}
                onClick={() => {
                  if (done) state.clearHabitEntry(habit.id, today);
                  else
                    state.updateHabitEntry(
                      habit.id,
                      today,
                      habit.type === "quantity" ? (habit.target ?? 1) : true,
                    );
                }}
              >
                <i className={done ? "done" : ""}>{done && "✓"}</i>
                <span>{habit.name}</span>
              </button>
            );
          })}
        </div>
        <button className="link-button" onClick={() => state.setModule("daily")}>
          Open daily grid <ArrowRight size={14} />
        </button>
      </section>
    ),
    agenda: (
      <section className="widget">
        <header>
          <span>{workspace.kind === "student" ? "Deadlines & exams" : "Today’s agenda"}</span>
          <CalendarClock size={17} />
        </header>
        <div className="agenda-list">
          {upcoming.map((item) => {
            const when = item.dueAt ?? item.startAt!;
            const overdue = isBefore(new Date(when), startOfToday());
            const category = state.categories.find((entry) => entry.id === item.categoryId);
            const course = courses.find((entry) => entry.id === item.courseId);
            const days = differenceInCalendarDays(new Date(when), new Date());
            return (
              <button
                className={workspace.kind === "student" && days <= 7 ? "urgent" : ""}
                key={item.id}
                onClick={() => state.setModule("calendar")}
              >
                <i style={{ background: course?.color ?? category?.color }} />
                <span>
                  <strong>{item.title}</strong>
                  <small className={overdue ? "danger" : ""}>
                    {course ? `${course.code} · ` : ""}
                    {format(new Date(when), "EEE d MMM · HH:mm")}
                    {workspace.kind === "student"
                      ? ` · ${days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `${days}d`}`
                      : ""}
                  </small>
                </span>
              </button>
            );
          })}
          {!upcoming.length && (
            <div className="empty-state compact">
              <CalendarClock />
              <strong>Nothing upcoming</strong>
              <span>Add a task from the command palette.</span>
            </div>
          )}
        </div>
      </section>
    ),
    focus: (
      <section className="widget focus-home-widget">
        <header>
          <span>Focus today</span>
          <Timer size={17} />
        </header>
        <div className="focus-home-summary">
          <strong>
            {focusSessions.reduce((sum, session) => sum + focusActualMinutes(session), 0)} min
          </strong>
          <span>protected across {focusSessions.length} completed blocks</span>
        </div>
        <div className="focus-home-priorities">
          {focusPriorities.slice(0, 3).map((priority) => (
            <div className={priority.completedAt ? "completed" : ""} key={priority.id}>
              <i>{priority.completedAt ? "✓" : ""}</i>
              <span>{priority.title}</span>
              <small>{priority.plannedMinutes}m</small>
            </div>
          ))}
          {!focusPriorities.length && (
            <div className="empty-mini">Choose today’s priorities in Focus.</div>
          )}
        </div>
        <button className="link-button" onClick={() => state.setModule("focus")}>
          {activeFocus ? `Resume ${activeFocus.title}` : "Open Focus studio"}{" "}
          <ArrowRight size={14} />
        </button>
      </section>
    ),
    courses: (
      <section className="widget">
        <header>
          <span>Courses</span>
          <BookOpen size={17} />
        </header>
        <div className="course-grid">
          {courses.map((course) => {
            const noteIds = new Set(
              notes.filter((note) => note.courseId === course.id).map((note) => note.id),
            );
            const courseDue = dueCards.filter((card) => noteIds.has(card.noteId)).length;
            return (
              <button
                key={course.id}
                style={{ "--course": course.color } as React.CSSProperties}
                onClick={() => state.setModule("notes")}
              >
                <i />
                <span>
                  <strong>{course.code}</strong>
                  <small>
                    {course.name} · {courseDue} due
                  </small>
                </span>
                <b>{course.credits} ECTS</b>
              </button>
            );
          })}
          <button className="add-card" onClick={() => state.setModule("notes")}>
            + Add a course
          </button>
        </div>
      </section>
    ),
    flashcards: (
      <section className="widget">
        <header>
          <span>Flashcards due today</span>
          <Layers3 size={17} />
        </header>
        <div className="recent-list">
          {dueCards.slice(0, 5).map((card) => (
            <button key={card.id} onClick={() => state.setModule("notes")}>
              <Layers3 size={15} />
              <span>
                <strong>{card.front}</strong>
                <small>Due {format(new Date(`${card.dueDate}T12:00:00`), "d MMM")}</small>
              </span>
            </button>
          ))}
          {!dueCards.length && <div className="empty-mini">Nothing due today.</div>}
        </div>
      </section>
    ),
    projects: (
      <section className="widget">
        <header>
          <span>Active projects</span>
          <FolderKanban size={17} />
        </header>
        {projects.map(({ project, open, progress }) => (
          <div className="project-row" key={project.id}>
            <div>
              <span className="project-icon" style={{ background: project.color }}>
                {project.name.slice(0, 2).toUpperCase()}
              </span>
              <strong>{project.name}</strong>
              <small>
                {open} open tasks · edited {format(new Date(project.updatedAt), "d MMM")}
              </small>
            </div>
            <div className="project-progress">
              <i>
                <span style={{ width: `${progress}%` }} />
              </i>
              <b>{progress}%</b>
            </div>
            <button
              className="icon-button"
              aria-label={`Open ${project.name}`}
              onClick={() =>
                state.openTab({
                  module: "projects",
                  title: project.name,
                  entityId: project.id,
                })
              }
            >
              <ArrowRight />
            </button>
          </div>
        ))}
        {!projects.length && (
          <div className="empty-mini">
            Create a project to track outcomes, connected work and progress here.
          </div>
        )}
      </section>
    ),
    streaks: (
      <section className="widget">
        <header>
          <span>Current streaks</span>
          <Flame size={17} />
        </header>
        <div className="streak-list">
          {streaks.map(({ habit, stat }) => (
            <div key={habit.id}>
              <span>{habit.name}</span>
              <strong>{stat.currentStreak} days</strong>
            </div>
          ))}
        </div>
      </section>
    ),
    recent: (
      <section className="widget">
        <header>
          <span>Recently edited</span>
          <BookOpen size={17} />
        </header>
        <div className="recent-list">
          {notes.slice(0, 5).map((note) => (
            <button
              key={note.id}
              onClick={() =>
                state.openTab({ module: "notes", title: note.title, entityId: note.id })
              }
            >
              <BookOpen size={15} />
              <span>
                <strong>{note.title}</strong>
                <small>{format(new Date(note.updatedAt), "d MMM, HH:mm")}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
    ),
    recap: (
      <section className="widget recap-prompt">
        <Sparkles />
        <div>
          <strong>Your monthly recap</strong>
          <p>Turn the activity you logged into a factual narrative.</p>
        </div>
        <button className="button" onClick={() => state.setModule("recap")}>
          View recaps
        </button>
      </section>
    ),
  };

  return (
    <div className="module-page dashboard-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{format(new Date(), "EEEE, d MMMM")}</span>
          <h1>{workspace.name}</h1>
          <p>
            {workspace.kind === "student"
              ? "Your coursework, deadlines, and revision at a glance."
              : "Today’s agenda, projects, and routines at a glance."}
          </p>
        </div>
        <div className="dashboard-heading-actions">
          <details className="dashboard-customizer">
            <summary className="button">
              <Settings2 size={15} /> Customize
            </summary>
            <div>
              {order.map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(id)}
                    onChange={(event) =>
                      updateLayout(
                        order,
                        event.target.checked
                          ? hidden.filter((entry) => entry !== id)
                          : [...hidden, id],
                      )
                    }
                  />
                  {labels[id] ?? id}
                </label>
              ))}
            </div>
          </details>
          <button className="button primary" onClick={() => state.setCommandPaletteOpen(true)}>
            Quick action <span>⌘</span>
          </button>
        </div>
      </header>
      <div className="dashboard-grid">
        {order
          .filter((id) => !hidden.includes(id) && widgets[id])
          .map((id) => (
            <div
              className={`dashboard-widget-slot ${["courses", "projects", "recap"].includes(id) ? "wide" : ""} ${dragTarget === id && draggedWidget !== id ? "drag-target" : ""}`}
              data-widget-id={id}
              key={id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedWidget) reorder(draggedWidget, id);
                setDraggedWidget(undefined);
                setDragTarget(undefined);
              }}
            >
              <div className="widget-controls">
                <button
                  aria-label={`Move ${labels[id]}`}
                  title="Drag to move. Use arrow keys to reorder."
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/diorna-widget", id);
                    setDraggedWidget(id);
                  }}
                  onDragEnd={() => {
                    setDraggedWidget(undefined);
                    setDragTarget(undefined);
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    pointerDrag.current = { id, pointerId: event.pointerId };
                    setDraggedWidget(id);
                  }}
                  onKeyDown={(event) => {
                    const index = order.indexOf(id);
                    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                      event.preventDefault();
                      const target = order[index - 1];
                      if (target) reorder(id, target);
                    }
                    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                      event.preventDefault();
                      const target = order[index + 1];
                      if (target) reorder(id, target);
                    }
                  }}
                >
                  <GripVertical size={14} />
                </button>
                <button
                  aria-label={`Hide ${labels[id]}`}
                  title="Hide widget"
                  onClick={() => updateLayout(order, [...hidden, id])}
                >
                  <EyeOff size={14} />
                </button>
              </div>
              {widgets[id]}
            </div>
          ))}
      </div>
    </div>
  );
}
