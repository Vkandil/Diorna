import { lazy, Suspense, useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Columns2,
  Grid3X3,
  Home,
  Map,
  Menu,
  NotebookText,
  PanelRight,
  Pin,
  Plus,
  RotateCcw,
  Rows2,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { startOfYear } from "date-fns";
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
import { dateKey, habitStatistics } from "@/modules/daily/logic";
import { matchesShortcut } from "@/core/shortcuts";
import { installDownloadedUpdate, type UpdateState } from "@/core/updater";
import { getNativeVaultInfo, hasNativeApiKey, takeNativeOpenRequests } from "@/core/native";
import { recapSecretId } from "@/shared/recapConfig";

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
  { id: "recap", label: "Recap", icon: Sparkles, shortcut: "5" },
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
  const [aiAvailable, setAiAvailable] = useState(false);
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId)!;
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
      className={`app-shell ${state.sidebarOpen ? "" : "sidebar-collapsed"} ${state.rightPanelOpen ? "" : "right-collapsed"} ${state.activeModule === "maps" ? "map-module-active" : ""}`}
      style={{ "--sidebar": `${state.sidebarWidth}px` } as React.CSSProperties}
    >
      <aside className="sidebar">
        <div className="workspace-switcher">
          <span className="workspace-dot" style={{ background: workspace.color }} />
          <select
            aria-label="Workspace"
            value={workspace.id}
            onChange={(event) => {
              if (event.target.value === "__new__") {
                const name = window.prompt("New workspace name");
                if (name?.trim()) state.addWorkspace(name.trim(), "#657287");
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
        <div className="sidebar-bottom">
          {aiAvailable && (
            <button
              className={aiOpen ? "active" : ""}
              aria-pressed={aiOpen}
              onClick={() => setAiOpen((current) => !current)}
            >
              <Sparkles size={16} />
              <span>Diorna AI</span>
            </button>
          )}
          <button onClick={() => state.setModule("settings")}>
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
          <button
            className="icon-button"
            aria-label="Toggle context panel"
            onClick={state.toggleRightPanel}
          >
            <PanelRight size={16} />
          </button>
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
      <aside className="right-panel">
        <RightPanel module={state.activeModule} />
      </aside>
      {aiOpen && (
        <Suspense fallback={null}>
          <AiDrawer open onClose={() => setAiOpen(false)} />
        </Suspense>
      )}
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
        : module === "daily"
          ? state.habits
              .filter((item) => item.workspaceId === id)
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
    }
  };
  return (
    <section className="context-sidebar">
      <header>
        <span>{module === "home" ? "Workspace" : module}</span>
        <button
          aria-label={module === "notes" ? "Add note" : module === "maps" ? "Add map" : "Add"}
          disabled={module !== "notes" && module !== "maps"}
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
              if ("module" in entry && (entry.module === "notes" || entry.module === "maps"))
                state.openTab({ module: entry.module, title: entry.label, entityId: entry.id });
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
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  const note = active?.entityId
    ? state.notes.find(
        (entry) => entry.id === active.entityId && entry.workspaceId === state.activeWorkspaceId,
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
  return (
    <>
      <header className="panel-header">
        <span>
          {module === "notes"
            ? "Backlinks"
            : module === "maps"
              ? "Inspector"
              : module === "calendar"
                ? "Item details"
                : module === "daily"
                  ? "Statistics"
                  : "Context"}
        </span>
        <button
          className="icon-button"
          aria-label={module === "maps" ? "Close inspector" : "Refresh context"}
          onClick={module === "maps" ? state.toggleRightPanel : undefined}
        >
          {module === "maps" ? <X size={14} /> : <RotateCcw size={14} />}
        </button>
      </header>
      <div className="panel-body">
        <span className="eyebrow">Current context</span>
        {module !== "calendar" && module !== "daily" && module !== "maps" && (
          <p className="muted">Select an item to inspect its details here.</p>
        )}
        {module === "maps" && (
          <div className="map-inspector-panel" id="map-inspector-panel">
            <p className="muted map-inspector-empty">Select a node or an edge to edit it here.</p>
          </div>
        )}
        {module === "notes" && (
          <>
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
          </section>
        )}
        {module === "calendar" && !calendarItem && (
          <div className="empty-mini">Select a calendar item to inspect it.</div>
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
