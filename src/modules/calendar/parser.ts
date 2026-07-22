import { addDays, addMinutes, formatISO, nextDay, parse, set, startOfDay } from "date-fns";
import type { Priority } from "@/shared/models";

export interface ParsedQuickItem {
  title: string;
  startAt: string;
  endAt: string;
  category?: string;
  priority: Priority;
  recurrence?: string;
  tokens: Array<{
    text: string;
    kind: "date" | "time" | "duration" | "category" | "priority" | "recurrence";
  }>;
}

const weekdays: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function parseQuickItem(input: string, now = new Date()): ParsedQuickItem {
  let work = input.trim();
  const tokens: ParsedQuickItem["tokens"] = [];
  let date = startOfDay(now);
  let durationMinutes = 60;
  let priority: Priority = "none";
  let category: string | undefined;
  let recurrence: string | undefined;

  const consume = (
    regex: RegExp,
    kind: ParsedQuickItem["tokens"][number]["kind"],
    handler: (match: RegExpMatchArray) => void,
  ) => {
    const match = work.match(regex);
    if (!match) return;
    tokens.push({ text: match[0], kind });
    handler(match);
    work = work.replace(match[0], " ").replace(/\s+/g, " ").trim();
  };

  consume(/\bfor\s+(?:(\d+)h(?:(\d+)(?:m|min)?)?|(\d+)(?:m|min))\b/i, "duration", (match) => {
    durationMinutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? match[3] ?? 0);
  });
  consume(/#([\p{L}\d_-]+)/u, "category", (match) => {
    category = match[1];
  });
  consume(/!(low|medium|high)\b/i, "priority", (match) => {
    priority = match[1]!.toLowerCase() as Priority;
  });
  consume(
    /\bevery\s+(day|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    "recurrence",
    (match) => {
      const value = match[1]!.toLowerCase();
      recurrence =
        value === "day"
          ? "FREQ=DAILY"
          : value === "weekday"
            ? "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
            : `FREQ=WEEKLY;BYDAY=${value.slice(0, 2).toUpperCase()}`;
    },
  );

  consume(
    /\b(today|tomorrow|in\s+\d+\s+days?|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
    "date",
    (match) => {
      const value = match[1]!.toLowerCase();
      if (value === "tomorrow") date = addDays(startOfDay(now), 1);
      else if (value.startsWith("in "))
        date = addDays(startOfDay(now), Number(value.match(/\d+/)?.[0] ?? 0));
      else if (value.startsWith("next "))
        date = nextDay(startOfDay(now), weekdays[value.slice(5)] as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    },
  );
  consume(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\b/, "date", (match) => {
    const value = match[1]!;
    date = value.includes("-")
      ? new Date(`${value}T00:00:00`)
      : parse(value, value.includes("/") ? "d/M/yyyy" : "d.M.yyyy", now);
  });

  let startHour = 9;
  let startMinute = 0;
  let explicitEnd: { hour: number; minute: number } | undefined;
  consume(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?\b/i,
    "time",
    (match) => {
      const convert = (hour: number, marker?: string) =>
        marker?.toLowerCase() === "pm" && hour < 12
          ? hour + 12
          : marker?.toLowerCase() === "am" && hour === 12
            ? 0
            : hour;
      const marker = match[3] ?? match[6];
      startHour = convert(Number(match[1]), marker);
      startMinute = Number(match[2] ?? 0);
      if (match[4])
        explicitEnd = {
          hour: convert(Number(match[4]), match[6] ?? marker),
          minute: Number(match[5] ?? 0),
        };
    },
  );

  const start = set(date, {
    hours: startHour,
    minutes: startMinute,
    seconds: 0,
    milliseconds: 0,
  });
  const end = explicitEnd
    ? set(date, {
        hours: explicitEnd.hour,
        minutes: explicitEnd.minute,
        seconds: 0,
        milliseconds: 0,
      })
    : addMinutes(start, durationMinutes);
  const result: ParsedQuickItem = {
    title: work || "Untitled",
    startAt: formatISO(start),
    endAt: formatISO(end),
    priority,
    tokens,
  };
  if (category) result.category = category;
  if (recurrence) result.recurrence = recurrence;
  return result;
}
