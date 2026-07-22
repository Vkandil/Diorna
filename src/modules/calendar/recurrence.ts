import { RRule, rrulestr } from "rrule";
import type { CalendarItem } from "@/shared/models";

export interface ItemOccurrence extends CalendarItem {
  occurrenceStart: string;
  recurrenceId: string;
}

export function occurrencesBetween(
  item: CalendarItem,
  rangeStart: Date,
  rangeEnd: Date,
): ItemOccurrence[] {
  const anchor = item.startAt ?? item.dueAt;
  if (!anchor) return [];
  if (!item.rrule) {
    const date = new Date(anchor);
    return date >= rangeStart && date <= rangeEnd
      ? [
          {
            ...item,
            occurrenceStart: anchor,
            recurrenceId: `${item.id}:${anchor}`,
          },
        ]
      : [];
  }

  let rule: RRule;
  try {
    rule = rrulestr(
      item.rrule.startsWith("RRULE:")
        ? `DTSTART:${toRruleDate(new Date(anchor))}\n${item.rrule}`
        : `DTSTART:${toRruleDate(new Date(anchor))}\nRRULE:${item.rrule}`,
    ) as RRule;
  } catch {
    const date = new Date(anchor);
    return date >= rangeStart && date <= rangeEnd
      ? [{ ...item, occurrenceStart: anchor, recurrenceId: `${item.id}:${anchor}` }]
      : [];
  }
  const exceptions = new Set(item.rruleExceptions.map((date) => new Date(date).getTime()));
  return rule
    .between(rangeStart, rangeEnd, true)
    .filter((date) => !exceptions.has(date.getTime()))
    .map((date) => {
      const occurrenceStart = date.toISOString();
      const originalStart = new Date(anchor);
      const duration = item.endAt ? new Date(item.endAt).getTime() - originalStart.getTime() : 0;
      return {
        ...item,
        startAt: occurrenceStart,
        ...(item.endAt ? { endAt: new Date(date.getTime() + duration).toISOString() } : {}),
        occurrenceStart,
        recurrenceId: `${item.id}:${occurrenceStart}`,
      };
    });
}

function toRruleDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function describeRecurrence(rule?: string): string {
  if (!rule) return "Does not repeat";
  try {
    const normalized = rule.startsWith("RRULE:") ? rule.slice(6) : rule;
    return RRule.fromString(normalized).toText();
  } catch {
    return "Custom recurrence";
  }
}
