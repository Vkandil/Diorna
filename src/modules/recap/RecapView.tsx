import { useState } from "react";
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
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Download,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { createId } from "@/shared/id";
import { aggregateRecap, buildTemplateNarrative, recapTransmissionPayload } from "./logic";
import {
  createOllamaSummarizer,
  generateValidatedNarrative,
  OpenAICompatibleSummarizer,
  type Summarizer,
} from "./summarizer";
import { loadNativeApiKey } from "@/core/native";
import type { Recap, RecapStatistics } from "@/shared/models";
import { recapSecretId } from "@/shared/recapConfig";

type PeriodType = Recap["periodType"];

interface PeriodSelection {
  type: PeriodType;
  month: string;
  year: string;
  start: string;
  end: string;
  combined: boolean;
}

export function RecapView() {
  const state = useDiornaStore();
  const workspace = state.workspaces.find((entry) => entry.id === state.activeWorkspaceId)!;
  const recaps = selectWorkspace(state.recaps, workspace.id).sort((a, b) =>
    b.periodStart.localeCompare(a.periodStart),
  );
  const [selected, setSelected] = useState<string | undefined>(recaps[0]?.id);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<string>();
  const lastMonth = subMonths(startOfMonth(new Date()), 1);
  const [periodSelection, setPeriodSelection] = useState<PeriodSelection>({
    type: "month",
    month: format(lastMonth, "yyyy-MM"),
    year: String(subYears(new Date(), 1).getFullYear()),
    start: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
    end: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
    combined: false,
  });
  const active = recaps.find((recap) => recap.id === selected);
  const periods = Array.from({ length: 8 }, (_, index) =>
    subMonths(startOfMonth(new Date()), index + 1),
  );
  const generate = async ({
    start,
    end,
    type,
    combined = false,
    automatic = false,
  }: {
    start: string;
    end: string;
    type: PeriodType;
    combined?: boolean;
    automatic?: boolean;
  }) => {
    if (generating) return;
    setGenerating(true);
    setProgress(8);
    try {
      const duration = differenceInCalendarDays(parseISODate(end), parseISODate(start)) + 1;
      const previous = formatISO(subDays(parseISODate(start), duration), {
        representation: "date",
      });
      const workspaceIds = combined ? state.workspaces.map((entry) => entry.id) : [workspace.id];
      const inScope = <T extends { workspaceId: string }>(values: T[]) =>
        values.filter((value) => workspaceIds.includes(value.workspaceId));
      const categories = inScope(state.categories);
      const aggregated = aggregateRecap({
        workspaceId: combined ? "combined" : workspace.id,
        periodStart: start,
        periodEnd: end,
        previousPeriodStart: previous,
        habits: inScope(state.habits),
        habitEntries: inScope(state.habitEntries),
        metrics: inScope(state.metrics),
        metricEntries: inScope(state.metricEntries),
        items: inScope(state.items),
        notes: inScope(state.notes),
        maps: inScope(state.maps),
        flashcards: inScope(state.flashcards),
        reviewLogs: inScope(state.reviewLogs),
        courses: inScope(state.courses),
        categoryNames: Object.fromEntries(
          categories.map((category) => [
            category.id,
            combined
              ? `${state.workspaces.find((entry) => entry.id === category.workspaceId)?.name ?? "Workspace"} · ${category.name}`
              : category.name,
          ]),
        ),
      });
      const stats: RecapStatistics =
        type === "year"
          ? {
              ...aggregated,
              monthlyRecaps: recaps
                .filter(
                  (recap) =>
                    recap.periodType === "month" &&
                    recap.periodStart >= start &&
                    recap.periodEnd <= end &&
                    recap.stats.workspaceId === aggregated.workspaceId,
                )
                .map((recap) => ({
                  periodStart: recap.periodStart,
                  habitRate: recap.stats.habits.overallRate,
                  tasksCompleted: recap.stats.tasks.completed,
                  metrics: Object.fromEntries(
                    recap.stats.metrics.map((metric) => [metric.name, metric.last]),
                  ),
                })),
            }
          : aggregated;
      setProgress(38);
      const payload = recapTransmissionPayload(stats, state.settings.recapAggregatesOnly);
      let primary: Summarizer | null = null;
      const remoteProviderId = providerHost(state.settings.recapEndpoint);
      if (
        !automatic &&
        state.settings.recapProvider === "remote" &&
        state.settings.recapModel &&
        remoteProviderId
      ) {
        const providerId = remoteProviderId;
        let consented = state.settings.recapConsentedProviders.includes(providerId);
        if (!consented && !automatic) {
          const preview = JSON.stringify(payload, null, 2);
          const accepted = window.confirm(
            `Diorna will send exactly the following payload to ${providerId}:\n\n${preview}\n\nContinue?`,
          );
          if (!accepted) return;
          consented = true;
          state.updateSettings({
            recapConsentedProviders: [...state.settings.recapConsentedProviders, providerId],
          });
        }
        if (consented) {
          const apiKey = await loadNativeApiKey(recapSecretId(state.settings.recapEndpoint));
          const openRouter = providerId === "openrouter.ai";
          if (apiKey || !openRouter) {
            primary = new OpenAICompatibleSummarizer(
              {
                endpoint: state.settings.recapEndpoint,
                model: state.settings.recapModel,
                temperature: state.settings.recapTemperature,
                maxTokens: state.settings.recapMaxTokens,
                ...(apiKey ? { apiKey } : {}),
                ...(openRouter ? { headers: { "X-OpenRouter-Title": "Diorna" } } : {}),
              },
              state.settings.recapModel,
            );
          }
        }
      } else if (state.settings.recapProvider === "local" && state.settings.recapModel) {
        primary = createOllamaSummarizer(state.settings.recapModel);
      }
      setProgress(58);
      const reportName = combined ? "All workspaces" : workspace.name;
      const remoteRestricted = primary?.id === "remote" && state.settings.recapAggregatesOnly;
      const narrativeStats = primary?.id === "remote" ? payload : stats;
      const transmittedReportName = remoteRestricted ? "Workspace" : reportName;
      const generated = await generateValidatedNarrative(
        primary,
        narrativeStats,
        transmittedReportName,
      ).catch(() => ({
        narrative: buildTemplateNarrative(narrativeStats, transmittedReportName),
        modelUsed: "deterministic-template",
        fallback: true,
      }));
      const narrative = generated.narrative;
      setProgress(78);
      const periodLabel = formatPeriodLabel(start, end, type);
      const existing = recaps.find(
        (recap) =>
          recap.periodStart === start &&
          recap.periodEnd === end &&
          recap.periodType === type &&
          recap.stats.workspaceId === stats.workspaceId,
      );
      const existingNote = existing
        ? state.notes.find((note) => note.id === existing.noteId)
        : undefined;
      const note = existingNote ?? state.addNote(`${periodLabel} — ${reportName} Recap`);
      state.updateNote(note.id, {
        body: markdownToHtml(narrative),
        tags: ["recap", type, ...(combined ? ["combined"] : [])],
      });
      const recap: Recap = {
        id: existing?.id ?? createId("recap"),
        workspaceId: workspace.id,
        periodType: type,
        periodStart: start,
        periodEnd: end,
        noteId: note.id,
        stats,
        narrative,
        modelUsed: generated.modelUsed,
        generatedAt: new Date().toISOString(),
        revision: (existing?.revision ?? 0) + 1,
      };
      useDiornaStore.setState((current) => ({
        recaps: existing
          ? current.recaps.map((entry) => (entry.id === existing.id ? recap : entry))
          : [...current.recaps, recap],
      }));
      setSelected(recap.id);
      setProgress(100);
      setToast(
        generated.fallback && state.settings.recapProvider !== "none"
          ? `${periodLabel} recap generated locally — the configured model was unavailable`
          : `${periodLabel} recap generated`,
      );
      window.setTimeout(() => setToast(undefined), 4000);
    } finally {
      setGenerating(false);
      window.setTimeout(() => setProgress(0), 500);
    }
  };
  if (active)
    return (
      <RecapDetail
        recap={active}
        onBack={() => setSelected(undefined)}
        onRegenerate={() =>
          void generate({
            start: active.periodStart,
            end: active.periodEnd,
            type: active.periodType,
            combined: active.stats.workspaceId === "combined",
          })
        }
      />
    );
  return (
    <div className="module-page recap-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Narrative reports</span>
          <h1>Recap</h1>
          <p>Everything you entered, shaped into a factual account of what you accomplished.</p>
        </div>
        <button
          className="button primary icon-text"
          onClick={() => void generate(selectionToPeriod(periodSelection))}
          disabled={generating}
        >
          <Sparkles /> {generating ? "Generating…" : "Generate now"}
        </button>
      </header>
      <section className="recap-generator">
        <div className="segmented" aria-label="Recap period type">
          {(["month", "year", "custom"] as const).map((type) => (
            <button
              key={type}
              className={periodSelection.type === type ? "active" : ""}
              onClick={() => setPeriodSelection((selection) => ({ ...selection, type }))}
            >
              {type[0]!.toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        {periodSelection.type === "month" && (
          <label>
            <span>Month</span>
            <input
              type="month"
              value={periodSelection.month}
              max={format(lastMonth, "yyyy-MM")}
              onChange={(event) =>
                setPeriodSelection((selection) => ({
                  ...selection,
                  month: event.target.value,
                }))
              }
            />
          </label>
        )}
        {periodSelection.type === "year" && (
          <label>
            <span>Year</span>
            <input
              type="number"
              min="2000"
              max={new Date().getFullYear() - 1}
              value={periodSelection.year}
              onChange={(event) =>
                setPeriodSelection((selection) => ({
                  ...selection,
                  year: event.target.value,
                }))
              }
            />
          </label>
        )}
        {periodSelection.type === "custom" && (
          <div className="recap-custom-range">
            <label>
              <span>Start</span>
              <input
                type="date"
                value={periodSelection.start}
                onChange={(event) =>
                  setPeriodSelection((selection) => ({
                    ...selection,
                    start: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>End</span>
              <input
                type="date"
                min={periodSelection.start}
                max={format(new Date(), "yyyy-MM-dd")}
                value={periodSelection.end}
                onChange={(event) =>
                  setPeriodSelection((selection) => ({
                    ...selection,
                    end: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        )}
        <label className="combined-recap-toggle">
          <input
            type="checkbox"
            checked={periodSelection.combined}
            onChange={(event) =>
              setPeriodSelection((selection) => ({
                ...selection,
                combined: event.target.checked,
              }))
            }
          />
          <span>Combine all workspaces</span>
        </label>
      </section>
      {generating && (
        <div className="recap-generation-progress" role="status">
          <span>Computing and validating your recap…</span>
          <i>
            <b style={{ width: `${progress}%` }} />
          </i>
        </div>
      )}
      <div className="privacy-note">
        <Sparkles />
        <span>
          <strong>Private by construction.</strong> Statistics are computed locally. With no model
          configured, Diorna writes a deterministic report.
        </span>
        <button onClick={() => state.setModule("settings")}>Review settings</button>
      </div>
      <div className="recap-timeline">
        {recaps
          .filter((recap) => recap.periodType !== "month" || recap.stats.workspaceId === "combined")
          .map((recap) => (
            <article key={recap.id} className="ready special-period">
              <div className="timeline-dot" />
              <span className="period-label">
                {formatPeriodLabel(recap.periodStart, recap.periodEnd, recap.periodType)}
              </span>
              <div className="recap-card-head">
                <div>
                  <span className="eyebrow">
                    {recap.stats.workspaceId === "combined" ? "All workspaces" : workspace.name}
                  </span>
                  <h2>{headline(recap.stats)}</h2>
                </div>
                <Sparkles />
              </div>
              <div className="headline-stats">
                <Stat
                  label="Habits"
                  value={
                    recap.stats.habits.overallRate === null
                      ? "—"
                      : `${recap.stats.habits.overallRate}%`
                  }
                />
                <Stat label="Tasks done" value={String(recap.stats.tasks.completed)} />
                <Stat label="Events" value={String(recap.stats.events?.attended ?? 0)} />
              </div>
              <button className="link-button" onClick={() => setSelected(recap.id)}>
                Read recap <ArrowRight />
              </button>
            </article>
          ))}
        {periods.map((period) => {
          const start = formatISO(startOfMonth(period), {
            representation: "date",
          });
          const recap = recaps.find(
            (entry) =>
              entry.periodStart === start &&
              entry.periodType === "month" &&
              entry.stats.workspaceId === workspace.id,
          );
          return (
            <article key={start} className={recap ? "ready" : ""}>
              <div className="timeline-dot" />
              <span className="period-label">{format(period, "MMMM yyyy")}</span>
              {recap ? (
                <>
                  <div className="recap-card-head">
                    <div>
                      <span className="eyebrow">{workspace.name}</span>
                      <h2>{headline(recap.stats)}</h2>
                    </div>
                    <Sparkles />
                  </div>
                  <div className="headline-stats">
                    <Stat
                      label="Habits"
                      value={
                        recap.stats.habits.overallRate === null
                          ? "—"
                          : `${recap.stats.habits.overallRate}%`
                      }
                    />
                    <Stat label="Tasks done" value={String(recap.stats.tasks.completed)} />
                    <Stat label="Words written" value={String(recap.stats.notes.wordsWritten)} />
                  </div>
                  <button className="link-button" onClick={() => setSelected(recap.id)}>
                    Read recap <ArrowRight />
                  </button>
                </>
              ) : (
                <div className="recap-empty">
                  <div>
                    <strong>No recap yet</strong>
                    <span>Generate locally from this period’s activity.</span>
                  </div>
                  <button
                    className="button"
                    onClick={() =>
                      void generate({
                        start,
                        end: formatISO(endOfMonth(period), { representation: "date" }),
                        type: "month",
                      })
                    }
                    disabled={generating}
                  >
                    Generate
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {toast && (
        <div className="app-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function RecapDetail({
  recap,
  onBack,
  onRegenerate,
}: {
  recap: Recap;
  onBack: () => void;
  onRegenerate: () => void;
}) {
  const stats = recap.stats;
  const habitDelta =
    stats.habits.overallRate !== null && stats.habits.previousRate !== null
      ? stats.habits.overallRate - stats.habits.previousRate
      : null;
  const taskData = Object.entries(stats.tasks.byCategory).map(([name, value]) => ({ name, value }));
  const habitData = (stats.habits.rates ?? [])
    .filter((habit) => habit.rate !== null)
    .map((habit) => ({ name: habit.name, rate: habit.rate }));
  const longestHabit = [...(stats.habits.rates ?? [])].sort(
    (a, b) => b.longestStreak - a.longestStreak,
  )[0];
  const taskDelta = stats.tasks.completed - stats.tasks.previousCompleted;
  const improvements = [
    ...(taskDelta > 0 ? [`Tasks completed increased by ${taskDelta}.`] : []),
    ...(habitDelta !== null && habitDelta > 0
      ? [`Habit completion increased by ${habitDelta} points.`]
      : []),
    ...stats.metrics
      .filter((metric) => metric.absoluteChange > 0)
      .map((metric) => `${metric.name} increased by ${metric.absoluteChange} ${metric.unit}.`),
  ];
  const declines = [
    ...(taskDelta < 0 ? [`Tasks completed decreased by ${Math.abs(taskDelta)}.`] : []),
    ...(habitDelta !== null && habitDelta < 0
      ? [`Habit completion decreased by ${Math.abs(habitDelta)} points.`]
      : []),
    ...stats.metrics
      .filter((metric) => metric.absoluteChange < 0)
      .map(
        (metric) =>
          `${metric.name} decreased by ${Math.abs(metric.absoluteChange)} ${metric.unit}.`,
      ),
  ];
  return (
    <div className="module-page recap-detail">
      <header className="recap-detail-toolbar">
        <button className="button" onClick={onBack}>
          ← Timeline
        </button>
        <span className="toolbar-spacer" />
        <button className="button icon-text" onClick={onRegenerate}>
          <RefreshCw /> Regenerate
        </button>
        <button className="button icon-text" onClick={() => window.print()}>
          <Download /> Export PDF
        </button>
      </header>
      <div className="recap-document">
        <span className="eyebrow">
          {formatPeriodLabel(recap.periodStart, recap.periodEnd, recap.periodType)}
        </span>
        <h1>{headline(stats)}</h1>
        <p className="lead">
          A factual recap generated from your Diorna activity. Every figure below is traceable to
          local statistics.
        </p>
        <div className="stat-grid">
          <DeltaStat
            label="Habit completion"
            value={stats.habits.overallRate === null ? "—" : `${stats.habits.overallRate}%`}
            delta={habitDelta}
          />
          <DeltaStat
            label="Tasks completed"
            value={String(stats.tasks.completed)}
            delta={stats.tasks.completed - stats.tasks.previousCompleted}
          />
          <DeltaStat label="Notes created" value={String(stats.notes.created)} />
          <DeltaStat label="Words written" value={String(stats.notes.wordsWritten)} />
          <DeltaStat label="Cards reviewed" value={String(stats.flashcards.reviewed)} />
          <DeltaStat label="Events attended" value={String(stats.events?.attended ?? 0)} />
          <DeltaStat
            label="Flashcard retention"
            value={
              stats.flashcards.retentionRate === null ? "—" : `${stats.flashcards.retentionRate}%`
            }
          />
          <DeltaStat label="Review streak" value={`${stats.flashcards.streak} days`} />
        </div>
        <Narrative narrative={recap.narrative} />
        <section>
          <h2>Progress in numbers</h2>
          <div className="chart-grid">
            {stats.metrics.map((metric) => (
              <div className="chart-card metric-progress-chart" key={`line-${metric.name}`}>
                <h3>{metric.name} progression</h3>
                {(metric.values?.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={metric.values ?? []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} />
                      <YAxis domain={["auto", "auto"]} unit={metric.unit} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--accent)"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-chart">No metric samples</div>
                )}
              </div>
            ))}
            <div className="chart-card">
              <h3>Habit completion</h3>
              {habitData.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={habitData} layout="vertical" margin={{ left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} unit="%" />
                    <YAxis type="category" dataKey="name" width={90} />
                    <Tooltip />
                    <Bar dataKey="rate" fill="var(--success)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-chart">No applicable habits</div>
              )}
            </div>
            <div className="chart-card">
              <h3>Daily-score heatmap</h3>
              <div className="recap-score-heatmap">
                {stats.dailyScores.map((day) => (
                  <i
                    key={day.date}
                    title={`${day.date}: ${day.score === null ? "—" : `${day.score}%`}`}
                    style={
                      {
                        "--score": `${day.score ?? 0}%`,
                        opacity: day.score === null ? 0.25 : 0.35 + day.score / 155,
                      } as React.CSSProperties
                    }
                  >
                    <span>{day.date.slice(8)}</span>
                  </i>
                ))}
              </div>
            </div>
            <div className="chart-card">
              <h3>Tasks by category</h3>
              {taskData.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={taskData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={78}
                    >
                      {taskData.map((_, index) => (
                        <Cell
                          key={index}
                          fill={["#5b5bd6", "#168a68", "#bd6b28", "#c0445c"][index % 4]!}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-chart">No completed tasks</div>
              )}
            </div>
          </div>
        </section>
        {recap.periodType === "year" && (stats.monthlyRecaps?.length ?? 0) > 0 && (
          <section>
            <h2>Twelve-month trends</h2>
            <div className="chart-grid">
              {[
                ...new Set(
                  (stats.monthlyRecaps ?? []).flatMap((month) => Object.keys(month.metrics)),
                ),
              ].map((metricName) => (
                <div className="chart-card metric-progress-chart" key={metricName}>
                  <h3>{metricName} by month</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={(stats.monthlyRecaps ?? []).map((month) => ({
                        month: month.periodStart.slice(0, 7),
                        value: month.metrics[metricName],
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" />
                      <YAxis domain={["auto", "auto"]} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--accent)"
                        strokeWidth={3}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
              <div className="chart-card metric-progress-chart">
                <h3>Monthly habit and task momentum</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={stats.monthlyRecaps ?? []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="periodStart"
                      tickFormatter={(value: string) => value.slice(0, 7)}
                    />
                    <YAxis domain={[0, "auto"]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="habitRate" stroke="var(--success)" />
                    <Line type="monotone" dataKey="tasksCompleted" stroke="var(--accent)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}
        {stats.metrics.length > 0 && (
          <section>
            <h2>Metric highlights</h2>
            <div className="highlight-list">
              {stats.metrics.map((metric) => (
                <div key={metric.name}>
                  <Trophy />
                  <span>
                    <strong>{metric.name}</strong>
                    <small>
                      {metric.first} → {metric.last} {metric.unit}
                    </small>
                  </span>
                  <b>
                    {metric.percentChange === null
                      ? "—"
                      : `${metric.percentChange >= 0 ? "+" : ""}${metric.percentChange}%`}
                  </b>
                </div>
              ))}
            </div>
          </section>
        )}
        <section>
          <h2>Highlights</h2>
          <div className="highlight-list">
            {stats.metrics
              .filter((metric) => metric.personalRecord)
              .map((metric) => (
                <div key={`record-${metric.name}`}>
                  <Trophy />
                  <span>
                    <strong>New {metric.name} record</strong>
                    <small>
                      {metric.last} {metric.unit}
                    </small>
                  </span>
                </div>
              ))}
            {longestHabit && (
              <div>
                <Sparkles />
                <span>
                  <strong>Longest habit streak</strong>
                  <small>
                    {longestHabit.name} · {longestHabit.longestStreak} days
                  </small>
                </span>
              </div>
            )}
            {!stats.metrics.some((metric) => metric.personalRecord) && !longestHabit && (
              <div className="empty-chart">No new milestones in this period</div>
            )}
          </div>
        </section>
        <section>
          <h2>Improved / declined</h2>
          <div className="trend-columns">
            <div>
              <ArrowUpRight />
              <strong>What improved</strong>
              {improvements.length ? (
                <ul>
                  {improvements.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p>No measured improvement against the comparison period.</p>
              )}
            </div>
            <div>
              <ArrowDownRight />
              <strong>What declined</strong>
              {declines.length ? (
                <ul>
                  {declines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p>No measured decline against the comparison period.</p>
              )}
            </div>
          </div>
        </section>
        <footer>
          Generated {format(new Date(recap.generatedAt), "PPpp")} · {recap.modelUsed} · revision{" "}
          {recap.revision}
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function DeltaStat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      {delta !== undefined && delta !== null && (
        <small className={delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral"}>
          {delta > 0 ? <ArrowUpRight /> : delta < 0 ? <ArrowDownRight /> : <ArrowRight />}
          {Math.abs(delta)} vs previous
        </small>
      )}
    </div>
  );
}
function Narrative({ narrative }: { narrative: string }) {
  return (
    <section className="narrative">
      <h2>The story of the period</h2>
      {narrative
        .split("\n\n")
        .slice(1)
        .map((line, index) => {
          const lead = /^\*\*(.+?)\*\*\s*(.*)$/s.exec(line);
          return lead ? (
            <p key={index}>
              <strong>{lead[1]}</strong> {lead[2]}
            </p>
          ) : (
            <p key={index}>{line}</p>
          );
        })}
    </section>
  );
}
function headline(stats: RecapStatistics): string {
  if (stats.metrics.some((metric) => metric.personalRecord))
    return "A month of measurable progress";
  if (stats.tasks.completed > stats.tasks.previousCompleted)
    return "Momentum moved in the right direction";
  return "A clear record of steady work";
}
function markdownToHtml(value: string): string {
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
function parseISODate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function selectionToPeriod(selection: PeriodSelection): {
  start: string;
  end: string;
  type: PeriodType;
  combined: boolean;
} {
  if (selection.type === "month") {
    const date = parseISODate(`${selection.month}-01`);
    return {
      start: format(startOfMonth(date), "yyyy-MM-dd"),
      end: format(endOfMonth(date), "yyyy-MM-dd"),
      type: "month",
      combined: selection.combined,
    };
  }
  if (selection.type === "year") {
    const date = new Date(Number(selection.year), 0, 1);
    return {
      start: format(startOfYear(date), "yyyy-MM-dd"),
      end: format(endOfYear(date), "yyyy-MM-dd"),
      type: "year",
      combined: selection.combined,
    };
  }
  return {
    start: selection.start,
    end: selection.end < selection.start ? selection.start : selection.end,
    type: "custom",
    combined: selection.combined,
  };
}

function formatPeriodLabel(start: string, end: string, type: PeriodType): string {
  if (type === "month") return format(parseISODate(start), "MMMM yyyy");
  if (type === "year") return format(parseISODate(start), "yyyy");
  return `${format(parseISODate(start), "PP")} – ${format(parseISODate(end), "PP")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function providerHost(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).host || undefined;
  } catch {
    return undefined;
  }
}
