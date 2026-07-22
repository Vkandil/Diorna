import { useState } from "react";
import { endOfMonth, format, formatISO, startOfMonth, subMonths } from "date-fns";
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { createId } from "@/shared/id";
import { aggregateRecap, buildTemplateNarrative } from "./logic";
import {
  createOllamaSummarizer,
  generateValidatedNarrative,
  OpenAICompatibleSummarizer,
  type Summarizer,
} from "./summarizer";
import { loadNativeApiKey } from "@/core/native";
import type { Recap, RecapStatistics } from "@/shared/models";

export function RecapView() {
  const state = useDiornaStore();
  const workspace = state.workspaces.find((entry) => entry.id === state.activeWorkspaceId)!;
  const recaps = selectWorkspace(state.recaps, workspace.id).sort((a, b) =>
    b.periodStart.localeCompare(a.periodStart),
  );
  const [selected, setSelected] = useState<string | undefined>(recaps[0]?.id);
  const [generating, setGenerating] = useState(false);
  const active = recaps.find((recap) => recap.id === selected);
  const periods = Array.from({ length: 8 }, (_, index) =>
    subMonths(startOfMonth(new Date()), index + 1),
  );
  const generate = async (period: Date) => {
    if (generating) return;
    setGenerating(true);
    try {
      const start = formatISO(startOfMonth(period), { representation: "date" });
      const end = formatISO(endOfMonth(period), { representation: "date" });
      const previous = formatISO(startOfMonth(subMonths(period, 1)), {
        representation: "date",
      });
      const categories = selectWorkspace(state.categories, workspace.id);
      const stats = aggregateRecap({
        workspaceId: workspace.id,
        periodStart: start,
        periodEnd: end,
        previousPeriodStart: previous,
        habits: selectWorkspace(state.habits, workspace.id),
        habitEntries: selectWorkspace(state.habitEntries, workspace.id),
        metrics: selectWorkspace(state.metrics, workspace.id),
        metricEntries: selectWorkspace(state.metricEntries, workspace.id),
        items: selectWorkspace(state.items, workspace.id),
        notes: selectWorkspace(state.notes, workspace.id),
        maps: selectWorkspace(state.maps, workspace.id),
        flashcards: [],
        categoryNames: Object.fromEntries(
          categories.map((category) => [category.id, category.name]),
        ),
      });
      let primary: Summarizer | null = null;
      if (state.settings.recapProvider === "remote" && state.settings.recapModel) {
        const providerId = new URL(state.settings.recapEndpoint).host;
        if (!state.settings.recapConsentedProviders.includes(providerId)) {
          const preview = JSON.stringify(stats, null, 2);
          const accepted = window.confirm(
            `Diorna will send the following statistics to ${providerId}:\n\n${preview.slice(0, 6000)}\n\nContinue?`,
          );
          if (!accepted) return;
          state.updateSettings({
            recapConsentedProviders: [...state.settings.recapConsentedProviders, providerId],
          });
        }
        const apiKey = await loadNativeApiKey("openrouter");
        primary = new OpenAICompatibleSummarizer({
          endpoint: state.settings.recapEndpoint,
          model: state.settings.recapModel,
          ...(apiKey ? { apiKey } : {}),
        });
      } else if (state.settings.recapProvider === "local" && state.settings.recapModel) {
        primary = createOllamaSummarizer(state.settings.recapModel);
      }
      const generated = await generateValidatedNarrative(primary, stats, workspace.name).catch(
        () => ({
          narrative: buildTemplateNarrative(stats, workspace.name),
          modelUsed: "deterministic-template",
          fallback: true,
        }),
      );
      const narrative = generated.narrative;
      const note = state.addNote(`${format(period, "MMMM yyyy")} — ${workspace.name} Recap`);
      state.updateNote(note.id, {
        body: markdownToHtml(narrative),
        tags: ["recap", format(period, "yyyy/MM")],
      });
      const existing = recaps.find((recap) => recap.periodStart === start);
      const recap: Recap = {
        id: existing?.id ?? createId("recap"),
        workspaceId: workspace.id,
        periodType: "month",
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
    } finally {
      setGenerating(false);
    }
  };
  if (active)
    return (
      <RecapDetail
        recap={active}
        onBack={() => setSelected(undefined)}
        onRegenerate={() => void generate(parseISODate(active.periodStart))}
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
          onClick={() => void generate(periods[0]!)}
          disabled={generating}
        >
          <Sparkles /> {generating ? "Generating…" : "Generate now"}
        </button>
      </header>
      <div className="privacy-note">
        <Sparkles />
        <span>
          <strong>Private by construction.</strong> Statistics are computed locally. With no model
          configured, Diorna writes a deterministic report.
        </span>
        <button onClick={() => state.setModule("settings")}>Review settings</button>
      </div>
      <div className="recap-timeline">
        {periods.map((period) => {
          const start = formatISO(startOfMonth(period), {
            representation: "date",
          });
          const recap = recaps.find((entry) => entry.periodStart === start);
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
                    onClick={() => void generate(period)}
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
        <span className="eyebrow">{format(parseISODate(recap.periodStart), "MMMM yyyy")}</span>
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
        </div>
        <Narrative narrative={recap.narrative} />
        <section>
          <h2>Progress in numbers</h2>
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Daily completion</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.dailyScores}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(8)} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="score" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
          <h2>Improved / declined</h2>
          <div className="trend-columns">
            <div>
              <ArrowUpRight />
              <strong>What improved</strong>
              <p>
                {stats.tasks.completed >= stats.tasks.previousCompleted
                  ? `Task completion increased by ${stats.tasks.completed - stats.tasks.previousCompleted}.`
                  : "Your strongest habits stayed consistent."}
              </p>
            </div>
            <div>
              <ArrowDownRight />
              <strong>What declined</strong>
              <p>
                {stats.habits.worst
                  ? `${stats.habits.worst.name} finished at ${stats.habits.worst.rate}%.`
                  : "No decline was detected from available data."}
              </p>
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
        <small className={delta >= 0 ? "positive" : "negative"}>
          {delta >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}
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
        .map((line, index) => (
          <p
            key={index}
            dangerouslySetInnerHTML={{
              __html: line.replace(/^\*\*(.+?)\*\*/, "<strong>$1</strong>"),
            }}
          />
        ))}
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
    .map((part) =>
      part.startsWith("# ")
        ? `<h1>${part.slice(2)}</h1>`
        : `<p>${part.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`,
    )
    .join("");
}
function parseISODate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}
