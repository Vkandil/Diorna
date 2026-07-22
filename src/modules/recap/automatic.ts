import {
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  formatISO,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import { persistNativeNote } from "@/core/native";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { createId } from "@/shared/id";
import type { Note, Recap, RecapStatistics } from "@/shared/models";
import { aggregateRecap, buildTemplateNarrative } from "./logic";

export async function generateDueAutomaticRecaps(now = new Date()): Promise<string[]> {
  const initial = useDiornaStore.getState();
  if (now.getDate() !== 1) return [];
  const periods: Array<{ type: Recap["periodType"]; start: string; end: string }> = [];
  if (initial.settings.recapAutoMonthly) {
    const previousMonth = subMonths(startOfMonth(now), 1);
    periods.push({
      type: "month",
      start: format(startOfMonth(previousMonth), "yyyy-MM-dd"),
      end: format(endOfMonth(previousMonth), "yyyy-MM-dd"),
    });
  }
  if (initial.settings.recapAutoYearly && now.getMonth() === 0) {
    const previousYear = subYears(now, 1);
    periods.push({
      type: "year",
      start: format(startOfYear(previousYear), "yyyy-MM-dd"),
      end: format(endOfYear(previousYear), "yyyy-MM-dd"),
    });
  }
  const generated: string[] = [];
  for (const workspace of initial.workspaces) {
    for (const period of periods) {
      const current = useDiornaStore.getState();
      if (
        current.recaps.some(
          (recap) =>
            recap.workspaceId === workspace.id &&
            recap.stats.workspaceId === workspace.id &&
            recap.periodType === period.type &&
            recap.periodStart === period.start &&
            recap.periodEnd === period.end,
        )
      )
        continue;
      const stats = aggregateForWorkspace(current, workspace.id, period.start, period.end);
      if (period.type === "year")
        stats.monthlyRecaps = monthlySummaries(
          current.recaps,
          workspace.id,
          period.start,
          period.end,
        );
      const narrative = buildTemplateNarrative(stats, workspace.name);
      const periodLabel =
        period.type === "month"
          ? format(new Date(`${period.start}T12:00:00`), "MMMM yyyy")
          : format(new Date(`${period.start}T12:00:00`), "yyyy");
      const note = createRecapNote(
        current.notes,
        workspace.id,
        `${periodLabel} — ${workspace.name} Recap`,
        narrative,
        period.type,
      );
      const recap: Recap = {
        id: createId("recap"),
        workspaceId: workspace.id,
        periodType: period.type,
        periodStart: period.start,
        periodEnd: period.end,
        noteId: note.id,
        stats,
        narrative,
        modelUsed: "deterministic-template",
        generatedAt: new Date().toISOString(),
        revision: 1,
      };
      useDiornaStore.setState((state) => ({
        notes: [...state.notes, note],
        recaps: [...state.recaps, recap],
      }));
      await persistNativeNote(note);
      generated.push(`${periodLabel} — ${workspace.name}`);
    }
  }
  if (generated.length)
    window.dispatchEvent(
      new CustomEvent("diorna-toast", {
        detail: `${generated.length} automatic recap${generated.length === 1 ? "" : "s"} generated`,
      }),
    );
  return generated;
}

function aggregateForWorkspace(
  state: ReturnType<typeof useDiornaStore.getState>,
  workspaceId: string,
  start: string,
  end: string,
): RecapStatistics {
  const duration = differenceInCalendarDays(new Date(end), new Date(start)) + 1;
  const previousStart = formatISO(subDays(new Date(`${start}T12:00:00`), duration), {
    representation: "date",
  });
  const categories = selectWorkspace(state.categories, workspaceId);
  return aggregateRecap({
    workspaceId,
    periodStart: start,
    periodEnd: end,
    previousPeriodStart: previousStart,
    habits: selectWorkspace(state.habits, workspaceId),
    habitEntries: selectWorkspace(state.habitEntries, workspaceId),
    metrics: selectWorkspace(state.metrics, workspaceId),
    metricEntries: selectWorkspace(state.metricEntries, workspaceId),
    items: selectWorkspace(state.items, workspaceId),
    notes: selectWorkspace(state.notes, workspaceId),
    maps: selectWorkspace(state.maps, workspaceId),
    flashcards: selectWorkspace(state.flashcards, workspaceId),
    reviewLogs: selectWorkspace(state.reviewLogs, workspaceId),
    courses: selectWorkspace(state.courses, workspaceId),
    categoryNames: Object.fromEntries(categories.map((category) => [category.id, category.name])),
  });
}

function monthlySummaries(
  recaps: Recap[],
  workspaceId: string,
  start: string,
  end: string,
): NonNullable<RecapStatistics["monthlyRecaps"]> {
  return recaps
    .filter(
      (recap) =>
        recap.workspaceId === workspaceId &&
        recap.stats.workspaceId === workspaceId &&
        recap.periodType === "month" &&
        recap.periodStart >= start &&
        recap.periodEnd <= end,
    )
    .map((recap) => ({
      periodStart: recap.periodStart,
      habitRate: recap.stats.habits.overallRate,
      tasksCompleted: recap.stats.tasks.completed,
      metrics: Object.fromEntries(recap.stats.metrics.map((metric) => [metric.name, metric.last])),
    }));
}

function createRecapNote(
  notes: Note[],
  workspaceId: string,
  requestedTitle: string,
  narrative: string,
  periodType: Recap["periodType"],
): Note {
  const used = new Set(
    notes
      .filter((note) => note.workspaceId === workspaceId && !note.trashedAt)
      .map((note) => note.title.toLocaleLowerCase()),
  );
  let title = requestedTitle;
  let suffix = 2;
  while (used.has(title.toLocaleLowerCase())) title = `${requestedTitle} ${suffix++}`;
  const timestamp = new Date().toISOString();
  return {
    id: createId("note"),
    workspaceId,
    path: `notes/${title}.md`,
    title,
    body: narrativeToHtml(narrative),
    tags: ["recap", periodType],
    properties: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    wordCount: narrative.split(/\s+/).filter(Boolean).length,
  };
}

function narrativeToHtml(value: string): string {
  return value
    .split("\n\n")
    .map((part) => {
      const escaped = escapeHtml(part);
      return part.startsWith("# ")
        ? `<h1>${escapeHtml(part.slice(2))}</h1>`
        : `<p>${escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
