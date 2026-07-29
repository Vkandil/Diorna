import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleStop,
  Clock3,
  Coffee,
  Flag,
  Lightbulb,
  ListTodo,
  MessageSquareWarning,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { format, formatISO, startOfDay, subDays } from "date-fns";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import type {
  FocusDistractionKind,
  FocusMode,
  FocusReview,
  FocusSession,
  FocusSourceType,
} from "@/shared/models";
import {
  buildFocusRecommendations,
  findFocusStudioSession,
  focusActualMinutes,
  focusTimerState,
  formatFocusTimer,
  focusModeLabels,
  focusPeriodStats,
  focusProgress,
  orderedFocusPriorities,
  type FocusRecommendation,
} from "./logic";
import { useFocusClock } from "./clock";
import "./focus.css";

type FocusTab = "today" | "history" | "insights";

interface SourceChoice {
  value: string;
  type: FocusSourceType;
  id?: string;
  title: string;
  detail: string;
}

const focusModes = Object.keys(focusModeLabels) as FocusMode[];
const durationPresets = [25, 45, 60, 90];

export function FocusView() {
  const state = useDiornaStore();
  const [tab, setTab] = useState<FocusTab>("today");
  const workspaceId = state.activeWorkspaceId;
  const today = localDate(new Date());
  const priorities = orderedFocusPriorities(
    selectWorkspace(state.focusPriorities, workspaceId),
    today,
  );
  const sessions = selectWorkspace(state.focusSessions, workspaceId).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const studioSession = findFocusStudioSession(sessions);
  const activeSession = studioSession?.status === "running" ? studioSession : undefined;
  const now = useFocusClock(Boolean(activeSession));
  const plannedToday = sessions.filter(
    (session) =>
      session.status === "planned" &&
      (session.scheduledAt ?? session.createdAt).slice(0, 10) === today,
  );
  const items = selectWorkspace(state.items, workspaceId).filter((item) => !item.trashedAt);
  const projects = selectWorkspace(state.projects, workspaceId);
  const recommendations = buildFocusRecommendations(items, projects);
  const sources = useMemo<SourceChoice[]>(
    () => [
      { value: "custom", type: "custom", title: "Free focus block", detail: "No source" },
      ...items
        .filter((item) => !item.completedAt)
        .map((item) => ({
          value: `calendar:${item.id}`,
          type: "calendar" as const,
          id: item.id,
          title: item.title,
          detail: item.kind === "task" ? "Task" : "Event",
        })),
      ...projects
        .filter(
          (project) => !project.archived && !["completed", "cancelled"].includes(project.status),
        )
        .map((project) => ({
          value: `project:${project.id}`,
          type: "project" as const,
          id: project.id,
          title: project.name,
          detail: "Project",
        })),
      ...selectWorkspace(state.goals, workspaceId)
        .filter((goal) => goal.status === "active")
        .map((goal) => ({
          value: `goal:${goal.id}`,
          type: "goal" as const,
          id: goal.id,
          title: goal.title,
          detail: "Goal",
        })),
      ...selectWorkspace(state.notes, workspaceId)
        .filter((note) => !note.trashedAt)
        .slice(0, 30)
        .map((note) => ({
          value: `note:${note.id}`,
          type: "note" as const,
          id: note.id,
          title: note.title,
          detail: "Note",
        })),
      ...selectWorkspace(state.maps, workspaceId)
        .filter((map) => !map.trashedAt)
        .map((map) => ({
          value: `map:${map.id}`,
          type: "map" as const,
          id: map.id,
          title: map.name,
          detail: "Map",
        })),
      ...selectWorkspace(state.habits, workspaceId)
        .filter((habit) => !habit.archived)
        .map((habit) => ({
          value: `habit:${habit.id}`,
          type: "habit" as const,
          id: habit.id,
          title: habit.name,
          detail: "Daily",
        })),
      ...selectWorkspace(state.trainingActivities, workspaceId)
        .filter((activity) => !activity.archived)
        .map((activity) => ({
          value: `training:${activity.id}`,
          type: "training" as const,
          id: activity.id,
          title: activity.name,
          detail: "Training",
        })),
    ],
    [
      items,
      projects,
      state.goals,
      state.habits,
      state.maps,
      state.notes,
      state.trainingActivities,
      workspaceId,
    ],
  );

  return (
    <div className="module-page focus-page">
      <header className="page-heading focus-heading">
        <div>
          <span className="eyebrow">
            <Brain size={14} /> Execution workspace
          </span>
          <h1>Focus</h1>
          <p>Choose what matters, protect the time, then learn from what actually happened.</p>
        </div>
        <div className="focus-heading-actions">
          <button
            className="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("diorna-open-ai", {
                  detail: {
                    prompt:
                      "Help me choose today's priorities and plan realistic focus blocks from my urgent tasks, upcoming events and active projects.",
                  },
                }),
              )
            }
          >
            <Sparkles size={15} /> Plan with Diorna AI
          </button>
          {!studioSession && (
            <button className="button primary" onClick={() => setTab("today")}>
              <Play size={15} /> Start a session
            </button>
          )}
        </div>
      </header>

      <nav className="focus-tabs" aria-label="Focus views">
        {(["today", "history", "insights"] as FocusTab[]).map((entry) => (
          <button
            key={entry}
            className={tab === entry ? "active" : ""}
            onClick={() => setTab(entry)}
          >
            {entry === "today" ? "Today" : entry === "history" ? "History" : "Insights"}
          </button>
        ))}
      </nav>

      {tab === "today" && (
        <TodayFocus
          now={now}
          studioSession={studioSession}
          priorities={priorities}
          plannedToday={plannedToday}
          sources={sources}
          recommendations={recommendations}
        />
      )}
      {tab === "history" && <FocusHistory sessions={sessions} />}
      {tab === "insights" && <FocusInsights sessions={sessions} />}
    </div>
  );
}

function TodayFocus({
  now,
  studioSession,
  priorities,
  plannedToday,
  sources,
  recommendations,
}: {
  now: number;
  studioSession: FocusSession | undefined;
  priorities: ReturnType<typeof orderedFocusPriorities>;
  plannedToday: FocusSession[];
  sources: SourceChoice[];
  recommendations: ReturnType<typeof buildFocusRecommendations>;
}) {
  const state = useDiornaStore();
  const [priorityTitle, setPriorityTitle] = useState("");
  const [priorityMinutes, setPriorityMinutes] = useState(45);
  const [reviewing, setReviewing] = useState(false);
  const today = localDate(new Date());
  const todayCompleted = state.focusSessions.filter(
    (session) =>
      session.workspaceId === state.activeWorkspaceId &&
      session.status === "completed" &&
      session.endedAt?.slice(0, 10) === today,
  );
  const completedMinutes = todayCompleted.reduce(
    (sum, session) => sum + focusActualMinutes(session),
    0,
  );
  const plannedMinutes = priorities.reduce((sum, priority) => sum + priority.plannedMinutes, 0);

  const addPriority = () => {
    if (!priorityTitle.trim()) return;
    state.addFocusPriority({
      date: today,
      title: priorityTitle,
      sourceType: "custom",
      plannedMinutes: priorityMinutes,
    });
    setPriorityTitle("");
  };

  return (
    <>
      <section className="focus-today-summary" aria-label="Today's focus summary">
        <div>
          <Target />
          <span>
            <strong>{priorities.filter((priority) => !priority.completedAt).length}</strong>
            priorities left
          </span>
        </div>
        <div>
          <Clock3 />
          <span>
            <strong>{plannedMinutes} min</strong>
            planned today
          </span>
        </div>
        <div>
          <Zap />
          <span>
            <strong>{completedMinutes} min</strong>
            protected so far
          </span>
        </div>
        <div>
          <MessageSquareWarning />
          <span>
            <strong>
              {todayCompleted.reduce((sum, session) => sum + session.distractions.length, 0)}
            </strong>
            distractions captured
          </span>
        </div>
      </section>

      <div className="focus-today-grid">
        <section className="focus-card focus-priorities-card">
          <header>
            <div>
              <span className="eyebrow">Decide</span>
              <h2>Today’s priorities</h2>
            </div>
            <Flag />
          </header>
          <div className="focus-priority-list">
            {priorities.map((priority, index) => (
              <article className={priority.completedAt ? "completed" : ""} key={priority.id}>
                <button
                  className="focus-priority-check"
                  aria-label={
                    priority.completedAt ? `Reopen ${priority.title}` : `Complete ${priority.title}`
                  }
                  onClick={() =>
                    state.updateFocusPriority(priority.id, {
                      completedAt: priority.completedAt ? undefined : new Date().toISOString(),
                    })
                  }
                >
                  {priority.completedAt ? <Check /> : index + 1}
                </button>
                <span>
                  <strong>{priority.title}</strong>
                  <small>
                    {priority.plannedMinutes} min · {sourceLabel(priority.sourceType)}
                  </small>
                </span>
                {!priority.completedAt && (
                  <button
                    className="icon-button"
                    aria-label={`Focus on ${priority.title}`}
                    onClick={() => {
                      const session = state.addFocusSession({
                        title: priority.title,
                        intention: `Make meaningful progress on ${priority.title}`,
                        mode: inferMode(priority.sourceType),
                        plannedMinutes: priority.plannedMinutes,
                        sourceType: priority.sourceType,
                        ...(priority.sourceId ? { sourceId: priority.sourceId } : {}),
                        priorityId: priority.id,
                      });
                      state.startFocusSession(session.id);
                    }}
                  >
                    <Play />
                  </button>
                )}
                <button
                  className="icon-button subtle"
                  aria-label={`Delete ${priority.title}`}
                  onClick={() => state.deleteFocusPriority(priority.id)}
                >
                  <Trash2 />
                </button>
              </article>
            ))}
            {!priorities.length && (
              <div className="focus-empty">
                <Target />
                <strong>Choose up to three meaningful outcomes</strong>
                <span>Priorities can come from any part of Diorna or be completely personal.</span>
              </div>
            )}
          </div>
          <form
            className="focus-priority-form"
            onSubmit={(event) => {
              event.preventDefault();
              addPriority();
            }}
          >
            <input
              aria-label="New priority"
              value={priorityTitle}
              onChange={(event) => setPriorityTitle(event.target.value)}
              placeholder="What must move forward today?"
            />
            <input
              aria-label="Priority planned minutes"
              type="number"
              min={5}
              max={480}
              value={priorityMinutes}
              onChange={(event) => setPriorityMinutes(Number(event.target.value))}
            />
            <button className="button" aria-label="Add priority">
              <Plus />
            </button>
          </form>
        </section>

        <section className="focus-card focus-studio-card">
          <header>
            <div>
              <span className="eyebrow">Protect the time</span>
              <h2>Focus studio</h2>
            </div>
            <Brain />
          </header>
          {studioSession ? (
            <ActiveFocusStudio
              now={now}
              session={studioSession}
              reviewing={reviewing}
              setReviewing={setReviewing}
            />
          ) : (
            <FocusComposer sources={sources} />
          )}
        </section>
      </div>

      {plannedToday.length > 0 && !studioSession && (
        <section className="focus-card focus-planned-strip">
          <header>
            <div>
              <span className="eyebrow">Ready when you are</span>
              <h2>Planned focus blocks</h2>
            </div>
            <CalendarClock />
          </header>
          <div>
            {plannedToday.map((session) => (
              <article key={session.id}>
                <span>
                  <strong>{session.title}</strong>
                  <small>
                    {session.scheduledAt
                      ? format(new Date(session.scheduledAt), "HH:mm")
                      : "Any time"}{" "}
                    · {session.plannedMinutes} min · {focusModeLabels[session.mode]}
                  </small>
                </span>
                <button className="button" onClick={() => state.startFocusSession(session.id)}>
                  <Play /> Start
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="focus-now-grid">
        <RecommendationColumn
          eyebrow="Act first"
          title="Urgent tasks"
          icon={<AlertTriangle />}
          entries={recommendations.urgent}
          empty="No urgent task is competing for your attention."
        />
        <RecommendationColumn
          eyebrow="Prepare"
          title="Next events"
          icon={<CalendarClock />}
          entries={recommendations.upcoming}
          empty="Your next 48 hours are clear."
        />
        <RecommendationColumn
          eyebrow="Move outcomes"
          title="Project next actions"
          icon={<TrendingUp />}
          entries={recommendations.projectActions}
          empty="Define a next action in Projects to see it here."
        />
      </section>
    </>
  );
}

function FocusComposer({ sources }: { sources: SourceChoice[] }) {
  const state = useDiornaStore();
  const [title, setTitle] = useState("");
  const [intention, setIntention] = useState("");
  const [mode, setMode] = useState<FocusMode>("deep-work");
  const [minutes, setMinutes] = useState(45);
  const [sourceValue, setSourceValue] = useState("custom");
  const [scheduledAt, setScheduledAt] = useState("");
  const [shield, setShield] = useState("Close chat, silence phone");

  const create = (startNow: boolean) => {
    const source = sources.find((entry) => entry.value === sourceValue) ?? sources[0]!;
    const cleanTitle = title.trim() || source.title || "Focus session";
    let calendarItemId: string | undefined;
    if (scheduledAt) {
      const category = state.categories.find(
        (entry) => entry.workspaceId === state.activeWorkspaceId,
      );
      if (category) {
        const start = new Date(scheduledAt);
        const item = state.addItem({
          kind: "event",
          title: `Focus · ${cleanTitle}`,
          description: intention.trim(),
          categoryId: category.id,
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
          allDay: false,
          priority: "none",
          subtasks: [],
          ...(source.type === "project" && source.id ? { projectId: source.id } : {}),
          rruleExceptions: [],
          reminders: [5],
        });
        calendarItemId = item.id;
      }
    }
    const session = state.addFocusSession({
      title: cleanTitle,
      intention: intention.trim(),
      mode,
      plannedMinutes: minutes,
      sourceType: source.type,
      ...(source.id ? { sourceId: source.id } : {}),
      ...(calendarItemId ? { calendarItemId } : {}),
      ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
      distractionShield: shield
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    });
    if (startNow) state.startFocusSession(session.id);
    setTitle("");
    setIntention("");
    setScheduledAt("");
  };

  return (
    <div className="focus-composer">
      <div className="focus-duration-presets">
        {durationPresets.map((duration) => (
          <button
            key={duration}
            className={minutes === duration ? "active" : ""}
            onClick={() => setMinutes(duration)}
          >
            {duration} min
          </button>
        ))}
      </div>
      <label>
        Work on
        <select
          aria-label="Focus source"
          value={sourceValue}
          onChange={(event) => {
            const value = event.target.value;
            setSourceValue(value);
            const source = sources.find((entry) => entry.value === value);
            if (source && value !== "custom") setTitle(source.title);
          }}
        >
          {sources.map((source) => (
            <option key={source.value} value={source.value}>
              {source.detail} · {source.title}
            </option>
          ))}
        </select>
      </label>
      <div className="focus-form-row">
        <label>
          Session title
          <input
            aria-label="Focus session title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Prepare the client proposal"
          />
        </label>
        <label>
          Mode
          <select
            aria-label="Focus mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as FocusMode)}
          >
            {focusModes.map((entry) => (
              <option key={entry} value={entry}>
                {focusModeLabels[entry]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Definition of done
        <textarea
          aria-label="Focus intention"
          value={intention}
          onChange={(event) => setIntention(event.target.value)}
          placeholder="What concrete result would make this block successful?"
        />
      </label>
      <div className="focus-form-row">
        <label>
          Schedule (optional)
          <input
            aria-label="Focus schedule"
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
        </label>
        <label>
          Distraction shield
          <input
            aria-label="Distraction shield"
            value={shield}
            onChange={(event) => setShield(event.target.value)}
          />
        </label>
      </div>
      <div className="focus-composer-actions">
        <button className="button" disabled={!scheduledAt} onClick={() => create(false)}>
          <CalendarClock /> Add to plan
        </button>
        <button className="button primary" onClick={() => create(true)}>
          <Play /> Start {minutes} minutes
        </button>
      </div>
    </div>
  );
}

function ActiveFocusStudio({
  session,
  now,
  reviewing,
  setReviewing,
}: {
  session: FocusSession;
  now: number;
  reviewing: boolean;
  setReviewing: (value: boolean) => void;
}) {
  const state = useDiornaStore();
  const [distraction, setDistraction] = useState("");
  const [kind, setKind] = useState<FocusDistractionKind>("thought");
  const timer = focusTimerState(session, now);
  if (reviewing) {
    return <FocusReviewForm session={session} onClose={() => setReviewing(false)} />;
  }
  return (
    <div className="active-focus">
      <div
        className="focus-timer-ring"
        data-focus-session-id={session.id}
        data-focus-time={timer.displaySeconds}
        data-focus-phase={timer.overtime ? "overtime" : "remaining"}
        style={{ "--focus-progress": `${focusProgress(session, now)}%` } as React.CSSProperties}
      >
        <div>
          <span>
            {timer.overtime ? "Over target" : session.status === "paused" ? "Paused" : "Remaining"}
          </span>
          <strong>{formatFocusTimer(timer.displaySeconds)}</strong>
          <small>
            {formatFocusTimer(timer.elapsedSeconds)} elapsed · {session.plannedMinutes} min planned
          </small>
        </div>
      </div>
      <div className="active-focus-copy">
        <span className="focus-mode-chip">{focusModeLabels[session.mode]}</span>
        <h3>{session.title}</h3>
        <p>{session.intention || "Stay with the single outcome you chose for this block."}</p>
        {session.distractionShield.length > 0 && (
          <div className="focus-shield">
            <Brain />
            <span>
              {session.distractionShield.map((entry) => (
                <i key={entry}>{entry}</i>
              ))}
            </span>
          </div>
        )}
        <div className="focus-timer-actions">
          {session.status === "running" ? (
            <button className="button" onClick={() => state.pauseFocusSession(session.id)}>
              <Pause /> Pause
            </button>
          ) : (
            <button className="button primary" onClick={() => state.resumeFocusSession(session.id)}>
              <Play /> Resume
            </button>
          )}
          <button className="button primary" onClick={() => setReviewing(true)}>
            <CircleStop /> Finish & review
          </button>
          <button className="icon-button" onClick={() => state.cancelFocusSession(session.id)}>
            <Trash2 />
          </button>
        </div>
      </div>
      <div className="focus-distraction-capture">
        <header>
          <span>
            <MessageSquareWarning /> Park a distraction
          </span>
          <small>Capture it without leaving the session.</small>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (state.addFocusDistraction(session.id, { kind, note: distraction }))
              setDistraction("");
          }}
        >
          <select
            aria-label="Distraction type"
            value={kind}
            onChange={(event) => setKind(event.target.value as FocusDistractionKind)}
          >
            <option value="thought">Thought</option>
            <option value="message">Message</option>
            <option value="task">New task</option>
            <option value="environment">Environment</option>
            <option value="other">Other</option>
          </select>
          <input
            aria-label="Distraction note"
            value={distraction}
            onChange={(event) => setDistraction(event.target.value)}
            placeholder="Write it down, return to focus…"
          />
          <button className="button" aria-label="Capture distraction">
            <Plus />
          </button>
        </form>
        <div className="focus-distraction-list">
          {session.distractions.map((entry) => (
            <button
              key={entry.id}
              className={entry.handled ? "handled" : ""}
              onClick={() =>
                state.updateFocusDistraction(session.id, entry.id, {
                  handled: !entry.handled,
                })
              }
            >
              <i>{distractionIcon(entry.kind)}</i>
              <span>{entry.note}</span>
              {entry.handled && <Check />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FocusReviewForm({ session, onClose }: { session: FocusSession; onClose: () => void }) {
  const state = useDiornaStore();
  const [review, setReview] = useState<FocusReview>({
    focusRating: 4,
    energyBefore: 3,
    energyAfter: 3,
    outcome: "",
    wins: "",
    blockers: "",
    nextAction: "",
    sourceCompleted: false,
  });
  const patch = <K extends keyof FocusReview>(key: K, value: FocusReview[K]) =>
    setReview((current) => ({ ...current, [key]: value }));
  return (
    <form
      className="focus-review"
      onSubmit={(event) => {
        event.preventDefault();
        state.completeFocusSession(session.id, review);
        onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">Close the loop</span>
          <h3>Session review</h3>
        </div>
        <CheckCircle2 />
      </header>
      <div className="focus-review-ratings">
        <Rating
          label="Focus quality"
          value={review.focusRating}
          onChange={(value) => patch("focusRating", value)}
        />
        <Rating
          label="Energy before"
          value={review.energyBefore}
          onChange={(value) => patch("energyBefore", value)}
        />
        <Rating
          label="Energy after"
          value={review.energyAfter}
          onChange={(value) => patch("energyAfter", value)}
        />
      </div>
      <label>
        What did you actually complete?
        <textarea
          aria-label="Focus outcome"
          value={review.outcome}
          onChange={(event) => patch("outcome", event.target.value)}
          placeholder="A factual result, even when different from the initial plan."
        />
      </label>
      <div className="focus-form-row">
        <label>
          What worked?
          <textarea
            aria-label="Focus wins"
            value={review.wins}
            onChange={(event) => patch("wins", event.target.value)}
          />
        </label>
        <label>
          What got in the way?
          <textarea
            aria-label="Focus blockers"
            value={review.blockers}
            onChange={(event) => patch("blockers", event.target.value)}
          />
        </label>
      </div>
      <label>
        Next action
        <input
          aria-label="Focus next action"
          value={review.nextAction}
          onChange={(event) => patch("nextAction", event.target.value)}
          placeholder="Make restarting effortless."
        />
      </label>
      {(session.priorityId || session.sourceType !== "custom") && (
        <label className="focus-review-complete">
          <input
            type="checkbox"
            checked={review.sourceCompleted}
            onChange={(event) => patch("sourceCompleted", event.target.checked)}
          />
          Also complete the linked priority, task or Daily habit
        </label>
      )}
      <div className="focus-composer-actions">
        <button type="button" className="button" onClick={onClose}>
          Back to timer
        </button>
        <button className="button primary">
          <CheckCircle2 /> Save review
        </button>
      </div>
    </form>
  );
}

function Rating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            type="button"
            key={rating}
            className={value === rating ? "active" : ""}
            aria-label={`${label} ${rating}`}
            onClick={() => onChange(rating)}
          >
            {rating}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function RecommendationColumn({
  eyebrow,
  title,
  icon,
  entries,
  empty,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  entries: FocusRecommendation[];
  empty: string;
}) {
  const state = useDiornaStore();
  const today = localDate(new Date());
  const prioritize = (entry: FocusRecommendation) => {
    state.addFocusPriority({
      date: today,
      title: entry.title,
      sourceType: entry.type,
      sourceId: entry.sourceId,
      plannedMinutes: entry.plannedMinutes,
    });
  };
  return (
    <section className="focus-card focus-recommendation-card">
      <header>
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {icon}
      </header>
      <div>
        {entries.map((entry) => (
          <article className={`urgency-${entry.urgency}`} key={entry.id}>
            <i />
            <span>
              <strong>{entry.title}</strong>
              <small>{entry.detail}</small>
            </span>
            <button
              className="icon-button"
              aria-label={`Prioritize ${entry.title}`}
              onClick={() => prioritize(entry)}
            >
              <Plus />
            </button>
          </article>
        ))}
        {!entries.length && <p className="focus-recommendation-empty">{empty}</p>}
      </div>
    </section>
  );
}

function FocusHistory({ sessions }: { sessions: FocusSession[] }) {
  const state = useDiornaStore();
  const [mode, setMode] = useState<FocusMode | "all">("all");
  const filtered = sessions.filter(
    (session) =>
      ["completed", "cancelled"].includes(session.status) &&
      (mode === "all" || session.mode === mode),
  );
  return (
    <section className="focus-history">
      <header className="focus-section-heading">
        <div>
          <span className="eyebrow">Evidence, not guilt</span>
          <h2>Session history</h2>
          <p>See what protected time produced and make the next block easier to start.</p>
        </div>
        <select
          aria-label="Filter focus history"
          value={mode}
          onChange={(event) => setMode(event.target.value as FocusMode | "all")}
        >
          <option value="all">All modes</option>
          {focusModes.map((entry) => (
            <option key={entry} value={entry}>
              {focusModeLabels[entry]}
            </option>
          ))}
        </select>
      </header>
      <div className="focus-history-list">
        {filtered.map((session) => (
          <article key={session.id}>
            <div className={`focus-history-icon mode-${session.mode}`}>
              {session.status === "completed" ? <CheckCircle2 /> : <CircleStop />}
            </div>
            <div className="focus-history-main">
              <header>
                <span>
                  <strong>{session.title}</strong>
                  <small>
                    {session.endedAt
                      ? format(new Date(session.endedAt), "EEE d MMM · HH:mm")
                      : "Cancelled"}{" "}
                    · {focusModeLabels[session.mode]}
                  </small>
                </span>
                <div>
                  <b>{focusActualMinutes(session)} min actual</b>
                  <small>{session.plannedMinutes} min planned</small>
                </div>
              </header>
              {session.review && (
                <div className="focus-history-review">
                  <p>{session.review.outcome || "No outcome note."}</p>
                  <span>
                    <i>
                      <Zap /> {session.review.focusRating}/5 focus
                    </i>
                    <i>
                      <MessageSquareWarning /> {session.distractions.length} distractions
                    </i>
                    {session.review.nextAction && (
                      <button
                        onClick={() =>
                          state.addFocusPriority({
                            date: localDate(new Date()),
                            title: session.review!.nextAction,
                            sourceType: session.sourceType,
                            ...(session.sourceId ? { sourceId: session.sourceId } : {}),
                            plannedMinutes: session.plannedMinutes,
                          })
                        }
                      >
                        <RotateCcw /> Continue: {session.review.nextAction}
                      </button>
                    )}
                  </span>
                </div>
              )}
            </div>
            <button
              className="icon-button subtle"
              aria-label={`Delete focus session ${session.title}`}
              onClick={() => state.deleteFocusSession(session.id)}
            >
              <Trash2 />
            </button>
          </article>
        ))}
        {!filtered.length && (
          <div className="focus-empty large">
            <Clock3 />
            <strong>Your completed sessions will appear here</strong>
            <span>Finish a focus block and save its review to build useful evidence.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function FocusInsights({ sessions }: { sessions: FocusSession[] }) {
  const today = localDate(new Date());
  const sevenStart = localDate(subDays(new Date(), 6));
  const thirtyStart = localDate(subDays(new Date(), 29));
  const week = focusPeriodStats(sessions, sevenStart, today);
  const month = focusPeriodStats(sessions, thirtyStart, today);
  const days = Array.from({ length: 7 }, (_, index) => subDays(new Date(), 6 - index)).map(
    (date) => {
      const key = localDate(date);
      const stat = focusPeriodStats(sessions, key, key);
      return { key, label: format(date, "EEE"), minutes: stat.actualMinutes };
    },
  );
  const maxMinutes = Math.max(60, ...days.map((day) => day.minutes));
  const modeEntries = Object.entries(month.byMode).sort((left, right) => right[1] - left[1]);
  return (
    <div className="focus-insights">
      <section className="focus-insight-kpis">
        <InsightKpi
          icon={<Clock3 />}
          label="Protected time"
          value={`${Math.round((week.actualMinutes / 60) * 10) / 10} h`}
          detail={`${month.actualMinutes} min in 30 days`}
        />
        <InsightKpi
          icon={<Target />}
          label="Plan accuracy"
          value={week.accuracy === null ? "—" : `${week.accuracy}%`}
          detail={`${week.plannedMinutes} min planned`}
        />
        <InsightKpi
          icon={<Zap />}
          label="Focus quality"
          value={week.averageRating === null ? "—" : `${week.averageRating}/5`}
          detail={`${week.sessions} completed sessions`}
        />
        <InsightKpi
          icon={<MessageSquareWarning />}
          label="Distractions"
          value={String(week.distractions)}
          detail={
            week.sessions
              ? `${Math.round((week.distractions / week.sessions) * 10) / 10} per session`
              : "No completed session"
          }
        />
      </section>
      <div className="focus-insight-grid">
        <section className="focus-card focus-week-chart">
          <header>
            <div>
              <span className="eyebrow">Last seven days</span>
              <h2>Actual focused minutes</h2>
            </div>
            <TrendingUp />
          </header>
          <div className="focus-bars">
            {days.map((day) => (
              <div key={day.key}>
                <span>
                  <i style={{ height: `${Math.max(3, (day.minutes / maxMinutes) * 100)}%` }} />
                </span>
                <strong>{day.minutes || "—"}</strong>
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="focus-card focus-mode-breakdown">
          <header>
            <div>
              <span className="eyebrow">Last 30 days</span>
              <h2>Where attention went</h2>
            </div>
            <Brain />
          </header>
          <div>
            {modeEntries.map(([mode, minutes]) => (
              <article key={mode}>
                <span>
                  <strong>{focusModeLabels[mode as FocusMode] ?? mode}</strong>
                  <small>{minutes} min</small>
                </span>
                <i>
                  <b style={{ width: `${(minutes / Math.max(1, month.actualMinutes)) * 100}%` }} />
                </i>
              </article>
            ))}
            {!modeEntries.length && (
              <div className="focus-empty">
                <Brain />
                <strong>No focus pattern yet</strong>
                <span>Your modes will be compared after completed sessions.</span>
              </div>
            )}
          </div>
        </section>
      </div>
      <section className="focus-card focus-insight-advice">
        <Lightbulb />
        <div>
          <span className="eyebrow">A useful reading</span>
          <h2>{insightHeadline(week)}</h2>
          <p>{insightAdvice(week)}</p>
        </div>
      </section>
    </div>
  );
}

function InsightKpi({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article>
      <i>{icon}</i>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <b>{detail}</b>
      </span>
    </article>
  );
}

function insightHeadline(stats: ReturnType<typeof focusPeriodStats>): string {
  if (!stats.sessions) return "Start small enough to finish.";
  if ((stats.averageRating ?? 0) >= 4 && (stats.accuracy ?? 0) >= 80)
    return "Your plans and attention are aligned.";
  if ((stats.accuracy ?? 0) > 130) return "Your blocks tend to run longer than planned.";
  if ((stats.accuracy ?? 100) < 65) return "Shorter, more concrete blocks may work better.";
  if (stats.distractions > stats.sessions * 2)
    return "Your distraction log points to an environment problem.";
  return "Your focus rhythm is becoming measurable.";
}

function insightAdvice(stats: ReturnType<typeof focusPeriodStats>): string {
  if (!stats.sessions)
    return "Choose one concrete outcome and protect 25 minutes. Diorna will use the review—not an arbitrary streak—to help you improve.";
  if ((stats.accuracy ?? 0) > 130)
    return "Leave buffer around deep work, or split the outcome into two blocks so Calendar remains realistic.";
  if ((stats.accuracy ?? 100) < 65)
    return "Reduce the next estimate and make the definition of done observable before starting.";
  if (stats.distractions > stats.sessions * 2)
    return "Review the repeated distraction categories and add the strongest countermeasure to your distraction shield.";
  return "Keep reviewing the outcome and next action. That closes the loop between Projects, Calendar and your next Focus block.";
}

function inferMode(sourceType: FocusSourceType): FocusMode {
  if (sourceType === "training" || sourceType === "habit") return "personal";
  if (sourceType === "calendar") return "admin";
  return "deep-work";
}

function sourceLabel(sourceType: FocusSourceType): string {
  return sourceType === "calendar"
    ? "Calendar"
    : sourceType === "project"
      ? "Project"
      : sourceType === "goal"
        ? "Goal"
        : sourceType === "habit"
          ? "Daily"
          : sourceType === "training"
            ? "Training"
            : sourceType === "custom"
              ? "Free priority"
              : sourceType[0]!.toUpperCase() + sourceType.slice(1);
}

function distractionIcon(kind: FocusDistractionKind): React.ReactNode {
  if (kind === "message") return <MessageSquareWarning />;
  if (kind === "task") return <ListTodo />;
  if (kind === "environment") return <Coffee />;
  return <Lightbulb />;
}

function localDate(value: Date): string {
  return formatISO(startOfDay(value), { representation: "date" });
}
