import type { Note, TrainingImportSession, TrainingSet } from "@/shared/models";

export function parseTrainingNote(note: Note): TrainingImportSession[] {
  const fallbackDate = note.updatedAt.slice(0, 10);
  const lines = noteText(note.body)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const sessions: TrainingImportSession[] = [];
  let current = createImportSession(fallbackDate, note.title);
  for (const line of lines) {
    const date = parseDateLine(line);
    if (date) {
      if (current.exercises.length) sessions.push(current);
      current = createImportSession(date, `${note.title} · ${date}`);
      continue;
    }
    const parsed = parseExerciseLine(line);
    if (parsed) current.exercises.push(parsed);
  }
  if (current.exercises.length) sessions.push(current);
  return sessions;
}

function createImportSession(date: string, title: string): TrainingImportSession {
  return { date, title, exercises: [] };
}

function parseExerciseLine(line: string): TrainingImportSession["exercises"][number] | undefined {
  const strength =
    /^[-*•]?\s*(.+?)\s*[:—-]?\s+(\d+)\s*[x×]\s*(\d+)(?:\s*reps?)?(?:\s*(?:@|à|at)\s*(\d+(?:[.,]\d+)?)\s*(kg|lb))?\s*$/i.exec(
      line,
    );
  if (strength) {
    const setCount = Number(strength[2]);
    const reps = Number(strength[3]);
    const load = optionalNumber(strength[4]);
    return {
      name: cleanExerciseName(strength[1]!),
      measureType: "sets",
      sets: Array.from({ length: setCount }, () =>
        importSet({ reps, ...(load === undefined ? {} : { load }) }),
      ),
    };
  }
  const loadedSets =
    /^[-*•]?\s*(.+?)\s*[:—-]?\s+(\d+(?:[.,]\d+)?)\s*(kg|lb)\s*[x×]\s*(\d+)(?:\s*sets?)?\s*$/i.exec(
      line,
    );
  if (loadedSets) {
    const load = Number(loadedSets[2]!.replace(",", "."));
    return {
      name: cleanExerciseName(loadedSets[1]!),
      measureType: "sets",
      sets: Array.from({ length: Number(loadedSets[4]) }, () => importSet({ load })),
    };
  }
  const distance =
    /^[-*•]?\s*(.+?)\s*[:—-]?\s+(\d+(?:[.,]\d+)?)\s*(km|mi|m)(?:\s+(?:in|en)\s+(\d+(?:[.,]\d+)?)\s*(min|minutes?|h|hours?|heures?))?\s*$/i.exec(
      line,
    );
  if (distance) {
    const durationSeconds = durationToSeconds(optionalNumber(distance[4]), distance[5]);
    return {
      name: cleanExerciseName(distance[1]!),
      measureType: distance[4] ? "mixed" : "distance",
      sets: [
        importSet({
          distance: Number(distance[2]!.replace(",", ".")),
          ...(durationSeconds === undefined ? {} : { durationSeconds }),
        }),
      ],
    };
  }
  const duration =
    /^[-*•]?\s*(.+?)\s*[:—-]?\s+(\d+(?:[.,]\d+)?)\s*(min|minutes?|h|hours?|heures?)\s*$/i.exec(
      line,
    );
  if (duration) {
    return {
      name: cleanExerciseName(duration[1]!),
      measureType: "duration",
      sets: [
        importSet({
          durationSeconds: durationToSeconds(Number(duration[2]!.replace(",", ".")), duration[3])!,
        }),
      ],
    };
  }
  return undefined;
}

function importSet(values: Omit<TrainingSet, "id" | "completed">): Omit<TrainingSet, "id"> {
  return { ...values, completed: true };
}

function parseDateLine(line: string): string | undefined {
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(line);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const european = /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/.exec(line);
  if (european) return validDate(Number(european[3]), Number(european[2]), Number(european[1]));
  return undefined;
}

function validDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function noteText(value: string): string {
  return value
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&times;/gi, "×")
    .replace(/&amp;/gi, "&");
}

function cleanExerciseName(value: string): string {
  return value
    .replace(/^#+\s*/, "")
    .replace(/[:—-]+$/, "")
    .trim();
}

function optionalNumber(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value.replace(",", "."));
}

function durationToSeconds(
  value: number | undefined,
  unit: string | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  return Math.round(value * (unit?.toLocaleLowerCase().startsWith("h") ? 3600 : 60));
}
