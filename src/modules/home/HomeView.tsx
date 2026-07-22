import { format, isBefore, startOfToday } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Flame,
  FolderKanban,
  Sparkles,
} from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { completionScore, dateKey, habitStatistics } from "@/modules/daily/logic";

export function HomeView() {
  const state = useDiornaStore();
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId)!;
  const notes = selectWorkspace(state.notes, workspace.id).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const habits = selectWorkspace(state.habits, workspace.id).filter((habit) => !habit.archived);
  const entries = selectWorkspace(state.habitEntries, workspace.id);
  const items = selectWorkspace(state.items, workspace.id);
  const today = dateKey(new Date());
  const score = completionScore(habits, entries, today);
  const upcoming = items
    .filter((item) => !item.completedAt && (item.dueAt ?? item.startAt))
    .sort((a, b) => (a.dueAt ?? a.startAt ?? "").localeCompare(b.dueAt ?? b.startAt ?? ""))
    .slice(0, 5);
  const streaks = habits
    .map((habit) => ({
      habit,
      stat: habitStatistics(habit, entries, habit.startDate ?? "2020-01-01", today),
    }))
    .sort((a, b) => b.stat.currentStreak - a.stat.currentStreak)
    .slice(0, 3);
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
        <button className="button primary" onClick={() => state.setCommandPaletteOpen(true)}>
          Quick action <span>⌘</span>
        </button>
      </header>
      <div className="dashboard-grid">
        <section className="widget score-widget">
          <header>
            <span>Today’s completion</span>
            <CheckCircle2 size={17} />
          </header>
          <div
            className="score-ring"
            style={{ "--score": `${score ?? 0}%` } as React.CSSProperties}
          >
            <strong>{score === null ? "—" : `${score}%`}</strong>
            <small>{score === null ? "No habits due" : "done"}</small>
          </div>
          <div className="mini-habits">
            {habits.slice(0, 4).map((habit) => {
              const done = entries.some(
                (entry) =>
                  entry.habitId === habit.id &&
                  entry.date === today &&
                  (entry.done || (entry.value ?? 0) >= (habit.target ?? 0)),
              );
              return (
                <button
                  key={habit.id}
                  onClick={() => state.updateHabitEntry(habit.id, today, !done)}
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
              return (
                <button key={item.id} onClick={() => state.setModule("calendar")}>
                  <i style={{ background: category?.color }} />
                  <span>
                    <strong>{item.title}</strong>
                    <small className={overdue ? "danger" : ""}>
                      {overdue ? "Overdue · " : ""}
                      {format(new Date(when), "EEE d MMM · HH:mm")}
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
        {workspace.kind === "student" ? (
          <section className="widget wide">
            <header>
              <span>Courses</span>
              <BookOpen size={17} />
            </header>
            <div className="course-grid">
              {selectWorkspace(state.courses, workspace.id).map((course) => (
                <button key={course.id} style={{ "--course": course.color } as React.CSSProperties}>
                  <i />
                  <span>
                    <strong>{course.code}</strong>
                    <small>{course.name}</small>
                  </span>
                  <b>{course.credits} ECTS</b>
                </button>
              ))}
              <button className="add-card">+ Add a course</button>
            </div>
          </section>
        ) : (
          <section className="widget wide">
            <header>
              <span>Active projects</span>
              <FolderKanban size={17} />
            </header>
            <div className="project-row">
              <div>
                <span className="project-icon">CU</span>
                <strong>CartUnlock</strong>
                <small>11 open tasks · edited today</small>
              </div>
              <div className="project-progress">
                <i>
                  <span style={{ width: "68%" }} />
                </i>
                <b>68%</b>
              </div>
              <button className="icon-button">
                <ArrowRight />
              </button>
            </div>
          </section>
        )}
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
                  state.openTab({
                    module: "notes",
                    title: note.title,
                    entityId: note.id,
                  })
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
      </div>
    </div>
  );
}
