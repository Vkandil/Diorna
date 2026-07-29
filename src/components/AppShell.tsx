import { lazy, Suspense, useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Columns2,
  Dumbbell,
  FolderKanban,
  Grid3X3,
  Home,
  Map,
  Menu,
  NotebookText,
  PanelRight,
  Pin,
  Plus,
  Rows2,
  Search,
  Settings,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, isSameDay, startOfDay, startOfYear } from "date-fns";
import { useDiornaStore } from "@/core/store";
import type { ModuleId } from "@/shared/models";
import type { PaneLayoutNode } from "@/core/store";
import { CommandPalette } from "./CommandPalette";
import { QuickCapture } from "./QuickCapture";
import { HomeView } from "@/modules/home/HomeView";
import {
  convertFirstUnlinkedMention,
  extractOutline,
  findBacklinks,
  findUnlinkedMentions,
} from "@/modules/notes/logic";
import { listenForReminderActions, scheduleNativeReminders } from "@/modules/calendar/reminders";
import { occurrencesBetween, type ItemOccurrence } from "@/modules/calendar/recurrence";
import { dateKey, habitStatistics } from "@/modules/daily/logic";
import { matchesShortcut } from "@/core/shortcuts";
import { installDownloadedUpdate, type UpdateState } from "@/core/updater";
import { getNativeVaultInfo, hasNativeApiKey, takeNativeOpenRequests } from "@/core/native";
import { recapSecretId } from "@/shared/recapConfig";
import { BrandLogo } from "./BrandLogo";
import { sessionDurationMinutes, sessionVolume } from "@/modules/training/logic";
import { projectProgress, projectTaskStats } from "@/modules/projects/logic";
import {
  findFocusStudioSession,
  focusElapsedSeconds,
  focusTimerState,
  formatFocusTimer,
} from "@/modules/focus/logic";
import { useFocusClock } from "@/modules/focus/clock";

const NotesView = lazy(() =>
  import("@/modules/notes/NotesView").then((module) => ({
    default: module.NotesView,
  })),
);
const MapsView = lazy(() =>
  import("@/modules/maps/MapsView").then((module) => ({
    default: module.MapsView,
  })),
);
const CalendarView = lazy(() =>
  import("@/modules/calendar/CalendarView").then((module) => ({
    default: module.CalendarView,
  })),
);
const DailyView = lazy(() =>
  import("@/modules/daily/DailyView").then((module) => ({
    default: module.DailyView,
  })),
);
const TrainingView = lazy(() =>
  import("@/modules/training/TrainingView").then((module) => ({
    default: module.TrainingView,
  })),
);
const ProjectsView = lazy(() =>
  import("@/modules/projects/ProjectsView").then((module) => ({
    default: module.ProjectsView,
  })),
);
const FocusView = lazy(() =>
  import("@/modules/focus/FocusView").then((module) => ({
    default: module.FocusView,
  })),
);
const RecapView = lazy(() =>
  import("@/modules/recap/RecapView").then((module) => ({
    default: module.RecapView,
  })),
);
const SettingsView = lazy(() =>
  import("@/modules/settings/SettingsView").then((module) => ({
    default: module.SettingsView,
  })),
);
const ComponentLibrary = lazy(() =>
  import("@/modules/settings/ComponentLibrary").then((module) => ({
    default: module.ComponentLibrary,
  })),
);
const AiDrawer = lazy(() =>
  import("@/modules/ai/AiDrawer").then((module) => ({
    default: module.AiDrawer,
  })),
);

const modules: Array<{
  id: ModuleId;
  label: string;
  icon: typeof Home;
  shortcut: string;
}> = [
  { id: "notes", label: "Notes", icon: NotebookText, shortcut: "1" },
  { id: "maps", label: "Maps", icon: Map, shortcut: "2" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, shortcut: "3" },
  { id: "daily", label: "Daily", icon: Grid3X3, shortcut: "4" },
  { id: "training", label: "Training", icon: Dumbbell, shortcut: "5" },
  { id: "recap", label: "Recap", icon: Sparkles, shortcut: "6" },
  { id: "projects", label: "Projects", icon: FolderKanban, shortcut: "7" },
  { id: "focus", label: "Focus", icon: Timer, shortcut: "8" },
];

export function AppShell() {
  const { t } = useTranslation();
  const state = useDiornaStore();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [draggedTab, setDraggedTab] = useState<string>();
  const [coachVisible, setCoachVisible] = useState(false);
  const [toast, setToast] = useState<string>();
  const [updateState, setUpdateState] = useState<UpdateState>();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeedPrompt, setAiSeedPrompt] = useState("");
  const [aiAvailable, setAiAvailable] = useState(false);
  const sidebarWidth = state.sidebarWidth;
  const setSidebarWidth = state.setSidebarWidth;
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId)!;
  const showRightPanel = state.activeModule !== "home" && state.rightPanelOpen;
  useEffect(() => {
    const openAi = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt ?? "";
      if (prompt) setAiSeedPrompt(prompt);
      if (sidebarWidth < 360) setSidebarWidth(360);
      setAiOpen(true);
    };
    window.addEventListener("diorna-open-ai", openAi);
    return () => window.removeEventListener("diorna-open-ai", openAi);
  }, [sidebarWidth, setSidebarWidth]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void hasNativeApiKey(recapSecretId(state.settings.recapEndpoint))
        .then((available) => active && setAiAvailable(available))
        .catch(() => active && setAiAvailable(false));
    };
    refresh();
    window.addEventListener("diorna-api-key-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("diorna-api-key-changed", refresh);
    };
  }, [state.settings.recapEndpoint]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const keymap = state.settings.keymap;
      if (matchesShortcut(event, keymap.commandPalette)) {
        event.preventDefault();
        state.setCommandPaletteOpen(true);
      }
      if (matchesShortcut(event, keymap.toggleSidebar)) {
        event.preventDefault();
        state.toggleSidebar();
      }
      if (matchesShortcut(event, keymap.closeTab)) {
        event.preventDefault();
        state.closeTab(state.activeTabId);
      }
      if (matchesShortcut(event, keymap.quickCapture)) {
        event.preventDefault();
        setCaptureOpen(true);
      }
      const workspaceIndex = state.workspaces.findIndex((_, index) =>
        matchesShortcut(event, keymap[`workspace${index + 1}`]),
      );
      if (workspaceIndex >= 0) {
        event.preventDefault();
        const next = state.workspaces[workspaceIndex];
        if (next) state.setWorkspace(next.id);
      }
      const targetModule = modules.find(({ id }) => matchesShortcut(event, keymap[id]));
      if (targetModule) {
        event.preventDefault();
        state.setModule(targetModule.id);
      }
      if (matchesShortcut(event, keymap.nextRecentTab)) {
        event.preventDefault();
        const nextId = state.recentTabIds.find((id) => id !== state.activeTabId);
        const next = state.tabs.find((tab) => tab.id === nextId);
        if (next) state.setActiveTab(next.id);
      }
      if (matchesShortcut(event, keymap.splitHorizontal)) {
        event.preventDefault();
        state.splitPane("horizontal");
      }
      if (matchesShortcut(event, keymap.splitVertical)) {
        event.preventDefault();
        state.splitPane("vertical");
      }
      if (matchesShortcut(event, keymap.toggleContext)) {
        event.preventDefault();
        state.toggleRightPanel();
      }
      if (matchesShortcut(event, keymap.home)) {
        event.preventDefault();
        state.setModule("home");
      }
      if (matchesShortcut(event, keymap.settings)) {
        event.preventDefault();
        state.setModule("settings");
      }
      if (matchesShortcut(event, keymap.newNote)) {
        event.preventDefault();
        const note = state.addNote();
        state.openTab({ module: "notes", title: note.title, entityId: note.id });
      }
      if (matchesShortcut(event, keymap.newTask)) {
        event.preventDefault();
        state.setModule("calendar");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state]);
  useEffect(
    () =>
      scheduleNativeReminders(
        state.items.filter((item) => item.workspaceId === state.activeWorkspaceId),
      ),
    [state.activeWorkspaceId, state.items],
  );
  useEffect(() => {
    let dispose: () => void = () => undefined;
    let cancelled = false;
    void listenForReminderActions((itemId) => {
      const current = useDiornaStore.getState();
      const item = current.items.find((entry) => entry.id === itemId && !entry.trashedAt);
      if (!item) return;
      localStorage.setItem("diorna-open-calendar-item", item.id);
      if (item.workspaceId !== current.activeWorkspaceId) current.setWorkspace(item.workspaceId);
      useDiornaStore.getState().setModule("calendar");
    }).then((cleanup) => {
      if (cancelled) cleanup();
      else dispose = cleanup;
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);
  useEffect(() => {
    const openRequestedFiles = async () => {
      const requested = await takeNativeOpenRequests();
      if (!requested.length) return;
      const vault = await getNativeVaultInfo();
      if (!vault) return;
      const normalize = (value: string) => value.replace(/\\/g, "/").toLocaleLowerCase();
      const current = useDiornaStore.getState();
      for (const request of requested) {
        if (request === "--quick-capture") {
          setCaptureOpen(true);
          continue;
        }
        if (request === "--new-note") {
          const note = useDiornaStore.getState().addNote();
          useDiornaStore.getState().openTab({
            module: "notes",
            title: note.title,
            entityId: note.id,
          });
          continue;
        }
        if (request === "--today") {
          useDiornaStore.getState().setModule("home");
          continue;
        }
        const absolute = normalize(request);
        const entity = [...current.notes, ...current.maps].find((entry) => {
          const workspace = current.workspaces.find((item) => item.id === entry.workspaceId);
          if (!workspace) return false;
          return normalize(`${vault.path}/${workspace.folderName}/${entry.path}`) === absolute;
        });
        if (!entity) {
          window.dispatchEvent(
            new CustomEvent("diorna-toast", {
              detail: `The requested file is outside this vault: ${request}`,
            }),
          );
          continue;
        }
        if (entity.workspaceId !== current.activeWorkspaceId)
          current.setWorkspace(entity.workspaceId);
        const next = useDiornaStore.getState();
        const module = request.toLocaleLowerCase().endsWith(".canvas") ? "maps" : "notes";
        next.openTab({
          module,
          title: "title" in entity ? entity.title : entity.name,
          entityId: entity.id,
        });
      }
    };
    void openRequestedFiles();
    const timer = window.setInterval(() => void openRequestedFiles(), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (["home", "settings", "components"].includes(state.activeModule)) {
      setCoachVisible(false);
      return;
    }
    setCoachVisible(localStorage.getItem(`diorna-coach-${state.activeModule}`) !== "seen");
  }, [state.activeModule]);
  useEffect(() => {
    let timer = 0;
    const showToast = (event: Event) => {
      setToast((event as CustomEvent<string>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(undefined), 4_000);
    };
    window.addEventListener("diorna-toast", showToast);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("diorna-toast", showToast);
    };
  }, []);
  useEffect(() => {
    const openCapture = () => setCaptureOpen(true);
    window.addEventListener("diorna-open-quick-capture", openCapture);
    return () => window.removeEventListener("diorna-open-quick-capture", openCapture);
  }, []);
  useEffect(() => {
    const onUpdate = (event: Event) => {
      const next = (event as CustomEvent<UpdateState>).detail;
      setUpdateState(next);
      if (next.status === "current") {
        setToast("Diorna is up to date.");
        window.setTimeout(() => setToast(undefined), 4_000);
      }
    };
    window.addEventListener("diorna-update-state", onUpdate);
    return () => window.removeEventListener("diorna-update-state", onUpdate);
  }, []);
  return (
    <div
      className={`app-shell ${state.sidebarOpen ? "" : "sidebar-collapsed"} ${showRightPanel ? "" : "right-collapsed"} ${state.activeModule === "maps" ? "map-module-active" : ""}`}
      style={
        {
          "--sidebar": `${state.sidebarWidth}px`,
          "--right-panel": `${state.settings.rightPanelWidth}px`,
        } as React.CSSProperties
      }
    >
      <aside className="sidebar">
        <div className="workspace-switcher">
          <BrandLogo className="sidebar-brand-logo" />
          <span className="workspace-dot" style={{ background: workspace.color }} />
          <select
            aria-label="Workspace"
            value={workspace.id}
            onChange={(event) => {
              if (event.target.value === "__new__") {
                const name = window.prompt("New workspace name");
                if (name?.trim()) state.addWorkspace(name.trim(), "#3F6495");
                return;
              }
              state.setWorkspace(event.target.value);
            }}
          >
            {state.workspaces.map((entry) => (
              <option value={entry.id} key={entry.id}>
                {entry.name}
              </option>
            ))}
            <option value="__new__">New workspace…</option>
          </select>
          <ChevronDown size={14} />
        </div>
        {aiOpen ? (
          <Suspense fallback={<div className="module-loading">Loading Diorna AI…</div>}>
            <AiDrawer
              open
              initialPrompt={aiSeedPrompt}
              onClose={() => {
                setAiOpen(false);
                setAiSeedPrompt("");
              }}
            />
          </Suspense>
        ) : (
          <>
            <nav className="module-rail" aria-label="Modules">
              <button
                className={state.activeModule === "home" ? "active" : ""}
                onClick={() => state.setModule("home")}
              >
                <Home size={17} />
                <span>{t("Home")}</span>
              </button>
              {modules.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={state.activeModule === id ? "active" : ""}
                  onClick={() => state.setModule(id)}
                >
                  <Icon size={17} />
                  <span>{t(label)}</span>
                  <kbd>{(state.settings.keymap[id] ?? "").replaceAll("+", " ")}</kbd>
                </button>
              ))}
            </nav>
            <ContextSidebar module={state.activeModule} />
          </>
        )}
        <div className="sidebar-bottom">
          <FocusMiniPlayer />
          {aiAvailable && (
            <button
              className={aiOpen ? "active" : ""}
              aria-pressed={aiOpen}
              onClick={() => {
                const next = !aiOpen;
                if (next && state.sidebarWidth < 360) state.setSidebarWidth(360);
                setAiOpen(next);
              }}
            >
              <Sparkles size={16} />
              <span>Diorna AI</span>
            </button>
          )}
          <button
            onClick={() => {
              setAiOpen(false);
              state.setModule("settings");
            }}
          >
            <Settings size={16} />
            <span>{t("Settings")}</span>
          </button>
          <div className="vault-status">
            <i /> Documents\Diorna
          </div>
        </div>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={190}
          aria-valuemax={420}
          aria-valuenow={state.sidebarWidth}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") state.setSidebarWidth(state.sidebarWidth - 10);
            if (event.key === "ArrowRight") state.setSidebarWidth(state.sidebarWidth + 10);
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              state.setSidebarWidth(event.clientX);
          }}
        />
      </aside>
      <main className="workspace-area">
        <header className="titlebar">
          <button className="icon-button" aria-label="Toggle sidebar" onClick={state.toggleSidebar}>
            <Menu size={17} />
          </button>
          <div className="titlebar-spacer" />
          <span className="pane-count">
            {state.panes.length} pane{state.panes.length === 1 ? "" : "s"}
          </span>
          <button
            className="icon-button"
            aria-label="Open command palette"
            onClick={() => state.setCommandPaletteOpen(true)}
          >
            <Search size={16} />
          </button>
          {state.activeModule !== "home" && (
            <button
              className="icon-button"
              aria-label="Toggle context panel"
              onClick={state.toggleRightPanel}
            >
              <PanelRight size={16} />
            </button>
          )}
        </header>
        <div className="content-frame">
          {coachVisible && (
            <div className="coach-mark" role="status">
              <Sparkles size={16} />
              <span>{coachCopy[state.activeModule]}</span>
              <button
                className="button"
                onClick={() => {
                  localStorage.setItem(`diorna-coach-${state.activeModule}`, "seen");
                  setCoachVisible(false);
                }}
              >
                Got it
              </button>
            </div>
          )}
          <Suspense fallback={<div className="module-loading">Loading…</div>}>
            <PaneLayout
              node={state.paneLayout}
              draggedTab={draggedTab}
              setDraggedTab={setDraggedTab}
            />
          </Suspense>
        </div>
      </main>
      <aside
        className={`right-panel ${state.activeModule === "home" ? "right-panel-unavailable" : ""}`}
      >
        <div
          className="right-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize context panel"
          aria-valuemin={220}
          aria-valuemax={520}
          aria-valuenow={state.settings.rightPanelWidth}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft")
              state.updateSettings({
                rightPanelWidth: Math.min(520, state.settings.rightPanelWidth + 10),
              });
            if (event.key === "ArrowRight")
              state.updateSettings({
                rightPanelWidth: Math.max(220, state.settings.rightPanelWidth - 10),
              });
          }}
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            state.updateSettings({
              rightPanelWidth: Math.max(220, Math.min(520, window.innerWidth - event.clientX)),
            });
          }}
        />
        <RightPanel module={state.activeModule} />
      </aside>
      {state.commandPaletteOpen && <CommandPalette />}
      {captureOpen && <QuickCapture onClose={() => setCaptureOpen(false)} />}
      {toast && (
        <div className="app-toast" role="status">
          {toast}
        </div>
      )}
      {updateState?.status === "ready" && (
        <section
          className="update-prompt"
          role="dialog"
          aria-modal="true"
          aria-label="Update ready"
        >
          <strong>Diorna {updateState.version} is ready</strong>
          <p>The signed update has been downloaded. Restart to install it now.</p>
          {updateState.notes && <small>{updateState.notes}</small>}
          <div className="button-row">
            <button className="button" onClick={() => setUpdateState(undefined)}>
              Later
            </button>
            <button className="button primary" onClick={() => void installDownloadedUpdate()}>
              Restart and install
            </button>
          </div>
        </section>
      )}
      {updateState?.status === "downloading" && (
        <div className="update-progress" role="status">
          Downloading Diorna {updateState.version}
          {updateState.progress === null ? "…" : ` · ${updateState.progress}%`}
        </div>
      )}
    </div>
  );
}

function PaneLayout({
  node,
  draggedTab,
  setDraggedTab,
}: {
  node: PaneLayoutNode;
  draggedTab: string | undefined;
  setDraggedTab: (id?: string) => void;
}) {
  const state = useDiornaStore();
  if (node.kind === "pane")
    return (
      <WorkspacePane paneId={node.paneId} draggedTab={draggedTab} setDraggedTab={setDraggedTab} />
    );
  const horizontal = node.direction === "horizontal";
  return (
    <div className={`pane-split ${node.direction}`} data-split-id={node.id}>
      <div className="pane-split-child" style={{ flexBasis: `${node.ratio * 100}%` }}>
        <PaneLayout node={node.first} draggedTab={draggedTab} setDraggedTab={setDraggedTab} />
      </div>
      <div
        className="pane-divider"
        role="separator"
        aria-label={`Resize ${horizontal ? "horizontal" : "vertical"} split`}
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(node.ratio * 100)}
        tabIndex={0}
        onKeyDown={(event) => {
          const decrease = horizontal ? event.key === "ArrowLeft" : event.key === "ArrowUp";
          const increase = horizontal ? event.key === "ArrowRight" : event.key === "ArrowDown";
          if (decrease || increase) {
            event.preventDefault();
            state.setSplitRatio(node.id, node.ratio + (increase ? 0.03 : -0.03));
          }
        }}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const parent = event.currentTarget.parentElement;
          if (!parent) return;
          const rect = parent.getBoundingClientRect();
          const ratio = horizontal
            ? (event.clientX - rect.left) / rect.width
            : (event.clientY - rect.top) / rect.height;
          state.setSplitRatio(node.id, ratio);
        }}
      />
      <div className="pane-split-child" style={{ flexBasis: `${(1 - node.ratio) * 100}%` }}>
        <PaneLayout node={node.second} draggedTab={draggedTab} setDraggedTab={setDraggedTab} />
      </div>
    </div>
  );
}

function WorkspacePane({
  paneId,
  draggedTab,
  setDraggedTab,
}: {
  paneId: string;
  draggedTab: string | undefined;
  setDraggedTab: (id?: string) => void;
}) {
  const state = useDiornaStore();
  const pane = state.panes.find((entry) => entry.id === paneId);
  if (!pane) return null;
  const tabs = pane.tabIds
    .map((id) => state.tabs.find((tab) => tab.id === id))
    .filter((tab) => tab !== undefined);
  const active = tabs.find((tab) => tab.id === pane.activeTabId) ?? tabs[0];
  if (!active) return null;
  return (
    <section
      className={`workspace-pane ${state.activePaneId === paneId ? "active" : ""}`}
      onPointerDown={() => state.setActivePane(paneId)}
    >
      <header className="pane-tabbar">
        <div className="tab-strip">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab ${active.id === tab.id ? "active" : ""}`}
              onClick={() => state.setActiveTab(tab.id)}
              onDoubleClick={() => state.setTabPinned(tab.id, !tab.pinned)}
              draggable
              onDragStart={() => setDraggedTab(tab.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedTab) state.reorderTabs(draggedTab, tab.id);
                setDraggedTab(undefined);
              }}
              title="Drag to reorder · double-click to pin"
            >
              {tab.pinned && <Pin size={11} aria-label="Pinned" />}
              <span>{tab.title}</span>
              {!tab.pinned && (
                <X
                  size={13}
                  onClick={(event) => {
                    event.stopPropagation();
                    state.closeTab(tab.id);
                  }}
                />
              )}
            </button>
          ))}
        </div>
        <div className="pane-actions">
          <button
            className="icon-button"
            aria-label="Split pane right"
            title="Split right"
            disabled={state.panes.length >= 4}
            onClick={() => state.splitPane("horizontal")}
          >
            <Columns2 size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="Split pane down"
            title="Split down"
            disabled={state.panes.length >= 4}
            onClick={() => state.splitPane("vertical")}
          >
            <Rows2 size={14} />
          </button>
          {state.panes.length > 1 && (
            <button
              className="icon-button"
              aria-label="Close pane"
              title="Close pane"
              onClick={() => state.closePane(paneId)}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>
      <div className="pane-content">{renderModule(active.module, active.id)}</div>
    </section>
  );
}

const coachCopy: Partial<Record<ModuleId, string>> = {
  notes: "Type / for blocks and [[ to link ideas. Everything saves automatically.",
  maps: "Double-click the canvas to add an idea; drag handles to connect it.",
  calendar: "Use quick add in plain language, then drag items to reschedule.",
  daily: "Use arrow keys to move and Space or digits to enter a whole day quickly.",
  training: "Repeat your last session, then adjust only what changed.",
  projects: "Start with an outcome, then connect tasks, knowledge and recurring routines.",
  focus: "Choose one observable outcome, protect the time, then close the loop with a review.",
  recap: "Every number is calculated locally; a model is optional and only improves prose.",
};

function renderModule(module: ModuleId, tabId?: string) {
  switch (module) {
    case "notes":
      return <NotesView tabId={tabId} />;
    case "maps":
      return <MapsView tabId={tabId} />;
    case "calendar":
      return <CalendarView />;
    case "daily":
      return <DailyView />;
    case "training":
      return <TrainingView />;
    case "projects":
      return <ProjectsView {...(tabId ? { tabId } : {})} />;
    case "focus":
      return <FocusView />;
    case "recap":
      return <RecapView />;
    case "settings":
      return <SettingsView />;
    case "components":
      return <ComponentLibrary />;
    default:
      return <HomeView />;
  }
}

function FocusMiniPlayer() {
  const state = useDiornaStore();
  const session = findFocusStudioSession(
    state.focusSessions.filter((entry) => entry.workspaceId === state.activeWorkspaceId),
  );
  const now = useFocusClock(session?.status === "running");
  if (!session) return null;
  const timer = focusTimerState(session, now);
  return (
    <section
      className="focus-mini-player"
      aria-label="Active focus session"
      data-focus-session-id={session.id}
      data-focus-time={timer.displaySeconds}
      data-focus-phase={timer.overtime ? "overtime" : "remaining"}
    >
      <button className="focus-mini-main" onClick={() => state.setModule("focus")}>
        <span className={session.status}>
          <Timer size={14} />
        </span>
        <i>
          <strong>{session.title}</strong>
          <small>
            {session.status === "paused" ? "Paused · " : ""}
            {timer.overtime ? "+" : ""}
            {formatFocusTimer(timer.displaySeconds)}
          </small>
        </i>
      </button>
      <button
        className="icon-button"
        aria-label={session.status === "running" ? "Pause focus" : "Resume focus"}
        onClick={() =>
          session.status === "running"
            ? state.pauseFocusSession(session.id)
            : state.resumeFocusSession(session.id)
        }
      >
        {session.status === "running" ? "Ⅱ" : "▶"}
      </button>
    </section>
  );
}

function FocusContextPanel() {
  const state = useDiornaStore();
  const today = format(new Date(), "yyyy-MM-dd");
  const sessions = state.focusSessions
    .filter(
      (session) =>
        session.workspaceId === state.activeWorkspaceId &&
        session.status === "completed" &&
        session.endedAt?.slice(0, 10) === today,
    )
    .sort((left, right) => right.endedAt!.localeCompare(left.endedAt!));
  const active = state.focusSessions.find(
    (session) =>
      session.workspaceId === state.activeWorkspaceId &&
      ["running", "paused"].includes(session.status),
  );
  const priorities = state.focusPriorities.filter(
    (priority) => priority.workspaceId === state.activeWorkspaceId && priority.date === today,
  );
  return (
    <section className="focus-context-panel">
      {active && (
        <>
          <h3>Current session</h3>
          <button className="focus-context-active" onClick={() => state.setModule("focus")}>
            <Timer />
            <span>
              <strong>{active.title}</strong>
              <small>
                {active.status} · {active.plannedMinutes} min planned
              </small>
            </span>
          </button>
        </>
      )}
      <h3>Today</h3>
      <dl>
        <dt>Priorities</dt>
        <dd>
          {priorities.filter((priority) => priority.completedAt).length}/{priorities.length}
        </dd>
        <dt>Sessions</dt>
        <dd>{sessions.length}</dd>
        <dt>Protected time</dt>
        <dd>
          {sessions.reduce(
            (sum, session) => sum + Math.round(focusElapsedSeconds(session) / 60),
            0,
          )}{" "}
          min
        </dd>
        <dt>Distractions</dt>
        <dd>{sessions.reduce((sum, session) => sum + session.distractions.length, 0)}</dd>
      </dl>
      <h3>Completed blocks</h3>
      {sessions.slice(0, 5).map((session) => (
        <button className="outline-link" key={session.id} onClick={() => state.setModule("focus")}>
          <strong>{session.title}</strong>
          <small>
            {Math.round(focusElapsedSeconds(session) / 60)} min ·{" "}
            {session.review?.focusRating ?? "—"}/5
          </small>
        </button>
      ))}
      {!sessions.length && <div className="empty-mini">No completed focus block today</div>}
      <button
        className="button"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("diorna-open-ai", {
              detail: {
                prompt:
                  "Review my recent focus sessions, distractions and active priorities. Suggest the best next focus block and a realistic duration.",
              },
            }),
          )
        }
      >
        <Sparkles size={14} /> Ask Diorna AI
      </button>
    </section>
  );
}

function ContextSidebar({ module }: { module: ModuleId }) {
  const state = useDiornaStore();
  const id = state.activeWorkspaceId;
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  const entries =
    module === "notes"
      ? state.notes
          .filter((item) => item.workspaceId === id && !item.trashedAt)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map((item) => ({ id: item.id, label: item.title, module: "notes" as const }))
      : module === "maps"
        ? state.maps
            .filter((item) => item.workspaceId === id && !item.trashedAt)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .map((item) => ({ id: item.id, label: item.name, module: "maps" as const }))
        : module === "projects"
          ? state.projects
              .filter(
                (item) => item.workspaceId === id && !item.archived && item.status !== "cancelled",
              )
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
              .map((item) => ({
                id: item.id,
                label: item.name,
                module: "projects" as const,
              }))
          : module === "focus"
            ? state.focusPriorities
                .filter((item) => item.workspaceId === id && item.date === dateKey(new Date()))
                .sort(
                  (left, right) =>
                    Number(Boolean(left.completedAt)) - Number(Boolean(right.completedAt)) ||
                    left.sortOrder - right.sortOrder,
                )
                .slice(0, 12)
                .map((item) => ({ id: item.id, label: item.title, module: "focus" as const }))
            : module === "daily"
              ? state.habits
                  .filter((item) => item.workspaceId === id)
                  .map((item) => ({ id: item.id, label: item.name }))
              : module === "training"
                ? state.trainingActivities
                    .filter((item) => item.workspaceId === id && !item.archived)
                    .map((item) => ({ id: item.id, label: item.name }))
                : state.categories
                    .filter((item) => item.workspaceId === id)
                    .map((item) => ({ id: item.id, label: item.name }));
  const addEntry = () => {
    if (module === "notes") {
      const note = state.addNote();
      state.openTab({ module: "notes", title: note.title, entityId: note.id });
    } else if (module === "maps") {
      const map = state.addMap();
      state.openTab({ module: "maps", title: map.name, entityId: map.id });
    } else if (module === "projects") {
      const project = state.addProject({
        name: "Untitled project",
        outcome: "",
        kind: "custom",
        status: "idea",
      });
      state.openTab({ module: "projects", title: project.name, entityId: project.id });
    }
  };
  return (
    <section className="context-sidebar">
      <header>
        <span>{module === "home" ? "Workspace" : module}</span>
        <button
          aria-label={module === "notes" ? "Add note" : module === "maps" ? "Add map" : "Add"}
          disabled={module !== "notes" && module !== "maps" && module !== "projects"}
          onClick={addEntry}
        >
          <Plus size={14} />
        </button>
      </header>
      <div className="context-list">
        {entries.slice(0, 12).map((entry) => (
          <button
            key={entry.id}
            aria-current={active?.entityId === entry.id ? "page" : undefined}
            onClick={() => {
              if (
                "module" in entry &&
                (entry.module === "notes" || entry.module === "maps" || entry.module === "projects")
              )
                state.openTab({ module: entry.module, title: entry.label, entityId: entry.id });
              else if ("module" in entry && entry.module === "focus") state.setModule("focus");
            }}
          >
            {entry.label}
          </button>
        ))}
        {!entries.length && <div className="empty-mini">Nothing here yet.</div>}
      </div>
    </section>
  );
}

function RightPanel({ module }: { module: ModuleId }) {
  const state = useDiornaStore();
  const [tagInput, setTagInput] = useState("");
  const [folderInput, setFolderInput] = useState("");
  const [noteContextId, setNoteContextId] = useState<string>();
  const [calendarContext, setCalendarContext] = useState<{
    view: "day" | "week" | "month" | "agenda";
    start: string;
    end: string;
  }>(() => {
    const today = startOfDay(new Date());
    return { view: "week", start: today.toISOString(), end: today.toISOString() };
  });
  useEffect(() => {
    const update = (event: Event) =>
      setCalendarContext(
        (
          event as CustomEvent<{
            view: "day" | "week" | "month" | "agenda";
            start: string;
            end: string;
          }>
        ).detail,
      );
    window.addEventListener("diorna-calendar-context", update);
    return () => window.removeEventListener("diorna-calendar-context", update);
  }, []);
  useEffect(() => {
    const update = (event: Event) =>
      setNoteContextId((event as CustomEvent<{ noteId?: string }>).detail.noteId);
    window.addEventListener("diorna-note-context", update);
    return () => window.removeEventListener("diorna-note-context", update);
  }, []);
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  const projectContext =
    module === "projects"
      ? state.projects.find(
          (project) =>
            project.id === active?.entityId && project.workspaceId === state.activeWorkspaceId,
        )
      : undefined;
  const noteId = module === "notes" ? (noteContextId ?? active?.entityId) : active?.entityId;
  const note = noteId
    ? state.notes.find(
        (entry) => entry.id === noteId && entry.workspaceId === state.activeWorkspaceId,
      )
    : undefined;
  const backlinks = note ? findBacklinks(state.notes, note) : [];
  const mentions = note ? findUnlinkedMentions(state.notes, note) : [];
  const outline = note ? extractOutline(note.body) : [];
  const linkedItems = note
    ? state.items.filter(
        (item) =>
          item.workspaceId === note.workspaceId && item.noteId === note.id && !item.trashedAt,
      )
    : [];
  const noteProjects = note
    ? state.projects.filter(
        (project) =>
          project.workspaceId === note.workspaceId &&
          !project.archived &&
          project.linkedNoteIds.includes(note.id),
      )
    : [];
  const noteFolders = [
    ...new Set(
      state.notes
        .filter((entry) => entry.workspaceId === state.activeWorkspaceId && !entry.trashedAt)
        .map((entry) => {
          const parts = entry.path.replace(/^notes[\\/]/, "").split(/[\\/]/);
          parts.pop();
          return parts.join("/");
        })
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const currentFolder = (() => {
    if (!note) return "";
    const parts = note.path.replace(/^notes[\\/]/, "").split(/[\\/]/);
    parts.pop();
    return parts.join("/");
  })();
  const moveNoteToFolder = (folder: string) => {
    if (!note) return;
    const file = note.path.split(/[\\/]/).at(-1) ?? `${note.title}.md`;
    const clean = folder.trim().replace(/^[\\/]+|[\\/]+$/g, "");
    state.updateNote(note.id, { path: `notes/${clean ? `${clean}/` : ""}${file}` });
  };
  const calendarItem =
    module === "calendar"
      ? state.items.find(
          (item) =>
            item.id === state.selectedCalendarItemId &&
            item.workspaceId === state.activeWorkspaceId &&
            !item.trashedAt,
        )
      : undefined;
  const dailyHabit =
    module === "daily"
      ? state.habits.find(
          (habit) =>
            habit.id === state.selectedDailyHabitId &&
            habit.workspaceId === state.activeWorkspaceId,
        )
      : undefined;
  const dailyHabitStats = dailyHabit
    ? habitStatistics(
        dailyHabit,
        state.habitEntries.filter((entry) => entry.workspaceId === state.activeWorkspaceId),
        dateKey(startOfYear(new Date())),
        dateKey(new Date()),
      )
    : undefined;
  const calendarOccurrences: ItemOccurrence[] =
    module === "calendar"
      ? state.items
          .filter((item) => item.workspaceId === state.activeWorkspaceId && !item.trashedAt)
          .flatMap((item) =>
            occurrencesBetween(
              item,
              new Date(calendarContext.start),
              new Date(calendarContext.end),
            ),
          )
          .sort(
            (a, b) =>
              new Date(a.startAt ?? a.dueAt ?? a.occurrenceStart).getTime() -
              new Date(b.startAt ?? b.dueAt ?? b.occurrenceStart).getTime(),
          )
      : [];
  const trainingSessions =
    module === "training"
      ? state.trainingSessions
          .filter(
            (session) =>
              session.workspaceId === state.activeWorkspaceId && session.status === "completed",
          )
          .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      : [];
  const trainingWeek = trainingSessions.filter(
    (session) => new Date(session.startedAt).getTime() >= Date.now() - 7 * 86_400_000,
  );
  return (
    <>
      <header className="panel-header">
        <span>
          {module === "notes"
            ? "Note context"
            : module === "maps"
              ? "Inspector"
              : module === "calendar"
                ? "Calendar context"
                : module === "daily"
                  ? "Statistics"
                  : module === "training"
                    ? "Training context"
                    : module === "projects"
                      ? "Project context"
                      : module === "focus"
                        ? "Focus context"
                        : "Context"}
        </span>
        <button
          className="icon-button"
          aria-label={module === "maps" ? "Close inspector" : "Close context panel"}
          onClick={state.toggleRightPanel}
        >
          <X size={14} />
        </button>
      </header>
      <div className="panel-body">
        <span className="eyebrow">Current context</span>
        {module === "projects" && !projectContext && (
          <section className="project-context-panel">
            <h3>Portfolio</h3>
            <p className="muted">
              Open a project to see its progress, next action and connected work here.
            </p>
            <dl>
              <dt>Active</dt>
              <dd>
                {
                  state.projects.filter(
                    (project) =>
                      project.workspaceId === state.activeWorkspaceId &&
                      project.status === "active" &&
                      !project.archived,
                  ).length
                }
              </dd>
              <dt>At risk</dt>
              <dd>
                {
                  state.projects.filter(
                    (project) =>
                      project.workspaceId === state.activeWorkspaceId &&
                      ["at-risk", "blocked"].includes(project.health) &&
                      !project.archived,
                  ).length
                }
              </dd>
              <dt>Goals</dt>
              <dd>
                {
                  state.goals.filter(
                    (goal) =>
                      goal.workspaceId === state.activeWorkspaceId && goal.status === "active",
                  ).length
                }
              </dd>
            </dl>
          </section>
        )}
        {module === "projects" && projectContext && (
          <section className="project-context-panel">
            <i style={{ background: projectContext.color }} />
            <h3>{projectContext.name}</h3>
            <strong className={`context-health ${projectContext.health}`}>
              {projectContext.health.replace("-", " ")}
            </strong>
            <div className="project-progress">
              <span
                style={{
                  width: `${projectProgress(projectContext, state.items, state.metricEntries)}%`,
                  background: projectContext.color,
                }}
              />
            </div>
            <dl>
              <dt>Progress</dt>
              <dd>{projectProgress(projectContext, state.items, state.metricEntries)}%</dd>
              <dt>Tasks</dt>
              <dd>
                {projectTaskStats(projectContext.id, state.items).completed}/
                {projectTaskStats(projectContext.id, state.items).total}
              </dd>
              <dt>Milestones</dt>
              <dd>
                {projectContext.milestones.filter((milestone) => milestone.completedAt).length}/
                {projectContext.milestones.length}
              </dd>
            </dl>
            <h3>Next action</h3>
            <textarea
              aria-label="Project next action"
              placeholder="Choose the next concrete action"
              value={projectContext.nextAction}
              onChange={(event) =>
                state.updateProject(projectContext.id, { nextAction: event.target.value })
              }
            />
            <button className="button" onClick={() => state.setModule("calendar")}>
              <CalendarDays size={14} /> Open Calendar
            </button>
            <button
              className="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("diorna-open-ai", {
                    detail: {
                      prompt: `Review the project "${projectContext.name}" and propose the most useful next work while preserving its connected context.`,
                    },
                  }),
                )
              }
            >
              <Sparkles size={14} /> Ask Diorna AI
            </button>
          </section>
        )}
        {module === "focus" && <FocusContextPanel />}
        {module === "notes" && !note && (
          <p className="muted">Select an item to inspect its details here.</p>
        )}
        {module === "maps" && (
          <div className="map-inspector-panel" id="map-inspector-panel">
            <p className="muted map-inspector-empty">Select a node or an edge to edit it here.</p>
          </div>
        )}
        {module === "training" && (
          <section className="training-context-panel">
            <h3>This week</h3>
            <dl>
              <dt>Sessions</dt>
              <dd>{trainingWeek.length}</dd>
              <dt>Time</dt>
              <dd>
                {trainingWeek.reduce((sum, session) => sum + sessionDurationMinutes(session), 0)}{" "}
                min
              </dd>
              <dt>Strength volume</dt>
              <dd>
                {trainingWeek
                  .reduce((sum, session) => sum + sessionVolume(session), 0)
                  .toLocaleString()}
              </dd>
            </dl>
            <h3>Recent sessions</h3>
            {trainingSessions.slice(0, 6).map((session) => (
              <button
                className="outline-link"
                key={session.id}
                onClick={() => state.setModule("training")}
              >
                <strong>{session.title}</strong>
                <small>
                  {format(new Date(session.startedAt), "d MMM")} · {sessionDurationMinutes(session)}{" "}
                  min
                </small>
              </button>
            ))}
            {!trainingSessions.length && (
              <div className="empty-mini">No completed training sessions yet</div>
            )}
            <p className="muted">
              Completed minutes are synchronized with Daily. Training statistics are included in new
              Recaps.
            </p>
          </section>
        )}
        {module === "notes" && (
          <>
            {note && (
              <section className="note-context-actions">
                <div className="note-context-title">
                  <strong>{note.title}</strong>
                  <button
                    className={`icon-button ${note.starred ? "active" : ""}`}
                    aria-label={note.starred ? "Remove from favourites" : "Add to favourites"}
                    onClick={() => state.updateNote(note.id, { starred: !note.starred })}
                  >
                    <Pin size={14} fill={note.starred ? "currentColor" : "none"} />
                  </button>
                </div>
                <label>
                  Folder
                  <select
                    value={currentFolder}
                    onChange={(event) => moveNoteToFolder(event.target.value)}
                  >
                    <option value="">Root</option>
                    {noteFolders.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}
                      </option>
                    ))}
                  </select>
                </label>
                <form
                  className="context-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!folderInput.trim()) return;
                    moveNoteToFolder(folderInput);
                    setFolderInput("");
                  }}
                >
                  <input
                    aria-label="New folder"
                    placeholder="New folder"
                    value={folderInput}
                    onChange={(event) => setFolderInput(event.target.value)}
                  />
                  <button className="icon-button" aria-label="Create and use folder">
                    <Plus size={14} />
                  </button>
                </form>
                <div className="context-tags" aria-label="Note tags">
                  {note.tags.map((tag) => (
                    <button
                      key={tag}
                      title={`Remove #${tag}`}
                      onClick={() =>
                        state.updateNote(note.id, {
                          tags: note.tags.filter((entry) => entry !== tag),
                        })
                      }
                    >
                      #{tag} <X size={11} />
                    </button>
                  ))}
                </div>
                <form
                  className="context-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const tag = tagInput.trim().replace(/^#/, "");
                    if (!tag || note.tags.includes(tag)) return;
                    state.updateNote(note.id, { tags: [...note.tags, tag] });
                    setTagInput("");
                  }}
                >
                  <input
                    aria-label="Add tag"
                    placeholder="Add a tag"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                  />
                  <button className="icon-button" aria-label="Add tag">
                    <Plus size={14} />
                  </button>
                </form>
                <label>
                  Project
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value && note)
                        state.linkProjectResource(event.target.value, "note", note.id);
                    }}
                  >
                    <option value="">Link to a project…</option>
                    {state.projects
                      .filter(
                        (project) =>
                          project.workspaceId === state.activeWorkspaceId &&
                          !project.archived &&
                          !project.linkedNoteIds.includes(note.id),
                      )
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                  </select>
                </label>
                {noteProjects.map((project) => (
                  <div className="linked-item-row" key={project.id}>
                    <button
                      onClick={() =>
                        state.openTab({
                          module: "projects",
                          title: project.name,
                          entityId: project.id,
                        })
                      }
                    >
                      <strong>{project.name}</strong>
                      <small>Linked project</small>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Unlink ${project.name}`}
                      onClick={() =>
                        note && state.linkProjectResource(project.id, "note", note.id, false)
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </section>
            )}
            <h3>Outline</h3>
            {outline.map((heading) => (
              <button
                className="outline-link"
                style={{ paddingInlineStart: `${8 + (heading.level - 1) * 12}px` }}
                key={heading.anchor}
                onClick={() => {
                  const headings = document.querySelectorAll(
                    ".prose-editor h1, .prose-editor h2, .prose-editor h3, .prose-editor h4",
                  );
                  [...headings]
                    .find((element) => element.textContent?.trim() === heading.text)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                {heading.text}
              </button>
            ))}
            {!outline.length && <div className="empty-mini">No headings yet</div>}
            <h3>Calendar items</h3>
            {linkedItems.map((item) => (
              <div
                className={`linked-item-row ${item.completedAt ? "complete" : ""}`}
                key={item.id}
              >
                {item.kind === "task" && (
                  <input
                    type="checkbox"
                    aria-label={`Complete ${item.title}`}
                    checked={Boolean(item.completedAt)}
                    onChange={(event) =>
                      state.updateItem(item.id, {
                        completedAt: event.target.checked ? new Date().toISOString() : undefined,
                      } as Partial<typeof item>)
                    }
                  />
                )}
                <button onClick={() => state.setModule("calendar")}>
                  <strong>{item.title}</strong>
                  <small>
                    {item.sourceNoteLine ? `Checkbox ${item.sourceNoteLine} · ` : ""}
                    {item.startAt || item.dueAt
                      ? new Date(item.startAt ?? item.dueAt!).toLocaleString([], {
                          dateStyle: "medium",
                          ...(item.allDay ? {} : { timeStyle: "short" }),
                        })
                      : "Unscheduled"}
                  </small>
                </button>
              </div>
            ))}
            {!linkedItems.length && <div className="empty-mini">No linked items</div>}
            <h3>Linked mentions</h3>
            {backlinks.map((link) => (
              <button
                className="outline-link"
                key={`${link.sourceNoteId}-${link.index}`}
                onClick={() =>
                  state.openTab({
                    module: "notes",
                    title: link.sourceTitle,
                    entityId: link.sourceNoteId,
                  })
                }
              >
                <strong>{link.sourceTitle}</strong>
                <small>{link.context}</small>
              </button>
            ))}
            {!backlinks.length && <div className="empty-mini">No backlinks yet</div>}
            <h3>Unlinked mentions</h3>
            {mentions.map((link) => {
              const source = state.notes.find((entry) => entry.id === link.sourceNoteId);
              return (
                <div className="mention-row" key={`${link.sourceNoteId}-${link.index}`}>
                  <button
                    className="outline-link"
                    onClick={() =>
                      state.openTab({
                        module: "notes",
                        title: link.sourceTitle,
                        entityId: link.sourceNoteId,
                      })
                    }
                  >
                    <strong>{link.sourceTitle}</strong>
                    <small>{link.context}</small>
                  </button>
                  <button
                    className="button compact"
                    disabled={!source || !note}
                    onClick={() => {
                      if (source && note)
                        state.updateNote(source.id, {
                          body: convertFirstUnlinkedMention(source.body, note.title),
                        });
                    }}
                  >
                    Link
                  </button>
                </div>
              );
            })}
            {!mentions.length && <div className="empty-mini">No unlinked mentions</div>}
          </>
        )}
        {module === "calendar" && calendarItem && (
          <section className="calendar-context-details">
            <i
              style={{
                background: state.categories.find(
                  (category) => category.id === calendarItem.categoryId,
                )?.color,
              }}
            />
            <h3>{calendarItem.title}</h3>
            <dl>
              <dt>Kind</dt>
              <dd>{calendarItem.kind}</dd>
              <dt>When</dt>
              <dd>
                {calendarItem.startAt || calendarItem.dueAt
                  ? new Date(calendarItem.startAt ?? calendarItem.dueAt!).toLocaleString()
                  : "Unscheduled"}
              </dd>
              <dt>Priority</dt>
              <dd>{calendarItem.priority}</dd>
              <dt>Reminder</dt>
              <dd>
                {calendarItem.reminders.length
                  ? `${calendarItem.reminders.join(", ")} min`
                  : "None"}
              </dd>
            </dl>
            {calendarItem.description && (
              <p>
                {calendarItem.description
                  .replace(/<[^>]+>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()}
              </p>
            )}
            {calendarItem.kind === "task" && (
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(calendarItem.completedAt)}
                  onChange={(event) =>
                    state.updateItem(calendarItem.id, {
                      completedAt: event.target.checked ? new Date().toISOString() : undefined,
                    } as Partial<typeof calendarItem>)
                  }
                />
                Completed
              </label>
            )}
            {!calendarItem.completedAt && (
              <button
                className="button primary icon-text"
                onClick={() => {
                  const minutes =
                    calendarItem.startAt && calendarItem.endAt
                      ? Math.max(
                          5,
                          Math.round(
                            (Date.parse(calendarItem.endAt) - Date.parse(calendarItem.startAt)) /
                              60_000,
                          ),
                        )
                      : 45;
                  const session = state.addFocusSession({
                    title: calendarItem.title,
                    intention: calendarItem.description.replace(/<[^>]+>/g, " ").trim(),
                    mode: calendarItem.projectId ? "deep-work" : "admin",
                    plannedMinutes: Math.min(180, minutes),
                    sourceType: "calendar",
                    sourceId: calendarItem.id,
                    calendarItemId: calendarItem.id,
                  });
                  state.startFocusSession(session.id);
                  state.setModule("focus");
                }}
              >
                <Timer size={15} /> Focus on this
              </button>
            )}
            {calendarItem.trainingTemplateId && (
              <button
                className="button primary icon-text"
                onClick={() => {
                  if (calendarItem.trainingSessionId) {
                    state.setModule("training");
                    return;
                  }
                  const template = state.trainingTemplates.find(
                    (entry) =>
                      entry.id === calendarItem.trainingTemplateId &&
                      entry.workspaceId === state.activeWorkspaceId &&
                      !entry.archived,
                  );
                  if (!template) return;
                  const session = state.startTrainingSession({
                    activityId: template.activityId,
                    templateId: template.id,
                    calendarItemId: calendarItem.id,
                  });
                  if (session) state.setModule("training");
                }}
              >
                <Dumbbell size={15} />
                {calendarItem.trainingSessionId ? "Open training session" : "Start training"}
              </button>
            )}
            {calendarItem.noteId && (
              <button
                className="button"
                onClick={() => {
                  const linked = state.notes.find((entry) => entry.id === calendarItem.noteId);
                  if (linked) {
                    if (calendarItem.sourceNoteLine)
                      localStorage.setItem(
                        "diorna-open-note-task-line",
                        JSON.stringify({ noteId: linked.id, line: calendarItem.sourceNoteLine }),
                      );
                    state.openTab({
                      module: "notes",
                      title: linked.title,
                      entityId: linked.id,
                    });
                  }
                }}
              >
                Open linked note
              </button>
            )}
            {calendarItem.projectId && (
              <button
                className="button"
                onClick={() => {
                  const project = state.projects.find(
                    (entry) =>
                      entry.id === calendarItem.projectId &&
                      entry.workspaceId === state.activeWorkspaceId,
                  );
                  if (project)
                    state.openTab({
                      module: "projects",
                      title: project.name,
                      entityId: project.id,
                    });
                }}
              >
                <FolderKanban size={14} /> Open linked project
              </button>
            )}
          </section>
        )}
        {module === "calendar" && (
          <section className="calendar-range-context">
            <header>
              <div>
                <h3>
                  {calendarContext.view === "week"
                    ? "This week"
                    : calendarContext.view === "day"
                      ? "Selected day"
                      : calendarContext.view === "month"
                        ? "Visible month"
                        : "Agenda range"}
                </h3>
                <small>
                  {format(new Date(calendarContext.start), "d MMM")} –{" "}
                  {format(new Date(calendarContext.end), "d MMM yyyy")}
                </small>
              </div>
              <span>{calendarOccurrences.length}</span>
            </header>
            <div className="calendar-context-list">
              {calendarOccurrences.map((occurrence) => {
                const when = new Date(
                  occurrence.startAt ?? occurrence.dueAt ?? occurrence.occurrenceStart,
                );
                const status = isSameDay(when, new Date())
                  ? "today"
                  : when < startOfDay(new Date())
                    ? "past"
                    : "future";
                const category = state.categories.find(
                  (entry) => entry.id === occurrence.categoryId,
                );
                return (
                  <button
                    className={status}
                    key={occurrence.recurrenceId}
                    onClick={() => state.selectCalendarItem(occurrence.id)}
                  >
                    <i style={{ background: category?.color }} />
                    <span>
                      <strong>{occurrence.title}</strong>
                      <small>
                        {format(when, occurrence.allDay ? "EEE d MMM" : "EEE d MMM · HH:mm")}
                      </small>
                    </span>
                  </button>
                );
              })}
              {!calendarOccurrences.length && (
                <div className="empty-mini">Nothing scheduled in this range.</div>
              )}
            </div>
          </section>
        )}
        {module === "daily" && dailyHabit && dailyHabitStats && (
          <section className="daily-context-details">
            <i
              style={{
                background: state.categories.find(
                  (category) => category.id === dailyHabit.categoryId,
                )?.color,
              }}
            />
            <h3>{dailyHabit.name}</h3>
            {dailyHabit.description && <p>{dailyHabit.description}</p>}
            <dl>
              <dt>Current streak</dt>
              <dd>{dailyHabitStats.currentStreak} days</dd>
              <dt>Longest streak</dt>
              <dd>{dailyHabitStats.longestStreak} days</dd>
              <dt>Year completion</dt>
              <dd>{dailyHabitStats.rate === null ? "—" : `${dailyHabitStats.rate}%`}</dd>
              <dt>Completed</dt>
              <dd>
                {dailyHabitStats.completed} / {dailyHabitStats.applicable} applicable days
              </dd>
              <dt>Schedule</dt>
              <dd>
                {dailyHabit.activeWeekdays.length === 7
                  ? "Every day"
                  : dailyHabit.activeWeekdays
                      .map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day])
                      .join(", ")}
              </dd>
            </dl>
            {dailyHabit.archived && <span className="status-badge">Archived</span>}
          </section>
        )}
        {module === "daily" && !dailyHabit && (
          <div className="empty-mini">Select a habit row to inspect its statistics.</div>
        )}
      </div>
    </>
  );
}
