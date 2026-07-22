import { subSeconds } from "date-fns";
import type { CalendarItem } from "@/shared/models";
import { occurrencesBetween } from "./recurrence";

type ItemInput = Omit<CalendarItem, "id" | "workspaceId" | "createdAt" | "updatedAt">;

export type ItemDraft = Omit<
  ItemInput,
  "startAt" | "endAt" | "dueAt" | "completedAt" | "noteId" | "courseId" | "rrule" | "trashedAt"
> & {
  startAt?: string | undefined;
  endAt?: string | undefined;
  dueAt?: string | undefined;
  completedAt?: string | undefined;
  noteId?: string | undefined;
  courseId?: string | undefined;
  rrule?: string | undefined;
  trashedAt?: string | undefined;
};

export function splitRule(rule: string, occurrenceStart: string, base: CalendarItem) {
  const prefix = rule.startsWith("RRULE:") ? "RRULE:" : "";
  const parts = rule.replace(/^RRULE:/, "").split(";");
  const clean = parts.filter((part) => !part.startsWith("COUNT=") && !part.startsWith("UNTIL="));
  const originalUntil = parts.find((part) => part.startsWith("UNTIL="));
  const originalCount = Number(parts.find((part) => part.startsWith("COUNT="))?.slice(6));
  const anchor = new Date(base.startAt ?? base.dueAt ?? occurrenceStart);
  const before = occurrencesBetween(
    base,
    subSeconds(anchor, 1),
    subSeconds(new Date(occurrenceStart), 1),
  ).length;
  const followingEnd = Number.isFinite(originalCount)
    ? `COUNT=${Math.max(1, originalCount - before)}`
    : originalUntil;
  const until = subSeconds(new Date(occurrenceStart), 1)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return {
    previous: `${prefix}${[...clean, `UNTIL=${until}`].join(";")}`,
    following: `${prefix}${[...clean, ...(followingEnd ? [followingEnd] : [])].join(";")}`,
  };
}

export function buildRrule(
  repeat: string,
  weekdays: number[],
  ends: "never" | "count" | "date",
  endValue: string,
  anchor?: string,
) {
  if (repeat === "none") return undefined;
  const date = new Date(anchor ?? new Date());
  const days = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const parts =
    repeat === "daily"
      ? ["FREQ=DAILY"]
      : repeat === "weekdays"
        ? ["FREQ=WEEKLY", "BYDAY=MO,TU,WE,TH,FR"]
        : repeat === "weekly"
          ? [
              "FREQ=WEEKLY",
              `BYDAY=${(weekdays.length ? weekdays : [(date.getDay() + 6) % 7])
                .map((day) => days[day])
                .join(",")}`,
            ]
          : repeat === "monthly-date"
            ? ["FREQ=MONTHLY", `BYMONTHDAY=${date.getDate()}`]
            : repeat === "monthly-weekday"
              ? [
                  "FREQ=MONTHLY",
                  `BYDAY=${Math.ceil(date.getDate() / 7)}${days[(date.getDay() + 6) % 7]}`,
                ]
              : ["FREQ=YEARLY", `BYMONTH=${date.getMonth() + 1}`, `BYMONTHDAY=${date.getDate()}`];
  if (ends === "count" && Number(endValue) > 0) parts.push(`COUNT=${Math.floor(Number(endValue))}`);
  if (ends === "date" && endValue) parts.push(`UNTIL=${endValue.replaceAll("-", "")}T235959Z`);
  return `RRULE:${parts.join(";")}`;
}

export function normalizeWholeSeriesEdit(
  base: CalendarItem,
  occurrenceStart: string,
  input: ItemDraft,
): ItemDraft {
  const inputAnchor = input.startAt ?? input.dueAt;
  const baseAnchor = base.startAt ?? base.dueAt;
  if (!inputAnchor || !baseAnchor) return input;
  const delta = new Date(inputAnchor).getTime() - new Date(occurrenceStart).getTime();
  const normalized = { ...input };
  if (base.startAt) {
    const nextStart = new Date(new Date(base.startAt).getTime() + delta);
    const duration = input.endAt
      ? new Date(input.endAt).getTime() - new Date(inputAnchor).getTime()
      : base.endAt
        ? new Date(base.endAt).getTime() - new Date(base.startAt).getTime()
        : 0;
    normalized.startAt = nextStart.toISOString();
    normalized.endAt = duration
      ? new Date(nextStart.getTime() + duration).toISOString()
      : undefined;
  } else {
    normalized.startAt = undefined;
    normalized.endAt = undefined;
    normalized.dueAt = new Date(new Date(base.dueAt!).getTime() + delta).toISOString();
  }
  return normalized;
}
