import { createId } from "@/shared/id";
import type {
  TrainingExerciseResult,
  TrainingSession,
  TrainingSet,
  TrainingTemplate,
} from "@/shared/models";

export type TrainingProgressMetric = "load" | "reps" | "volume" | "duration" | "distance";

export interface TrainingProgressPoint {
  date: string;
  sessionId: string;
  value: number;
}

export function resultsFromTemplate(template: TrainingTemplate): TrainingExerciseResult[] {
  return template.exercises.map((exercise) => ({
    id: createId("training-result"),
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    measureType: exercise.measureType,
    ...(exercise.loadMode ? { loadMode: exercise.loadMode } : {}),
    loadUnit: exercise.loadUnit,
    distanceUnit: exercise.distanceUnit,
    notes: "",
    sets: Array.from({ length: Math.max(1, exercise.plannedSets) }, () => ({
      id: createId("training-set"),
      ...(exercise.defaultReps === undefined ? {} : { reps: exercise.defaultReps }),
      ...(exercise.defaultLoad === undefined ? {} : { load: exercise.defaultLoad }),
      ...(exercise.defaultDurationSeconds === undefined
        ? {}
        : { durationSeconds: exercise.defaultDurationSeconds }),
      ...(exercise.defaultDistance === undefined ? {} : { distance: exercise.defaultDistance }),
      completed: false,
    })),
  }));
}

export function repeatSessionResults(session: TrainingSession): TrainingExerciseResult[] {
  return session.results.map((result) => ({
    ...result,
    id: createId("training-result"),
    notes: "",
    sets: result.sets.map((set) => ({
      ...set,
      id: createId("training-set"),
      completed: false,
    })),
  }));
}

export function sessionDurationMinutes(session: TrainingSession): number {
  if (!session.endedAt) return 0;
  return Math.max(
    1,
    Math.round(
      (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
    ),
  );
}

export function setVolume(set: TrainingSet): number {
  return (set.load ?? 0) * (set.reps ?? 0);
}

export function sessionVolume(session: TrainingSession): number {
  return round(
    session.results.reduce(
      (total, result) =>
        total +
        (result.loadMode === "assisted"
          ? 0
          : result.sets
              .filter((set) => set.completed)
              .reduce((sum, set) => sum + setVolume(set), 0)),
      0,
    ),
  );
}

export function sessionDistance(session: TrainingSession): Record<string, number> {
  const values: Record<string, number> = {};
  session.results.forEach((result) => {
    const distance = result.sets
      .filter((set) => set.completed)
      .reduce((sum, set) => sum + (set.distance ?? 0), 0);
    if (distance)
      values[result.distanceUnit] = round((values[result.distanceUnit] ?? 0) + distance);
  });
  return values;
}

export function exerciseProgress(
  sessions: TrainingSession[],
  exerciseId: string,
  metric: TrainingProgressMetric,
): TrainingProgressPoint[] {
  return sessions
    .filter((session) => session.status === "completed")
    .flatMap((session) => {
      const result = session.results.find((entry) => entry.exerciseId === exerciseId);
      if (!result) return [];
      const sets = result.sets.filter((set) => set.completed);
      const values =
        metric === "load"
          ? sets.map((set) => set.load ?? 0)
          : metric === "reps"
            ? sets.map((set) => set.reps ?? 0)
            : metric === "volume"
              ? [sets.reduce((sum, set) => sum + setVolume(set), 0)]
              : metric === "duration"
                ? [sets.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0) / 60]
                : [sets.reduce((sum, set) => sum + (set.distance ?? 0), 0)];
      const value =
        metric === "load" || metric === "reps" ? Math.max(0, ...values) : (values[0] ?? 0);
      return value > 0
        ? [
            {
              date: session.startedAt.slice(0, 10),
              sessionId: session.id,
              value: round(value),
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.sessionId.localeCompare(right.sessionId),
    );
}

export function previousExerciseResult(
  sessions: TrainingSession[],
  exerciseId: string,
  before: string,
): TrainingExerciseResult | undefined {
  return sessions
    .filter(
      (session) =>
        session.status === "completed" &&
        session.startedAt < before &&
        session.results.some((result) => result.exerciseId === exerciseId),
    )
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0]
    ?.results.find((result) => result.exerciseId === exerciseId);
}

export function formatExerciseResult(result: TrainingExerciseResult | undefined): string {
  if (!result) return "No previous result";
  const completed = result.sets.filter((set) => set.completed);
  if (!completed.length) return "No completed sets";
  return completed
    .map((set) => {
      const tracksLoad =
        result.loadMode !== "bodyweight" && result.loadMode !== "none" && set.load !== undefined;
      const strength =
        set.reps !== undefined
          ? tracksLoad
            ? `${set.load} ${result.loadUnit} × ${set.reps}`
            : `${set.reps} reps`
          : "";
      const duration = set.durationSeconds
        ? `${Math.round((set.durationSeconds / 60) * 10) / 10} min`
        : "";
      const distance = set.distance === undefined ? "" : `${set.distance} ${result.distanceUnit}`;
      return [strength, duration, distance].filter(Boolean).join(" · ");
    })
    .join(" / ");
}

export function availableProgressMetrics(
  result:
    | (Pick<TrainingExerciseResult, "measureType"> &
        Partial<Pick<TrainingExerciseResult, "loadMode" | "sets">>)
    | undefined,
): TrainingProgressMetric[] {
  if (!result) return ["volume"];
  if (result.measureType === "sets")
    return result.loadMode === "bodyweight" || result.loadMode === "none"
      ? ["reps"]
      : result.loadMode === "assisted"
        ? ["load", "reps"]
        : ["load", "reps", "volume"];
  if (result.measureType === "duration") return ["duration"];
  if (result.measureType === "distance") return ["distance", "duration"];
  const sets = result.sets ?? [];
  const measured: TrainingProgressMetric[] = [];
  if (sets.some((set) => set.load !== undefined)) measured.push("load");
  if (sets.some((set) => set.reps !== undefined)) measured.push("reps");
  if (sets.some((set) => set.load !== undefined && set.reps !== undefined)) measured.push("volume");
  if (sets.some((set) => set.durationSeconds !== undefined)) measured.push("duration");
  if (sets.some((set) => set.distance !== undefined)) measured.push("distance");
  return measured.length ? measured : ["duration", "distance", "load", "reps", "volume"];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
