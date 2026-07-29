import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  FolderKanban,
  LoaderCircle,
  Map as MapIcon,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Timer,
  X,
} from "lucide-react";
import { loadNativeApiKey } from "@/core/native";
import { useDiornaStore } from "@/core/store";
import { OPENROUTER_MODEL, recapSecretId } from "@/shared/recapConfig";
import type { CanvasMap, Note } from "@/shared/models";
import { applyAiPlan, undoAiChangeSet, type AiChangeSet } from "./executor";
import {
  buildAiPayload,
  requestAiPlan,
  resolveMentionedNotes,
  type AiMention,
  type AiPlanningContext,
  type AiProgressPhase,
  type AiTargetMapContext,
  type AiUsage,
} from "./planner";
import type { AiOperation, AiPlan } from "./types";

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function AiDrawer({
  open,
  initialPrompt = "",
  onClose,
}: {
  open: boolean;
  initialPrompt?: string;
  onClose: () => void;
}) {
  const state = useDiornaStore();
  const workspace = state.workspaces.find((entry) => entry.id === state.activeWorkspaceId);
  const currentMap =
    state.activeModule === "maps"
      ? state.maps.find(
          (entry) =>
            entry.id === state.selectedMapId &&
            entry.workspaceId === state.activeWorkspaceId &&
            !entry.trashedAt,
        )
      : undefined;
  const [prompt, setPrompt] = useState("");
  const [mentions, setMentions] = useState<AiMention[]>([]);
  const [plan, setPlan] = useState<AiPlan>();
  const [changes, setChanges] = useState<AiChangeSet>();
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<AiProgressPhase>();
  const [usage, setUsage] = useState<AiUsage>();
  const [targetMapId, setTargetMapId] = useState<string>();
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController>();
  const stopReasonRef = useRef<"user">();
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
    setPrompt(initialPrompt);
    setMentions([]);
    setPlan(undefined);
    setChanges(undefined);
    setError("");
    setProgress(undefined);
    setUsage(undefined);
    setTargetMapId(undefined);
  }, [historyKey, initialPrompt]);

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
    setUsage(undefined);
    const controller = new AbortController();
    abortRef.current = controller;
    stopReasonRef.current = undefined;
    try {
      const apiKey = await loadNativeApiKey(recapSecretId(state.settings.recapEndpoint));
      if (!apiKey) throw new Error("Add an OpenRouter API key in Settings → Recap first.");
      const notes = resolveMentionedNotes(mentions, state.notes, state.activeWorkspaceId);
      const targetMap = targetMapId
        ? state.maps.find(
            (entry) =>
              entry.id === targetMapId &&
              entry.workspaceId === state.activeWorkspaceId &&
              !entry.trashedAt,
          )
        : undefined;
      const context: AiPlanningContext = {
        prompt: request,
        workspaceName: workspace.name,
        now: localIsoDateTime(new Date()),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        mentions,
        notes,
        projects: state.projects.filter(
          (project) => project.workspaceId === state.activeWorkspaceId && !project.archived,
        ),
        goals: state.goals.filter(
          (goal) => goal.workspaceId === state.activeWorkspaceId && goal.status !== "cancelled",
        ),
        calendarItems: state.items.filter(
          (item) => item.workspaceId === state.activeWorkspaceId && !item.trashedAt,
        ),
        resourceNotes: state.notes.filter(
          (note) => note.workspaceId === state.activeWorkspaceId && !note.trashedAt,
        ),
        maps: state.maps.filter(
          (map) => map.workspaceId === state.activeWorkspaceId && !map.trashedAt,
        ),
        habits: state.habits.filter(
          (habit) => habit.workspaceId === state.activeWorkspaceId && !habit.archived,
        ),
        trainingActivities: state.trainingActivities.filter(
          (activity) => activity.workspaceId === state.activeWorkspaceId && !activity.archived,
        ),
        focusPriorities: state.focusPriorities
          .filter((priority) => priority.workspaceId === state.activeWorkspaceId)
          .sort((left, right) => right.date.localeCompare(left.date)),
        focusSessions: state.focusSessions
          .filter((session) => session.workspaceId === state.activeWorkspaceId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
        ...(targetMap ? { targetMap: buildTargetMapContext(targetMap, state.notes) } : {}),
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
          requestTimeoutMs: safeNumber(state.settings.aiRequestTimeoutSeconds, 30, 300, 120) * 1000,
          repairTimeoutMs: safeNumber(state.settings.aiRepairTimeoutSeconds, 15, 180, 60) * 1000,
          maxTokens: safeNumber(state.settings.aiMaxTokens, 1000, 12_000, 6500),
        },
        context,
        controller.signal,
        setProgress,
        setUsage,
      );
      setPlan(nextPlan);
      saveHistory([
        ...submittedHistory,
        { id: `${Date.now()}-ai`, role: "assistant", text: nextPlan.summary },
      ]);
    } catch (caught) {
      if ((caught as Error).name === "AbortError" && stopReasonRef.current === "user")
        setError("Generation stopped. Nothing was created.");
      else if ((caught as Error).name !== "AbortError")
        setError(caught instanceof Error ? caught.message : "Diorna AI could not prepare a plan.");
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined;
      setLoading(false);
      setProgress(undefined);
    }
  };

  const stopGeneration = () => {
    if (!abortRef.current) return;
    stopReasonRef.current = "user";
    setError("Stopping generation…");
    abortRef.current.abort();
  };

  const apply = () => {
    if (!plan) return;
    setError("");
    try {
      const nextChanges = applyAiPlan(plan, useDiornaStore.getState(), {
        mapNoteOrganization: state.settings.aiMapNoteOrganization,
        mapFolderRoot: state.settings.aiMapFolderRoot,
        ...(targetMapId ? { targetMapId } : {}),
      });
      setChanges(nextChanges);
      setPlan(undefined);
      setPrompt("");
      setMentions([]);
      setTargetMapId(undefined);
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
    if (entry.module === "notes" || entry.module === "maps" || entry.module === "projects") {
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
        {usage && usage.calls > 0 && (
          <AiUsageSummary usage={usage} maxTokens={state.settings.aiMaxTokens} />
        )}

        {plan && (
          <section className="ai-plan" aria-label="AI plan preview">
            <span className="ai-eyebrow">
              {targetMapId ? "Review before updating" : "Review before creating"}
            </span>
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
              <h3>
                {changes.updatedMaps.length ? "Updated" : "Created"} in {workspace?.name}
              </h3>
              <p>
                {changes.created.length} item(s) were applied. You can open them or undo this batch.
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
              <button
                className="button primary"
                onClick={() => {
                  setChanges(undefined);
                  setUsage(undefined);
                }}
              >
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
          {currentMap && (
            <button
              className={`ai-target-toggle ${targetMapId === currentMap.id ? "active" : ""}`}
              aria-pressed={targetMapId === currentMap.id}
              onClick={() =>
                setTargetMapId((current) => (current === currentMap.id ? undefined : currentMap.id))
              }
            >
              <MapIcon size={14} />
              <span>
                <strong>Restructure current Map</strong>
                <small>{currentMap.name} · attachments stay in place</small>
              </span>
            </button>
          )}
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
            placeholder="Create a project, note, map, calendar event or daily habit… Use / to reference a note."
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
              className={`button ${loading ? "" : "primary"}`}
              disabled={!loading && !prompt.trim()}
              onClick={() => (loading ? stopGeneration() : void generate())}
            >
              {loading ? <Square size={13} fill="currentColor" /> : <Send size={15} />}
              {loading ? "Stop generation" : "Plan"}
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

function AiUsageSummary({ usage, maxTokens }: { usage: AiUsage; maxTokens: number }) {
  const tokenText =
    usage.totalTokens > 0 ? `${usage.totalTokens.toLocaleString()} tokens` : "awaiting usage";
  const costText =
    usage.costUsd === undefined
      ? "cost pending"
      : `$${usage.costUsd < 0.01 ? usage.costUsd.toFixed(4) : usage.costUsd.toFixed(2)}`;
  return (
    <div className="ai-usage" aria-label="AI request usage">
      <span>
        {usage.calls} provider call{usage.calls === 1 ? "" : "s"}
      </span>
      <span>{tokenText}</span>
      <span>{costText}</span>
      <small>
        Limit: {safeNumber(maxTokens, 1000, 12_000, 6500).toLocaleString()} output tokens/call
      </small>
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
      icon: MapIcon,
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
  if (operation.type === "upsert_project")
    return {
      icon: FolderKanban,
      type: operation.existingProjectId ? "Project update" : "Project",
      title: operation.name,
      detail: `${operation.milestoneTitles.length} milestones · ${operation.linkedOperationIds.length} connections`,
    };
  if (operation.type === "create_habit")
    return {
      icon: Clock3,
      type: "Daily habit",
      title: operation.name,
      detail:
        operation.tracking === "quantity"
          ? `${operation.target} ${operation.unit}`
          : `${operation.activeWeekdays.length} days/week`,
    };
  if (operation.type === "create_focus_block")
    return {
      icon: Timer,
      type: operation.scheduledAt ? "Scheduled focus block" : "Focus block",
      title: operation.title,
      detail: `${operation.plannedMinutes} min · ${operation.mode.replace("-", " ")}${operation.priorityDate ? " · daily priority" : ""}`,
    };
  return {
    icon: Sparkles,
    type: "Action",
    title: "Workspace action",
    detail: "",
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

function safeNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function buildTargetMapContext(map: CanvasMap, notes: Note[]): AiTargetMapContext {
  const linkedNotes = new Map<string, { id: string; title: string; path: string }>();
  const nodes = map.nodes.map((node) => {
    const note = node.file
      ? notes.find(
          (entry) =>
            entry.workspaceId === map.workspaceId && !entry.trashedAt && entry.path === node.file,
        )
      : undefined;
    if (note) linkedNotes.set(note.id, { id: note.id, title: note.title, path: note.path });
    const title =
      note?.title ||
      node.label ||
      node.text?.trim().slice(0, 2000) ||
      node.file?.split(/[\\/]/).at(-1) ||
      node.url ||
      "Attachment";
    return {
      id: node.id,
      kind: note
        ? ("note" as const)
        : node.type === "text"
          ? ("text" as const)
          : ("attachment" as const),
      title,
      ...(note ? { mentionedNoteId: note.id } : {}),
      locked: Boolean(node.diorna?.locked),
    };
  });
  return {
    id: map.id,
    name: map.name,
    nodes,
    edges: map.edges.map((edge) => ({
      from: edge.fromNode,
      to: edge.toNode,
      ...(edge.label ? { label: edge.label } : {}),
    })),
    linkedNotes: [...linkedNotes.values()],
  };
}
