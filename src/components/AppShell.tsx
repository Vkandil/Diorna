import { lazy, Suspense, useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Grid3X3,
  Home,
  Map,
  Menu,
  NotebookText,
  PanelRight,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDiornaStore } from "@/core/store";
import type { ModuleId } from "@/shared/models";
import { CommandPalette } from "./CommandPalette";
import { QuickCapture } from "./QuickCapture";
import { HomeView } from "@/modules/home/HomeView";
import { findBacklinks, findUnlinkedMentions } from "@/modules/notes/logic";
import { scheduleNativeReminders } from "@/modules/calendar/reminders";

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
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId)!;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        state.setCommandPaletteOpen(true);
      }
      if (event.ctrlKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        state.toggleSidebar();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "w") {
        event.preventDefault();
        state.closeTab(state.activeTabId);
      }
      if (event.ctrlKey && event.altKey && event.code === "Space") {
        event.preventDefault();
        setCaptureOpen(true);
      }
      if (event.ctrlKey && event.shiftKey && /^[1-9]$/.test(event.key)) {
        const next = state.workspaces[Number(event.key) - 1];
        if (next) state.setWorkspace(next.id);
      }
      if (event.ctrlKey && !event.shiftKey && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        state.setModule(modules[Number(event.key) - 1]!.id);
      }
      if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        const index = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
        const next = state.tabs[(index + 1) % state.tabs.length];
        if (next) state.setActiveTab(next.id);
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
    if (["home", "settings", "components"].includes(state.activeModule)) {
      setCoachVisible(false);
      return;
    }
    setCoachVisible(localStorage.getItem(`diorna-coach-${state.activeModule}`) !== "seen");
  }, [state.activeModule]);
  return (
    <div
      className={`app-shell ${state.sidebarOpen ? "" : "sidebar-collapsed"} ${state.rightPanelOpen ? "" : "right-collapsed"}`}
    >
      <aside className="sidebar">
        <div className="workspace-switcher">
          <span className="workspace-dot" style={{ background: workspace.color }} />
          <select
            aria-label="Workspace"
            value={workspace.id}
            onChange={(event) => state.setWorkspace(event.target.value)}
          >
            {state.workspaces.map((entry) => (
              <option value={entry.id} key={entry.id}>
                {entry.name}
              </option>
            ))}
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
          {modules.map(({ id, label, icon: Icon, shortcut }) => (
            <button
              key={id}
              className={state.activeModule === id ? "active" : ""}
              onClick={() => state.setModule(id)}
            >
              <Icon size={17} />
              <span>{t(label)}</span>
              <kbd>Ctrl {shortcut}</kbd>
            </button>
          ))}
        </nav>
        <ContextSidebar module={state.activeModule} />
        <div className="sidebar-bottom">
          <button onClick={() => state.setModule("settings")}>
            <Settings size={16} />
            <span>{t("Settings")}</span>
          </button>
          <div className="vault-status">
            <i /> Documents\Diorna
          </div>
        </div>
      </aside>
      <main className="workspace-area">
        <header className="titlebar">
          <button className="icon-button" aria-label="Toggle sidebar" onClick={state.toggleSidebar}>
            <Menu size={17} />
          </button>
          <div className="tab-strip">
            {state.tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab ${state.activeTabId === tab.id ? "active" : ""}`}
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
            {renderModule(state.activeModule)}
          </Suspense>
        </div>
      </main>
      <aside className="right-panel">
        <RightPanel module={state.activeModule} />
      </aside>
      {state.commandPaletteOpen && <CommandPalette />}
      {captureOpen && <QuickCapture onClose={() => setCaptureOpen(false)} />}
    </div>
  );
}

const coachCopy: Partial<Record<ModuleId, string>> = {
  notes: "Type / for blocks and [[ to link ideas. Everything saves automatically.",
  maps: "Double-click the canvas to add an idea; drag handles to connect it.",
  calendar: "Use quick add in plain language, then drag items to reschedule.",
  daily: "Use arrow keys to move and Space or digits to enter a whole day quickly.",
  recap: "Every number is calculated locally; a model is optional and only improves prose.",
};

function renderModule(module: ModuleId) {
  switch (module) {
    case "notes":
      return <NotesView />;
    case "maps":
      return <MapsView />;
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
  const entries =
    module === "notes"
      ? state.notes.filter((item) => item.workspaceId === id).map((item) => item.title)
      : module === "maps"
        ? state.maps.filter((item) => item.workspaceId === id).map((item) => item.name)
        : module === "daily"
          ? state.habits.filter((item) => item.workspaceId === id).map((item) => item.name)
          : state.categories.filter((item) => item.workspaceId === id).map((item) => item.name);
  return (
    <section className="context-sidebar">
      <header>
        <span>{module === "home" ? "Workspace" : module}</span>
        <button aria-label="Add">
          <Plus size={14} />
        </button>
      </header>
      <div className="context-list">
        {entries.slice(0, 12).map((entry) => (
          <button key={entry}>{entry}</button>
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
        <button className="icon-button">
          <RotateCcw size={14} />
        </button>
      </header>
      <div className="panel-body">
        <span className="eyebrow">Current context</span>
        <p className="muted">Select an item to inspect its details here.</p>
        {module === "notes" && (
          <>
            <h3>Outline</h3>
            <button className="outline-link">Introduction</button>
            <button className="outline-link nested">Start here</button>
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
            {mentions.map((link) => (
              <button className="outline-link" key={`${link.sourceNoteId}-${link.index}`}>
                {link.sourceTitle}
              </button>
            ))}
            {!mentions.length && <div className="empty-mini">No unlinked mentions</div>}
          </>
        )}
      </div>
    </>
  );
}
