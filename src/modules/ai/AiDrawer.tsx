import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  LoaderCircle,
  Map,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { loadNativeApiKey } from "@/core/native";
import { useDiornaStore } from "@/core/store";
import { OPENROUTER_MODEL, recapSecretId } from "@/shared/recapConfig";
import { applyAiPlan, undoAiChangeSet, type AiChangeSet } from "./executor";
import {
  buildAiPayload,
  requestAiPlan,
  resolveMentionedNotes,
  type AiMention,
  type AiPlanningContext,
  type AiProgressPhase,
} from "./planner";
import type { AiOperation, AiPlan } from "./types";

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useDiornaStore();
  const workspace = state.workspaces.find((entry) => entry.id === state.activeWorkspaceId);
  const [prompt, setPrompt] = useState("");
  const [mentions, setMentions] = useState<AiMention[]>([]);
  const [plan, setPlan] = useState<AiPlan>();
  const [changes, setChanges] = useState<AiChangeSet>();
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<AiProgressPhase>();
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController>();
  const historyKey = `diorna-ai-history:${state.activeWorkspaceId}`;
  const workspaceNotes = useMemo(
    () =>
      state.notes
        .filter((note) => note.workspaceId === state.activeWorkspaceId && !note.trashedAt)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [state.activeWorkspaceId, state.notes],
  );
  const slash = prompt.match(/(?:^|\s)\/([^/\s]*)$/);
  const mentionResults = slash
    ? workspaceNotes
        .filter(
          (note) =>
            !mentions.some((mention) => mention.noteId === note.id) &&
            note.title.toLocaleLowerCase().includes(slash[1]!.toLocaleLowerCase()),
        )
        .slice(0, 6)
    : [];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(historyKey);
      setHistory(saved ? (JSON.parse(saved) as ChatEntry[]) : []);
    } catch {
      setHistory([]);
    }
    setPrompt("");
    setMentions([]);
    setPlan(undefined);
    setChanges(undefined);
    setError("");
    setProgress(undefined);
  }, [historyKey]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const saveHistory = (next: ChatEntry[]) => {
    const limited = next.slice(-20);
    setHistory(limited);
    localStorage.setItem(historyKey, JSON.stringify(limited));
  };

  const selectMention = (noteId: string, title: string) => {
    setPrompt((value) =>
      value.replace(/(^|\s)\/[^/\s]*$/, (_match, prefix: string) => `${prefix}@${title} `),
    );
    setMentions((current) => [...current, { noteId, title }]);
  };

  const generate = async () => {
    const request = prompt.trim();
    if (!request || !workspace) return;
    setLoading(true);
    setProgress("preparing");
    setError("");
    setPlan(undefined);
    setChanges(undefined);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const apiKey = await loadNativeApiKey(recapSecretId(state.settings.recapEndpoint));
      if (!apiKey) throw new Error("Add an OpenRouter API key in Settings → Recap first.");
      const notes = resolveMentionedNotes(mentions, state.notes, state.activeWorkspaceId);
      const context: AiPlanningContext = {
        prompt: request,
        workspaceName: workspace.name,
        now: localIsoDateTime(new Date()),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        mentions,
        notes,
      };
      const provider = providerHost(state.settings.recapEndpoint);
      if (!state.settings.recapConsentedProviders.includes(provider)) {
        const accepted = window.confirm(
          `Diorna will send exactly the following payload to ${provider}:\n\n${JSON.stringify(
            buildAiPayload(context),
            null,
            2,
          )}\n\nContinue?`,
        );
        if (!accepted) return;
        state.updateSettings({
          recapConsentedProviders: [...state.settings.recapConsentedProviders, provider],
        });
      }
      const submittedHistory: ChatEntry[] = [
        ...history,
        { id: `${Date.now()}-user`, role: "user", text: request },
      ];
      saveHistory(submittedHistory);
      const nextPlan = await requestAiPlan(
        {
          endpoint: state.settings.recapEndpoint,
          model: state.settings.recapModel || OPENROUTER_MODEL,
          apiKey,
        },
        context,
        controller.signal,
        setProgress,
      );
      setPlan(nextPlan);
      saveHistory([
        ...submittedHistory,
        { id: `${Date.now()}-ai`, role: "assistant", text: nextPlan.summary },
      ]);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError")
        setError(caught instanceof Error ? caught.message : "Diorna AI could not prepare a plan.");
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined;
      setLoading(false);
      setProgress(undefined);
    }
  };

  const apply = () => {
    if (!plan) return;
    setError("");
    try {
      const nextChanges = applyAiPlan(plan, useDiornaStore.getState());
      setChanges(nextChanges);
      setPlan(undefined);
      setPrompt("");
      setMentions([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The plan could not be applied.");
    }
  };

  const undo = () => {
    if (!changes) return;
    undoAiChangeSet(useDiornaStore.getState(), changes);
    setChanges(undefined);
  };

  const openCreated = (entry: AiChangeSet["created"][number]) => {
    const current = useDiornaStore.getState();
    if (entry.module === "notes" || entry.module === "maps") {
      current.openTab({ module: entry.module, title: entry.title, entityId: entry.id });
    } else {
      current.setModule(entry.module);
      if (entry.module === "calendar") current.selectCalendarItem(entry.id);
      if (entry.module === "daily") current.selectDailyHabit(entry.id);
    }
    onClose();
  };

  if (!open) return null;
  return (
    <section className="ai-drawer" role="region" aria-label="Diorna AI">
      <header className="ai-drawer-header">
        <div>
          <span className="ai-eyebrow">
            <Sparkles size={13} /> Kimi K2.6
          </span>
          <h2>Diorna AI</h2>
          <p>Creates in {workspace?.name ?? "this workspace"} only.</p>
        </div>
        <button className="icon-button" aria-label="Close Diorna AI" onClick={onClose}>
          <X size={17} />
        </button>
      </header>

      <div className="ai-drawer-body">
        {!plan && !changes && history.length > 0 && (
          <div className="ai-history" aria-label="Recent conversation">
            {history.slice(-6).map((entry) => (
              <div className={`ai-message ${entry.role}`} key={entry.id}>
                {entry.text}
              </div>
            ))}
          </div>
        )}

        {loading && progress && <AiProgress phase={progress} />}

        {plan && (
          <section className="ai-plan" aria-label="AI plan preview">
            <span className="ai-eyebrow">Review before creating</span>
            <h3>{plan.summary}</h3>
            {plan.assumptions.length > 0 && (
              <div className="ai-assumptions">
                <strong>Assumptions</strong>
                <ul>
                  {plan.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="ai-operation-list">
              {plan.operations.map((operation) => (
                <OperationPreview operation={operation} key={operation.id} />
              ))}
            </div>
            <div className="button-row">
              <button className="button" onClick={() => setPlan(undefined)}>
                Edit request
              </button>
              <button className="button primary" onClick={apply}>
                <Check size={15} /> Apply {plan.operations.length} action
                {plan.operations.length === 1 ? "" : "s"}
              </button>
            </div>
          </section>
        )}

        {changes && (
          <section className="ai-success" role="status">
            <Check size={22} />
            <div>
              <h3>Created in {workspace?.name}</h3>
              <p>
                {changes.created.length} item(s) were added. You can open them or undo this batch.
              </p>
            </div>
            <div className="ai-created-list">
              {changes.created.map((entry) => (
                <button key={`${entry.module}-${entry.id}`} onClick={() => openCreated(entry)}>
                  <span>{entry.title}</span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
            <div className="button-row">
              <button className="button" onClick={undo}>
                <RotateCcw size={14} /> Undo this batch
              </button>
              <button className="button primary" onClick={() => setChanges(undefined)}>
                New request
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="ai-error" role="alert">
            {error}
          </div>
        )}
      </div>

      {!plan && !changes && (
        <footer className="ai-composer">
          {mentions.length > 0 && (
            <div className="ai-mention-chips" aria-label="Referenced notes">
              {mentions.map((mention) => (
                <button
                  key={mention.noteId}
                  title="Remove reference"
                  onClick={() =>
                    setMentions((current) =>
                      current.filter((entry) => entry.noteId !== mention.noteId),
                    )
                  }
                >
                  <FileText size={12} />
                  {mention.title}
                  <X size={11} />
                </button>
              ))}
            </div>
          )}
          {slash && (
            <div className="ai-mention-menu" role="listbox" aria-label="Mention a note">
              <small>Reference a note</small>
              {mentionResults.map((note) => (
                <button
                  role="option"
                  aria-selected="false"
                  key={note.id}
                  onClick={() => selectMention(note.id, note.title)}
                >
                  <FileText size={14} />
                  <span>{note.title}</span>
                </button>
              ))}
              {!mentionResults.length && <p>No matching note in this workspace.</p>}
            </div>
          )}
          <textarea
            aria-label="Ask Diorna AI"
            placeholder="Create a note, map, calendar event or daily habit… Use / to reference a note."
            value={prompt}
            disabled={loading}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void generate();
            }}
          />
          <div className="ai-composer-actions">
            <small>Review required · Ctrl+Enter to send</small>
            <button
              className="button primary"
              disabled={!prompt.trim() || loading}
              onClick={() => void generate()}
            >
              {loading ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}
              {loading ? "Working…" : "Plan"}
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}

const progressSteps: Array<{ phase: AiProgressPhase; label: string }> = [
  { phase: "preparing", label: "Reading your request and selected notes" },
  { phase: "requesting", label: "Asking Kimi K2.6 for a structured plan" },
  { phase: "validating", label: "Checking actions and workspace references" },
  { phase: "repairing", label: "Repairing an incomplete response" },
  { phase: "revalidating", label: "Checking the repaired plan" },
];

function AiProgress({ phase }: { phase: AiProgressPhase }) {
  const [elapsed, setElapsed] = useState(0);
  const currentIndex = progressSteps.findIndex((step) => step.phase === phase);
  useEffect(() => {
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [phase]);
  return (
    <div className="ai-progress-message" role="status" aria-live="polite">
      <div className="ai-progress-title">
        <LoaderCircle className="spin" size={16} />
        <strong>Building your plan</strong>
        <span>{elapsed}s</span>
      </div>
      <ol>
        {progressSteps.map((step, index) => {
          const state =
            index < currentIndex ? "complete" : index === currentIndex ? "active" : "waiting";
          return (
            <li className={state} key={step.phase}>
              <span>{state === "complete" ? <Check size={11} /> : index + 1}</span>
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function OperationPreview({ operation }: { operation: AiOperation }) {
  const presentation = operationPresentation(operation);
  const Icon = presentation.icon;
  return (
    <article className="ai-operation">
      <Icon size={17} />
      <div>
        <small>{presentation.type}</small>
        <strong>{presentation.title}</strong>
        <span>{presentation.detail}</span>
      </div>
    </article>
  );
}

function operationPresentation(operation: AiOperation) {
  if (operation.type === "create_note")
    return {
      icon: FileText,
      type: "Note",
      title: operation.title,
      detail: `${operation.bodyMarkdown.trim().split(/\s+/).filter(Boolean).length} words`,
    };
  if (operation.type === "create_map")
    return {
      icon: Map,
      type: "Map",
      title: operation.name,
      detail: `${operation.nodes.length} nodes · ${operation.edges.length} links`,
    };
  if (operation.type === "create_calendar_item")
    return {
      icon: CalendarDays,
      type: operation.kind === "event" ? "Calendar event" : "Calendar task",
      title: operation.title,
      detail: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: operation.allDay ? undefined : "short",
      }).format(new Date(operation.startAt)),
    };
  return {
    icon: Clock3,
    type: "Daily habit",
    title: operation.name,
    detail:
      operation.tracking === "quantity"
        ? `${operation.target} ${operation.unit}`
        : `${operation.activeWeekdays.length} days/week`,
  };
}

function providerHost(endpoint: string): string {
  try {
    return new URL(endpoint).hostname.toLocaleLowerCase();
  } catch {
    return endpoint;
  }
}

function localIsoDateTime(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const two = (value: number) => String(Math.abs(value)).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(
    date.getHours(),
  )}:${two(date.getMinutes())}:${two(date.getSeconds())}${sign}${two(
    Math.floor(Math.abs(offset) / 60),
  )}:${two(Math.abs(offset) % 60)}`;
}
