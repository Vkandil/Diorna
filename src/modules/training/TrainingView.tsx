import { useMemo, useState } from "react";
import {
  Activity,
  Bike,
  CalendarPlus,
  Check,
  ChevronDown,
  Dumbbell,
  FileInput,
  Footprints,
  History,
  Library,
  LineChart as LineChartIcon,
  Plus,
  Repeat2,
  Save,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  Waves,
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
import { format, formatDistanceToNowStrict } from "date-fns";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { createId } from "@/shared/id";
import type {
  TrainingActivity,
  TrainingActivityKind,
  TrainingExercise,
  TrainingExerciseResult,
  TrainingLoadMode,
  TrainingMeasureType,
  TrainingSession,
  TrainingSet,
  TrainingTemplate,
  TrainingTemplateExercise,
} from "@/shared/models";
import {
  availableProgressMetrics,
  exerciseProgress,
  formatExerciseResult,
  previousExerciseResult,
  sessionDistance,
  sessionDurationMinutes,
  sessionVolume,
  type TrainingProgressMetric,
} from "./logic";
import { parseTrainingNote } from "./import";
import {
  findCatalogExercise,
  normalizeExerciseName,
  searchTrainingExerciseCatalog,
  TRAINING_EXERCISE_CATALOG,
  type TrainingExerciseCatalogEntry,
} from "./catalog";
import "./training.css";

type TrainingSection = "session" | "history" | "progress" | "library";

const activityKinds: Array<{
  kind: TrainingActivityKind;
  label: string;
  icon: typeof Dumbbell;
  color: string;
}> = [
  { kind: "strength", label: "Strength", icon: Dumbbell, color: "#1D518A" },
  { kind: "running", label: "Running", icon: Footprints, color: "#C66542" },
  { kind: "cycling", label: "Cycling", icon: Bike, color: "#DAA343" },
  { kind: "swimming", label: "Swimming", icon: Waves, color: "#3F6495" },
  { kind: "team", label: "Team sport", icon: Trophy, color: "#7C8E58" },
  { kind: "mobility", label: "Mobility", icon: Activity, color: "#7C8E58" },
  { kind: "custom", label: "Custom", icon: Sparkles, color: "#3F6495" },
];

export function TrainingView() {
  const state = useDiornaStore();
  const workspaceId = state.activeWorkspaceId;
  const activities = selectWorkspace(state.trainingActivities, workspaceId)
    .filter((activity) => !activity.archived)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const exercises = selectWorkspace(state.trainingExercises, workspaceId).filter(
    (exercise) => !exercise.archived,
  );
  const templates = selectWorkspace(state.trainingTemplates, workspaceId).filter(
    (template) => !template.archived,
  );
  const sessions = selectWorkspace(state.trainingSessions, workspaceId).sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );
  const activeSession = sessions.find((session) => session.status === "in-progress");
  const [section, setSection] = useState<TrainingSection>("session");
  const [activityId, setActivityId] = useState(activities[0]?.id ?? "");
  const [importOpen, setImportOpen] = useState(false);
  const [scheduleTemplate, setScheduleTemplate] = useState<TrainingTemplate>();
  const effectiveActivityId = activities.some((activity) => activity.id === activityId)
    ? activityId
    : (activities[0]?.id ?? "");
  const finish = () => {
    if (!activeSession) return;
    state.completeTrainingSession(activeSession.id);
    setSection("history");
  };
  return (
    <div className="module-page training-page">
      <header className="page-heading training-heading">
        <div>
          <span className="eyebrow">Progress you can repeat</span>
          <h1>Training</h1>
          <p>Log a session quickly, reuse what worked, and see your progress over time.</p>
        </div>
        <div className="training-heading-actions">
          <button className="button icon-text" onClick={() => setImportOpen(true)}>
            <FileInput /> Import note
          </button>
          {activeSession ? (
            <button className="button primary icon-text" onClick={finish}>
              <Check /> Finish session
            </button>
          ) : (
            <button
              className="button primary icon-text"
              disabled={!effectiveActivityId}
              onClick={() =>
                state.startTrainingSession({
                  activityId: effectiveActivityId,
                  title:
                    activities.find((activity) => activity.id === effectiveActivityId)?.name ??
                    "Training",
                })
              }
            >
              <Plus /> Start session
            </button>
          )}
        </div>
      </header>
      <nav className="training-tabs" aria-label="Training sections">
        {(
          [
            ["session", "Session", Dumbbell],
            ["history", "History", History],
            ["progress", "Progress", LineChartIcon],
            ["library", "Library", Library],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            className={section === id ? "active" : ""}
            onClick={() => setSection(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>
      {section === "session" &&
        (activeSession ? (
          <ActiveSession
            session={activeSession}
            activity={activities.find((activity) => activity.id === activeSession.activityId)}
            exercises={exercises.filter(
              (exercise) => exercise.activityId === activeSession.activityId,
            )}
            sessions={sessions}
            onFinish={finish}
            onOpenLibrary={() => setSection("library")}
          />
        ) : (
          <SessionStart
            activities={activities}
            activityId={effectiveActivityId}
            setActivityId={setActivityId}
            templates={templates}
            sessions={sessions}
            onOpenLibrary={() => setSection("library")}
            onSchedule={setScheduleTemplate}
          />
        ))}
      {section === "history" && (
        <TrainingHistory
          sessions={sessions}
          activities={activities}
          onRepeat={(sessionId) => {
            const repeated = state.repeatTrainingSession(sessionId);
            if (repeated) setSection("session");
          }}
        />
      )}
      {section === "progress" && (
        <TrainingProgress exercises={exercises} sessions={sessions} activities={activities} />
      )}
      {section === "library" && (
        <TrainingLibrary
          activities={activities}
          exercises={exercises}
          templates={templates}
          initialActivityId={effectiveActivityId}
        />
      )}
      {importOpen && (
        <TrainingImportDialog
          activities={activities}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            setSection("history");
          }}
        />
      )}
      {scheduleTemplate && (
        <ScheduleTrainingDialog
          template={scheduleTemplate}
          activity={activities.find((activity) => activity.id === scheduleTemplate.activityId)}
          onClose={() => setScheduleTemplate(undefined)}
        />
      )}
    </div>
  );
}

function SessionStart({
  activities,
  activityId,
  setActivityId,
  templates,
  sessions,
  onOpenLibrary,
  onSchedule,
}: {
  activities: TrainingActivity[];
  activityId: string;
  setActivityId: (id: string) => void;
  templates: TrainingTemplate[];
  sessions: TrainingSession[];
  onOpenLibrary: () => void;
  onSchedule: (template: TrainingTemplate) => void;
}) {
  const state = useDiornaStore();
  const matchingTemplates = templates.filter((template) => template.activityId === activityId);
  const lastSession = sessions.find(
    (session) => session.status === "completed" && session.activityId === activityId,
  );
  if (!activities.length)
    return (
      <section className="training-empty-state">
        <div className="training-empty-icon">
          <Dumbbell />
        </div>
        <span className="eyebrow">Set up in seconds</span>
        <h2>Create your first activity</h2>
        <p>
          Choose a starting point. You can rename it, add custom exercises and change every
          measurement later.
        </p>
        <div className="training-kind-grid">
          {activityKinds.slice(0, 6).map(({ kind, label, icon: Icon, color }) => (
            <button
              key={kind}
              onClick={() => {
                const activity = state.addTrainingActivity({
                  name: label,
                  kind,
                  color,
                  trackInDaily: true,
                });
                seedActivity(activity);
              }}
            >
              <Icon style={{ color }} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button className="button" onClick={onOpenLibrary}>
          Build a custom activity
        </button>
      </section>
    );
  return (
    <div className="training-start-layout">
      <section className="training-start-main">
        <div className="training-section-heading">
          <div>
            <span className="eyebrow">Choose your session</span>
            <h2>Ready when you are</h2>
          </div>
          <label className="training-activity-picker">
            <span>Activity</span>
            <select value={activityId} onChange={(event) => setActivityId(event.target.value)}>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>
        </div>
        <div className="training-template-grid">
          {matchingTemplates.map((template) => (
            <article key={template.id} className="training-template-card">
              <div className="training-template-icon">
                <Dumbbell />
              </div>
              <div>
                <span className="eyebrow">Template</span>
                <h3>{template.name}</h3>
                <p>
                  {template.exercises.length} exercise
                  {template.exercises.length === 1 ? "" : "s"} ·{" "}
                  {template.exercises.reduce((sum, exercise) => sum + exercise.plannedSets, 0)} sets
                </p>
              </div>
              <ol>
                {template.exercises.slice(0, 4).map((exercise) => (
                  <li key={exercise.id}>{exercise.name}</li>
                ))}
              </ol>
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() =>
                    state.startTrainingSession({
                      activityId: template.activityId,
                      templateId: template.id,
                    })
                  }
                >
                  Start
                </button>
                <button
                  className="icon-button"
                  aria-label={`Schedule ${template.name}`}
                  title="Schedule in Calendar"
                  onClick={() => onSchedule(template)}
                >
                  <CalendarPlus />
                </button>
              </div>
            </article>
          ))}
          <button className="training-new-template-card" onClick={onOpenLibrary}>
            <Plus />
            <strong>Create a template</strong>
            <span>Reuse the same structure next time</span>
          </button>
        </div>
      </section>
      <aside className="training-last-card">
        <span className="eyebrow">Last session</span>
        {lastSession ? (
          <>
            <h2>{lastSession.title}</h2>
            <time>{format(new Date(lastSession.startedAt), "EEEE, MMMM d")}</time>
            <div className="training-last-stats">
              <strong>{lastSession.results.length}</strong>
              <span>exercises</span>
              <strong>{sessionDurationMinutes(lastSession)}</strong>
              <span>minutes</span>
              <strong>{sessionVolume(lastSession).toLocaleString()}</strong>
              <span>volume</span>
            </div>
            <button
              className="button primary icon-text"
              onClick={() => state.repeatTrainingSession(lastSession.id)}
            >
              <Repeat2 /> Repeat last session
            </button>
          </>
        ) : (
          <>
            <h2>No completed session yet</h2>
            <p>Your previous values will appear here after the first one.</p>
          </>
        )}
      </aside>
    </div>
  );
}

function ActiveSession({
  session,
  activity,
  exercises,
  sessions,
  onFinish,
  onOpenLibrary,
}: {
  session: TrainingSession;
  activity: TrainingActivity | undefined;
  exercises: TrainingExercise[];
  sessions: TrainingSession[];
  onFinish: () => void;
  onOpenLibrary: () => void;
}) {
  const state = useDiornaStore();
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const availableExercises = exercises
    .filter((exercise) => !session.results.some((result) => result.exerciseId === exercise.id))
    .filter(
      (exercise) =>
        !exerciseQuery.trim() ||
        normalizeExerciseName(exercise.name).includes(normalizeExerciseName(exerciseQuery)),
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 8);
  const updateResults = (results: TrainingExerciseResult[]) =>
    state.updateTrainingSession(session.id, { results });
  const updateResult = (
    resultId: string,
    updater: (result: TrainingExerciseResult) => TrainingExerciseResult,
  ) =>
    updateResults(
      session.results.map((result) => (result.id === resultId ? updater(result) : result)),
    );
  return (
    <div className="training-active-session">
      <section className="training-session-summary">
        <div
          className="training-session-activity-icon"
          style={{ background: activity?.color ?? "var(--accent)" }}
        >
          <Dumbbell />
        </div>
        <div>
          <span className="eyebrow">In progress</span>
          <input
            aria-label="Session title"
            value={session.title}
            onChange={(event) =>
              state.updateTrainingSession(session.id, { title: event.target.value })
            }
          />
          <p>
            Started {formatDistanceToNowStrict(new Date(session.startedAt), { addSuffix: true })} ·{" "}
            {session.results.length} exercises
          </p>
        </div>
        <label className="training-session-notes">
          <span>Session note</span>
          <input
            placeholder="Energy, technique, context…"
            value={session.notes}
            onChange={(event) =>
              state.updateTrainingSession(session.id, { notes: event.target.value })
            }
          />
        </label>
      </section>
      <div className="training-exercise-stack">
        {session.results.map((result, resultIndex) => {
          const tracksLoad = exerciseTracksLoad(result);
          const tracksReps = exerciseTracksRepetitions(result);
          const previous = previousExerciseResult(
            sessions.filter((entry) => entry.id !== session.id),
            result.exerciseId,
            session.startedAt,
          );
          return (
            <article className="training-exercise-card" key={result.id}>
              <header>
                <span className="training-exercise-number">{resultIndex + 1}</span>
                <div>
                  <h2>{result.name}</h2>
                  <p>
                    Previous: <strong>{formatExerciseResult(previous)}</strong>
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Remove ${result.name}`}
                  onClick={() =>
                    updateResults(session.results.filter((entry) => entry.id !== result.id))
                  }
                >
                  <Trash2 />
                </button>
              </header>
              <div
                className={`training-set-table measure-${result.measureType}${tracksLoad ? "" : " no-load"}${tracksReps ? "" : " no-reps"}`}
              >
                <div className="training-set-head">
                  <span>Set</span>
                  {(result.measureType === "sets" || result.measureType === "mixed") && (
                    <>
                      {tracksLoad && (
                        <span>
                          {loadColumnLabel(resolvedLoadMode(result))} ({result.loadUnit})
                        </span>
                      )}
                      {tracksReps && <span>Reps</span>}
                    </>
                  )}
                  {(result.measureType === "duration" || result.measureType === "mixed") && (
                    <span>Minutes</span>
                  )}
                  {(result.measureType === "distance" || result.measureType === "mixed") && (
                    <span>Distance ({result.distanceUnit})</span>
                  )}
                  <span>Done</span>
                  <span />
                </div>
                {result.sets.map((set, setIndex) => (
                  <TrainingSetRow
                    key={set.id}
                    set={set}
                    index={setIndex}
                    result={result}
                    onChange={(changes) =>
                      updateResult(result.id, (current) => ({
                        ...current,
                        sets: current.sets.map((entry) =>
                          entry.id === set.id ? { ...entry, ...changes } : entry,
                        ),
                      }))
                    }
                    onRemove={() =>
                      updateResult(result.id, (current) => ({
                        ...current,
                        sets: current.sets.filter((entry) => entry.id !== set.id),
                      }))
                    }
                  />
                ))}
              </div>
              <footer>
                <button
                  className="link-button"
                  onClick={() =>
                    updateResult(result.id, (current) => ({
                      ...current,
                      sets: [
                        ...current.sets,
                        {
                          ...(current.sets.at(-1) ?? {}),
                          id: createId("training-set"),
                          completed: false,
                        },
                      ],
                    }))
                  }
                >
                  <Plus /> Add set
                </button>
                <input
                  aria-label={`${result.name} notes`}
                  placeholder="Exercise note…"
                  value={result.notes}
                  onChange={(event) =>
                    updateResult(result.id, (current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </footer>
            </article>
          );
        })}
      </div>
      <section className="training-add-exercise">
        {exercises.length ? (
          <div className="training-session-exercise-picker">
            <span className="training-search-input">
              <Search />
              <input
                aria-label="Search exercise to add"
                placeholder="Search an exercise…"
                value={exerciseQuery}
                autoComplete="off"
                onFocus={() => setExercisePickerOpen(true)}
                onChange={(event) => {
                  setExerciseQuery(event.target.value);
                  setExercisePickerOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && availableExercises.length === 1) {
                    event.preventDefault();
                    state.addExerciseToTrainingSession(session.id, availableExercises[0]!.id);
                    setExerciseQuery("");
                    setExercisePickerOpen(false);
                  }
                  if (event.key === "Escape") setExercisePickerOpen(false);
                }}
              />
            </span>
            {exercisePickerOpen && (
              <div className="training-session-exercise-results">
                {availableExercises.map((exercise) => (
                  <button
                    key={exercise.id}
                    aria-label={`Add ${exercise.name} to session`}
                    onClick={() => {
                      state.addExerciseToTrainingSession(session.id, exercise.id);
                      setExerciseQuery("");
                      setExercisePickerOpen(false);
                    }}
                  >
                    <span>
                      <strong>{exercise.name}</strong>
                      <small>
                        {exerciseTrackingLabel(exercise.measureType, resolvedLoadMode(exercise))}
                      </small>
                    </span>
                    <Plus />
                  </button>
                ))}
                {!availableExercises.length && (
                  <button onClick={onOpenLibrary}>
                    <span>
                      <strong>Create “{exerciseQuery.trim()}”</strong>
                      <small>Open the exercise library</small>
                    </span>
                    <Plus />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <button className="button" onClick={onOpenLibrary}>
            <Plus /> Create an exercise
          </button>
        )}
        <button
          className="button primary training-finish-button"
          disabled={!session.results.length}
          onClick={onFinish}
        >
          <Check /> Finish session
        </button>
      </section>
    </div>
  );
}

function TrainingSetRow({
  set,
  index,
  result,
  onChange,
  onRemove,
}: {
  set: TrainingSet;
  index: number;
  result: TrainingExerciseResult;
  onChange: (changes: Partial<TrainingSet>) => void;
  onRemove: () => void;
}) {
  return (
    <div className={`training-set-row ${set.completed ? "complete" : ""}`}>
      <strong>{index + 1}</strong>
      {(result.measureType === "sets" || result.measureType === "mixed") && (
        <>
          {exerciseTracksLoad(result) && (
            <NumberInput
              label={`Set ${index + 1} ${loadColumnLabel(resolvedLoadMode(result)).toLocaleLowerCase()}`}
              value={set.load}
              step={0.5}
              onChange={(load) => onChange({ load })}
            />
          )}
          {exerciseTracksRepetitions(result) && (
            <NumberInput
              label={`Set ${index + 1} repetitions`}
              value={set.reps}
              step={1}
              onChange={(reps) => onChange({ reps })}
            />
          )}
        </>
      )}
      {(result.measureType === "duration" || result.measureType === "mixed") && (
        <NumberInput
          label={`Set ${index + 1} minutes`}
          value={set.durationSeconds === undefined ? undefined : set.durationSeconds / 60}
          step={0.5}
          onChange={(minutes) =>
            onChange({
              durationSeconds: minutes === undefined ? undefined : Math.round(minutes * 60),
            })
          }
        />
      )}
      {(result.measureType === "distance" || result.measureType === "mixed") && (
        <NumberInput
          label={`Set ${index + 1} distance`}
          value={set.distance}
          step={0.1}
          onChange={(distance) => onChange({ distance })}
        />
      )}
      <button
        className={`training-set-check ${set.completed ? "complete" : ""}`}
        aria-label={`${set.completed ? "Mark incomplete" : "Mark complete"} set ${index + 1}`}
        aria-pressed={set.completed}
        onClick={() => onChange({ completed: !set.completed })}
      >
        <Check />
      </button>
      <button className="icon-button" aria-label={`Remove set ${index + 1}`} onClick={onRemove}>
        <X />
      </button>
    </div>
  );
}

function NumberInput({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number | undefined;
  step: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      min="0"
      step={step}
      inputMode="decimal"
      value={value ?? ""}
      onChange={(event) =>
        onChange(event.target.value === "" ? undefined : Number(event.target.value))
      }
    />
  );
}

function TrainingHistory({
  sessions,
  activities,
  onRepeat,
}: {
  sessions: TrainingSession[];
  activities: TrainingActivity[];
  onRepeat: (id: string) => void;
}) {
  const completed = sessions.filter((session) => session.status === "completed");
  if (!completed.length)
    return (
      <section className="training-section-empty">
        <History />
        <h2>Your history starts after the first session</h2>
        <p>Completed sessions, results and notes will stay available here.</p>
      </section>
    );
  return (
    <section className="training-history">
      <div className="training-section-heading">
        <div>
          <span className="eyebrow">Completed sessions</span>
          <h2>History</h2>
        </div>
        <strong>{completed.length} total</strong>
      </div>
      <div className="training-history-list">
        {completed.map((session) => {
          const activity = activities.find((entry) => entry.id === session.activityId);
          const distances = sessionDistance(session);
          return (
            <article key={session.id}>
              <div
                className="training-history-accent"
                style={{ background: activity?.color ?? "var(--accent)" }}
              />
              <header>
                <div>
                  <span className="eyebrow">{activity?.name ?? "Training"}</span>
                  <h3>{session.title}</h3>
                  <time>{format(new Date(session.startedAt), "PPPP · p")}</time>
                </div>
                <button className="button icon-text" onClick={() => onRepeat(session.id)}>
                  <Repeat2 /> Repeat
                </button>
              </header>
              <div className="training-history-stats">
                <span>
                  <strong>{session.results.length}</strong> exercises
                </span>
                <span>
                  <strong>{sessionDurationMinutes(session)}</strong> min
                </span>
                {sessionVolume(session) > 0 && (
                  <span>
                    <strong>{sessionVolume(session).toLocaleString()}</strong> volume
                  </span>
                )}
                {Object.entries(distances).map(([unit, value]) => (
                  <span key={unit}>
                    <strong>{value}</strong> {unit}
                  </span>
                ))}
              </div>
              <div className="training-history-results">
                {session.results.map((result) => (
                  <div key={result.id}>
                    <strong>{result.name}</strong>
                    <span>{formatExerciseResult(result)}</span>
                  </div>
                ))}
              </div>
              {session.notes && <p className="training-history-note">{session.notes}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TrainingProgress({
  exercises,
  sessions,
  activities,
}: {
  exercises: TrainingExercise[];
  sessions: TrainingSession[];
  activities: TrainingActivity[];
}) {
  const usedExercises = exercises.filter((exercise) =>
    sessions.some(
      (session) =>
        session.status === "completed" &&
        session.results.some((result) => result.exerciseId === exercise.id),
    ),
  );
  const [exerciseId, setExerciseId] = useState(usedExercises[0]?.id ?? "");
  const exercise = usedExercises.find((entry) => entry.id === exerciseId) ?? usedExercises[0];
  const exampleResult = sessions
    .flatMap((session) => session.results)
    .find((result) => result.exerciseId === exercise?.id);
  const progressLoadMode =
    exampleResult || exercise ? resolvedLoadMode((exampleResult ?? exercise)!) : "none";
  const metrics = availableProgressMetrics(exampleResult);
  const [requestedMetric, setRequestedMetric] = useState<TrainingProgressMetric>("volume");
  const metric = metrics.includes(requestedMetric) ? requestedMetric : metrics[0]!;
  const points = exercise ? exerciseProgress(sessions, exercise.id, metric) : [];
  const lowerIsBetter = metric === "load" && progressLoadMode === "assisted";
  const best = points.length
    ? lowerIsBetter
      ? Math.min(...points.map((point) => point.value))
      : Math.max(...points.map((point) => point.value))
    : 0;
  const latest = points.at(-1)?.value ?? 0;
  if (!usedExercises.length)
    return (
      <section className="training-section-empty">
        <LineChartIcon />
        <h2>Complete a session to unlock progress</h2>
        <p>Diorna will chart load, repetitions, volume, duration or distance automatically.</p>
      </section>
    );
  return (
    <section className="training-progress">
      <div className="training-section-heading">
        <div>
          <span className="eyebrow">Measured over time</span>
          <h2>Progress</h2>
        </div>
        <label>
          <span>Exercise</span>
          <select value={exercise?.id} onChange={(event) => setExerciseId(event.target.value)}>
            {usedExercises.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="training-metric-tabs">
        {metrics.map((entry) => (
          <button
            key={entry}
            className={metric === entry ? "active" : ""}
            onClick={() => setRequestedMetric(entry)}
          >
            {metricLabel(entry, progressLoadMode)}
          </button>
        ))}
      </div>
      <div className="training-progress-grid">
        <article className="training-progress-chart">
          <header>
            <div>
              <span className="eyebrow">
                {activities.find((activity) => activity.id === exercise?.activityId)?.name ??
                  "Training"}
              </span>
              <h3>
                {exercise?.name} · {metricLabel(metric, progressLoadMode)}
              </h3>
            </div>
            <span>{points.length} sessions</span>
          </header>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </article>
        <aside className="training-progress-summary">
          <span className="eyebrow">At a glance</span>
          <div>
            <strong>{latest}</strong>
            <span>Latest</span>
          </div>
          <div>
            <strong>{best}</strong>
            <span>Personal best</span>
          </div>
          <div>
            <strong>{points.length}</strong>
            <span>Recorded sessions</span>
          </div>
          {points.length > 1 && (
            <p
              className={
                lowerIsBetter
                  ? latest <= points[0]!.value
                    ? "positive"
                    : "negative"
                  : latest >= points[0]!.value
                    ? "positive"
                    : "negative"
              }
            >
              {lowerIsBetter
                ? latest <= points[0]!.value
                  ? "Using less assistance"
                  : "Using more assistance"
                : latest >= points[0]!.value
                  ? "Up"
                  : "Down"}{" "}
              {Math.round(Math.abs(latest - points[0]!.value) * 10) / 10} since the first record.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

function TrainingLibrary({
  activities,
  exercises,
  templates,
  initialActivityId,
}: {
  activities: TrainingActivity[];
  exercises: TrainingExercise[];
  templates: TrainingTemplate[];
  initialActivityId: string;
}) {
  const state = useDiornaStore();
  const [activityName, setActivityName] = useState("");
  const [activityKind, setActivityKind] = useState<TrainingActivityKind>("strength");
  const [activityColor, setActivityColor] = useState("#1D518A");
  const [trackDaily, setTrackDaily] = useState(true);
  const [exerciseActivityId, setExerciseActivityId] = useState(initialActivityId);
  const [exerciseName, setExerciseName] = useState("");
  const [measureType, setMeasureType] = useState<TrainingMeasureType>("sets");
  const [loadMode, setLoadMode] = useState<TrainingLoadMode>("external");
  const [loadUnit, setLoadUnit] = useState<TrainingExercise["loadUnit"]>("kg");
  const [distanceUnit, setDistanceUnit] = useState<TrainingExercise["distanceUnit"]>("km");
  const [templateActivityId, setTemplateActivityId] = useState(initialActivityId);
  const [templateName, setTemplateName] = useState("");
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [templateSetCounts, setTemplateSetCounts] = useState<Record<string, number>>({});
  const effectiveExerciseActivity = activities.some(
    (activity) => activity.id === exerciseActivityId,
  )
    ? exerciseActivityId
    : (activities[0]?.id ?? "");
  const effectiveTemplateActivity = activities.some(
    (activity) => activity.id === templateActivityId,
  )
    ? templateActivityId
    : (activities[0]?.id ?? "");
  const templateExercises = exercises.filter(
    (exercise) => exercise.activityId === effectiveTemplateActivity,
  );
  const effectiveExerciseActivityRecord = activities.find(
    (activity) => activity.id === effectiveExerciseActivity,
  );
  const exerciseNamesForActivity = exercises
    .filter((exercise) => exercise.activityId === effectiveExerciseActivity)
    .map((exercise) => exercise.name);
  const catalogSuggestions = searchTrainingExerciseCatalog(
    exerciseName,
    effectiveExerciseActivityRecord?.kind ?? "custom",
    exerciseNamesForActivity,
  );
  const exactCatalogMatch = findCatalogExercise(exerciseName);
  const applicableCatalogMatch =
    exactCatalogMatch &&
    (effectiveExerciseActivityRecord?.kind === "custom" ||
      exactCatalogMatch.activityKinds.includes(effectiveExerciseActivityRecord?.kind ?? "custom"))
      ? exactCatalogMatch
      : undefined;
  const requestedExerciseName = applicableCatalogMatch?.name ?? exerciseName.trim();
  const requestedExerciseExists = exerciseNamesForActivity.some(
    (name) => normalizeExerciseName(name) === normalizeExerciseName(requestedExerciseName),
  );
  const createExercise = (catalogEntry?: TrainingExerciseCatalogEntry) => {
    if (!effectiveExerciseActivity) return;
    const name = (catalogEntry?.name ?? exerciseName).trim();
    if (
      !name ||
      exerciseNamesForActivity.some(
        (existingName) => normalizeExerciseName(existingName) === normalizeExerciseName(name),
      )
    )
      return;
    state.addTrainingExercise({
      activityId: effectiveExerciseActivity,
      name,
      measureType: catalogEntry?.measureType ?? measureType,
      loadMode: catalogEntry?.loadMode ?? loadMode,
      loadUnit,
      distanceUnit,
    });
    setExerciseName("");
  };
  return (
    <section className="training-library">
      <div className="training-section-heading">
        <div>
          <span className="eyebrow">Make Training yours</span>
          <h2>Activity library</h2>
        </div>
        <p>Activities contain exercises. Templates turn those exercises into reusable sessions.</p>
      </div>
      <div className="training-library-grid">
        <article className="training-library-panel">
          <header>
            <div className="library-step">1</div>
            <div>
              <h3>Activities</h3>
              <p>A sport or training discipline.</p>
            </div>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!activityName.trim()) return;
              const created = state.addTrainingActivity({
                name: activityName,
                kind: activityKind,
                color: activityColor,
                trackInDaily: trackDaily,
              });
              setExerciseActivityId(created.id);
              setTemplateActivityId(created.id);
              setActivityName("");
            }}
          >
            <input
              aria-label="Activity name"
              placeholder="e.g. Climbing"
              value={activityName}
              onChange={(event) => setActivityName(event.target.value)}
            />
            <select
              aria-label="Activity type"
              value={activityKind}
              onChange={(event) => {
                const kind = event.target.value as TrainingActivityKind;
                setActivityKind(kind);
                setActivityColor(
                  activityKinds.find((entry) => entry.kind === kind)?.color ?? "#1D518A",
                );
              }}
            >
              {activityKinds.map((kind) => (
                <option key={kind.kind} value={kind.kind}>
                  {kind.label}
                </option>
              ))}
            </select>
            <label className="training-color-field">
              <span>Activity color</span>
              <input
                type="color"
                aria-label="Activity color"
                value={activityColor}
                onChange={(event) => setActivityColor(event.target.value)}
              />
            </label>
            <label className="training-check-label">
              <input
                type="checkbox"
                checked={trackDaily}
                onChange={(event) => setTrackDaily(event.target.checked)}
              />
              Track completed minutes in Daily
            </label>
            <button className="button primary">Create activity</button>
          </form>
          <div className="training-library-list">
            {activities.map((activity) => (
              <div key={activity.id}>
                <i style={{ background: activity.color }} />
                <span>
                  <strong>{activity.name}</strong>
                  <small>
                    {activity.kind} ·{" "}
                    {exercises.filter((exercise) => exercise.activityId === activity.id).length}{" "}
                    exercises
                  </small>
                </span>
                <button
                  className="icon-button"
                  aria-label={`Archive ${activity.name}`}
                  onClick={() => state.updateTrainingActivity(activity.id, { archived: true })}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        </article>
        <article className="training-library-panel">
          <header>
            <div className="library-step">2</div>
            <div>
              <h3>Exercises</h3>
              <p>Anything you measure repeatedly.</p>
            </div>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createExercise(applicableCatalogMatch);
            }}
          >
            <select
              aria-label="Exercise activity"
              value={effectiveExerciseActivity}
              onChange={(event) => setExerciseActivityId(event.target.value)}
            >
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
            <label className="training-exercise-search">
              <span>Search or create an exercise</span>
              <span className="training-search-input">
                <Search />
                <input
                  aria-label="Search or create exercise"
                  placeholder="Start typing: leg, pull-up, curl…"
                  value={exerciseName}
                  autoComplete="off"
                  onChange={(event) => setExerciseName(event.target.value)}
                />
              </span>
            </label>
            <div className="training-catalog-suggestions" aria-label="Exercise suggestions">
              <header>
                <span>{exerciseName.trim() ? "Matching exercises" : "Popular exercises"}</span>
                <small>{TRAINING_EXERCISE_CATALOG.length}+ in the built-in catalogue</small>
              </header>
              {catalogSuggestions.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  aria-label={`Add ${entry.name}`}
                  onClick={() => createExercise(entry)}
                >
                  <span>
                    <strong>{entry.name}</strong>
                    <small>
                      {entry.category} · {exerciseTrackingLabel(entry.measureType, entry.loadMode)}
                    </small>
                  </span>
                  <Plus />
                </button>
              ))}
              {!catalogSuggestions.length && exerciseName.trim() && (
                <p>No catalogue match. You can still create it below.</p>
              )}
            </div>
            <label>
              <span>What do you want to record?</span>
              <select
                aria-label="Exercise measurement"
                value={measureType}
                onChange={(event) => {
                  const next = event.target.value as TrainingMeasureType;
                  setMeasureType(next);
                  if (next === "sets" || next === "mixed") {
                    if (loadMode === "none") setLoadMode("external");
                  } else setLoadMode("none");
                }}
              >
                <option value="sets">Sets and repetitions</option>
                <option value="duration">Duration</option>
                <option value="distance">Distance</option>
                <option value="mixed">Mixed measurements</option>
              </select>
            </label>
            {(measureType === "sets" || measureType === "mixed") && (
              <label>
                <span>Weight tracking</span>
                <select
                  aria-label="Weight tracking"
                  value={loadMode}
                  onChange={(event) => setLoadMode(event.target.value as TrainingLoadMode)}
                >
                  <option value="external">External load + repetitions</option>
                  <option value="bodyweight">Bodyweight · repetitions only</option>
                  <option value="bodyweight-plus">Bodyweight · optional added load</option>
                  <option value="assisted">Assistance load + repetitions</option>
                </select>
              </label>
            )}
            {exerciseTracksLoad({ measureType, loadMode }) && (
              <label>
                <span>Load unit</span>
                <select
                  aria-label="Load unit"
                  value={loadUnit}
                  onChange={(event) =>
                    setLoadUnit(event.target.value as TrainingExercise["loadUnit"])
                  }
                >
                  <option value="kg">Kilograms</option>
                  <option value="lb">Pounds</option>
                </select>
              </label>
            )}
            {(measureType === "distance" || measureType === "mixed") && (
              <label>
                <span>Distance unit</span>
                <select
                  aria-label="Distance unit"
                  value={distanceUnit}
                  onChange={(event) =>
                    setDistanceUnit(event.target.value as TrainingExercise["distanceUnit"])
                  }
                >
                  <option value="m">Metres</option>
                  <option value="km">Kilometres</option>
                  <option value="mi">Miles</option>
                </select>
              </label>
            )}
            <button
              className="button primary"
              disabled={!activities.length || !exerciseName.trim() || requestedExerciseExists}
            >
              {requestedExerciseExists
                ? "Already added"
                : applicableCatalogMatch
                  ? `Add ${applicableCatalogMatch.name}`
                  : exerciseName.trim()
                    ? `Create “${exerciseName.trim()}”`
                    : "Create custom exercise"}
            </button>
          </form>
          <div className="training-library-list">
            {exercises.map((exercise) => (
              <div key={exercise.id}>
                <Dumbbell />
                <span>
                  <strong>{exercise.name}</strong>
                  <small>
                    {activities.find((activity) => activity.id === exercise.activityId)?.name} ·{" "}
                    {exerciseTrackingLabel(exercise.measureType, resolvedLoadMode(exercise))}
                  </small>
                </span>
                {(exercise.measureType === "sets" || exercise.measureType === "mixed") && (
                  <select
                    className="training-exercise-tracking-select"
                    aria-label={`Weight tracking for ${exercise.name}`}
                    value={resolvedLoadMode(exercise)}
                    onChange={(event) =>
                      state.updateTrainingExercise(exercise.id, {
                        loadMode: event.target.value as TrainingLoadMode,
                      })
                    }
                  >
                    <option value="external">Load</option>
                    <option value="bodyweight">Bodyweight</option>
                    <option value="bodyweight-plus">Bodyweight + load</option>
                    <option value="assisted">Assisted</option>
                  </select>
                )}
                <button
                  className="icon-button"
                  aria-label={`Archive ${exercise.name}`}
                  onClick={() => state.updateTrainingExercise(exercise.id, { archived: true })}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        </article>
        <article className="training-library-panel training-template-builder">
          <header>
            <div className="library-step">3</div>
            <div>
              <h3>Templates</h3>
              <p>A reusable exercise order and set count.</p>
            </div>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const chosen = templateExercises.filter((exercise) =>
                selectedExercises.includes(exercise.id),
              );
              if (!templateName.trim() || !chosen.length) return;
              state.addTrainingTemplate({
                activityId: effectiveTemplateActivity,
                name: templateName,
                exercises: chosen.map((exercise) =>
                  templateExercise(exercise, templateSetCounts[exercise.id]),
                ),
              });
              setTemplateName("");
              setSelectedExercises([]);
              setTemplateSetCounts({});
            }}
          >
            <select
              aria-label="Template activity"
              value={effectiveTemplateActivity}
              onChange={(event) => {
                setTemplateActivityId(event.target.value);
                setSelectedExercises([]);
                setTemplateSetCounts({});
              }}
            >
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Template name"
              placeholder="e.g. Leg day"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
            <div className="training-template-checklist">
              {templateExercises.map((exercise) => (
                <label key={exercise.id}>
                  <input
                    type="checkbox"
                    checked={selectedExercises.includes(exercise.id)}
                    onChange={(event) =>
                      setSelectedExercises((current) =>
                        event.target.checked
                          ? [...current, exercise.id]
                          : current.filter((id) => id !== exercise.id),
                      )
                    }
                  />
                  <span>{exercise.name}</span>
                  {selectedExercises.includes(exercise.id) ? (
                    <input
                      type="number"
                      min="1"
                      max="20"
                      aria-label={`${exercise.name} planned sets`}
                      value={
                        templateSetCounts[exercise.id] ?? (exercise.measureType === "sets" ? 3 : 1)
                      }
                      onChange={(event) =>
                        setTemplateSetCounts((current) => ({
                          ...current,
                          [exercise.id]: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                    />
                  ) : (
                    <small>{measureLabel(exercise.measureType)}</small>
                  )}
                </label>
              ))}
              {!templateExercises.length && <p>Create exercises for this activity first.</p>}
            </div>
            <button className="button primary" disabled={!selectedExercises.length}>
              <Save /> Save template
            </button>
          </form>
          <div className="training-library-list">
            {templates.map((template) => (
              <div key={template.id}>
                <Repeat2 />
                <span>
                  <strong>{template.name}</strong>
                  <small>{template.exercises.map((exercise) => exercise.name).join(" · ")}</small>
                </span>
                <button
                  className="icon-button"
                  aria-label={`Archive ${template.name}`}
                  onClick={() => state.updateTrainingTemplate(template.id, { archived: true })}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function TrainingImportDialog({
  activities,
  onClose,
  onImported,
}: {
  activities: TrainingActivity[];
  onClose: () => void;
  onImported: () => void;
}) {
  const state = useDiornaStore();
  const notes = selectWorkspace(state.notes, state.activeWorkspaceId)
    .filter((note) => !note.trashedAt)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const [noteId, setNoteId] = useState(notes[0]?.id ?? "");
  const [activityId, setActivityId] = useState(activities[0]?.id ?? "");
  const note = notes.find((entry) => entry.id === noteId);
  const preview = useMemo(() => (note ? parseTrainingNote(note) : []), [note]);
  return (
    <div className="modal-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="training-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Import training note"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">Optional migration</span>
            <h2>Import an old training note</h2>
          </div>
          <button className="icon-button" aria-label="Close import" onClick={onClose}>
            <X />
          </button>
        </header>
        <p>
          Diorna looks for dates and familiar forms such as “Leg curl 3×20 @ 25 kg”, “Running 5 km”
          or “Mobility 20 min”. Review the preview before importing.
        </p>
        <div className="training-dialog-fields">
          <label>
            <span>Note</span>
            <select value={noteId} onChange={(event) => setNoteId(event.target.value)}>
              {notes.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Activity</span>
            <select value={activityId} onChange={(event) => setActivityId(event.target.value)}>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="training-import-preview">
          <strong>
            Preview · {preview.length} session{preview.length === 1 ? "" : "s"}
          </strong>
          {preview.map((session) => (
            <article key={`${session.date}-${session.title}`}>
              <time>{session.date}</time>
              <div>
                {session.exercises.map((exercise, index) => (
                  <span key={`${exercise.name}-${index}`}>
                    <strong>{exercise.name}</strong> · {exercise.sets.length} record
                    {exercise.sets.length === 1 ? "" : "s"}
                  </span>
                ))}
              </div>
            </article>
          ))}
          {!preview.length && (
            <p>No recognizable training lines were found. The note will not be changed.</p>
          )}
        </div>
        <footer>
          <button className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={!note || !activityId || !preview.length}
            onClick={() => {
              if (!note) return;
              const count = state.importTrainingSessions(activityId, note.id, preview);
              if (count) onImported();
            }}
          >
            <FileInput /> Import {preview.length || ""}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ScheduleTrainingDialog({
  template,
  activity,
  onClose,
}: {
  template: TrainingTemplate;
  activity: TrainingActivity | undefined;
  onClose: () => void;
}) {
  const state = useDiornaStore();
  const initial = new Date(Date.now() + 86_400_000);
  initial.setHours(18, 0, 0, 0);
  const [start, setStart] = useState(localDateTime(initial));
  return (
    <div className="modal-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="training-dialog training-schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Schedule training"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">Calendar connection</span>
            <h2>Schedule {template.name}</h2>
          </div>
          <button className="icon-button" aria-label="Close schedule" onClick={onClose}>
            <X />
          </button>
        </header>
        <label>
          <span>Date and time</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <p>
          The Calendar event will include a Start training action and remain linked to the session.
        </p>
        <footer>
          <button className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => {
              const category = state.categories.find(
                (entry) => entry.workspaceId === state.activeWorkspaceId,
              );
              if (!category) return;
              const startAt = new Date(start).toISOString();
              state.addItem({
                kind: "event",
                title: `Training · ${template.name}`,
                description: `${activity?.name ?? "Training"} session created from ${template.name}.`,
                categoryId: category.id,
                startAt,
                endAt: new Date(new Date(startAt).getTime() + 60 * 60_000).toISOString(),
                allDay: false,
                priority: "none",
                subtasks: [],
                rruleExceptions: [],
                reminders: [10],
                trainingTemplateId: template.id,
              });
              window.dispatchEvent(
                new CustomEvent("diorna-toast", { detail: `${template.name} added to Calendar` }),
              );
              onClose();
            }}
          >
            <CalendarPlus /> Add to Calendar
          </button>
        </footer>
      </section>
    </div>
  );
}

function seedActivity(activity: TrainingActivity) {
  const presets: Partial<Record<TrainingActivityKind, string[]>> = {
    strength: [
      "Back squat",
      "Bench press",
      "Deadlift",
      "Romanian deadlift",
      "Leg press",
      "Leg curl",
      "Leg extension",
      "Hip thrust",
      "Overhead press",
      "Pull-up",
      "Dips",
      "Lat pulldown",
      "Seated cable row",
      "Biceps curl",
      "Triceps pushdown",
      "Plank",
    ],
    running: ["Easy run", "Long run", "Tempo run", "Interval run", "Sprint"],
    cycling: ["Outdoor ride", "Indoor cycling", "Cycling intervals"],
    swimming: ["Freestyle swim", "Breaststroke", "Backstroke", "Swimming intervals"],
    team: ["Match", "Team training", "Technical drills"],
    mobility: ["Warm-up", "Mobility session", "Full-body stretching", "Yoga", "Foam rolling"],
  };
  presets[activity.kind]?.forEach((name) => {
    const catalogEntry = findCatalogExercise(name);
    if (!catalogEntry) return;
    useDiornaStore.getState().addTrainingExercise({
      activityId: activity.id,
      name: catalogEntry.name,
      measureType: catalogEntry.measureType,
      loadMode: catalogEntry.loadMode,
    });
  });
}

function templateExercise(
  exercise: TrainingExercise,
  requestedSets?: number,
): TrainingTemplateExercise {
  return {
    id: createId("training-template-exercise"),
    exerciseId: exercise.id,
    name: exercise.name,
    measureType: exercise.measureType,
    ...(exercise.loadMode ? { loadMode: exercise.loadMode } : {}),
    loadUnit: exercise.loadUnit,
    distanceUnit: exercise.distanceUnit,
    plannedSets: requestedSets ?? (exercise.measureType === "sets" ? 3 : 1),
  };
}

function measureLabel(type: TrainingMeasureType): string {
  return (
    {
      sets: "load + reps",
      duration: "duration",
      distance: "distance",
      mixed: "mixed",
    } as const
  )[type];
}

function resolvedLoadMode(
  exercise: Pick<TrainingExercise, "measureType" | "loadMode">,
): TrainingLoadMode {
  return (
    exercise.loadMode ??
    (exercise.measureType === "sets" || exercise.measureType === "mixed" ? "external" : "none")
  );
}

function exerciseTracksLoad(exercise: Pick<TrainingExercise, "measureType" | "loadMode">): boolean {
  const mode = resolvedLoadMode(exercise);
  return (
    (exercise.measureType === "sets" || exercise.measureType === "mixed") &&
    mode !== "bodyweight" &&
    mode !== "none"
  );
}

function exerciseTracksRepetitions(
  exercise: Pick<TrainingExercise, "measureType" | "loadMode">,
): boolean {
  return (
    exercise.measureType === "sets" ||
    (exercise.measureType === "mixed" && resolvedLoadMode(exercise) !== "none")
  );
}

function loadColumnLabel(mode: TrainingLoadMode): string {
  if (mode === "bodyweight-plus") return "Added load";
  if (mode === "assisted") return "Assistance";
  return "Load";
}

function exerciseTrackingLabel(
  measureType: TrainingMeasureType,
  loadMode: TrainingLoadMode,
): string {
  if (measureType === "duration") return "duration";
  if (measureType === "distance") return "distance";
  if (measureType === "mixed" && loadMode === "none") return "distance + duration";
  return (
    {
      external: "load + repetitions",
      bodyweight: "bodyweight repetitions",
      "bodyweight-plus": "bodyweight + optional load",
      assisted: "assistance + repetitions",
      none: "repetitions",
    } as const
  )[loadMode];
}

function metricLabel(metric: TrainingProgressMetric, loadMode?: TrainingLoadMode): string {
  return (
    {
      load: loadMode === "assisted" ? "Minimum assistance" : "Max load",
      reps: "Max reps",
      volume: "Volume",
      duration: "Duration",
      distance: "Distance",
    } as const
  )[metric];
}

function localDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
