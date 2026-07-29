import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import {
  BookOpen,
  CalendarPlus,
  Columns2,
  Command,
  Download,
  Dumbbell,
  FileText,
  FolderKanban,
  Grid3X3,
  Hash,
  Home,
  Map as MapIcon,
  PanelLeftClose,
  PanelRightClose,
  Rows2,
  Search,
  Settings,
  Sparkles,
  Timer,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import type { ModuleId } from "@/shared/models";
import {
  chooseAndBackupVault,
  chooseAndExportVault,
  chooseAndImport,
  rebuildNativeIndex,
} from "@/core/native";

interface PaletteItem {
  id: string;
  title: string;
  detail: string;
  kind: "command" | "note" | "map" | "item" | "tag" | "course" | "setting";
  shortcut: string;
  icon: LucideIcon;
  color?: string | undefined;
  recency: number;
  run: () => void;
}

const settingSections = [
  "General",
  "Appearance",
  "Vault",
  "Workspaces",
  "Editor",
  "Categories",
  "Calendar",
  "Daily Grid",
  "Recap",
  "Shortcuts",
  "Backup",
  "Import / Export",
  "About",
];

export function CommandPalette() {
  const state = useDiornaStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const items = useMemo(() => {
    const prefix = query[0];
    const used = commandRecency();
    const recentTabs = new Map(state.recentTabIds.map((id, index) => [id, Date.now() - index]));
    const shortcut = (command: string) => state.settings.keymap[command] || "Unassigned";
    const command = (
      id: string,
      title: string,
      detail: string,
      icon: LucideIcon,
      run: () => void,
      shortcutId = id,
    ): PaletteItem => ({
      id,
      title,
      detail,
      kind: "command",
      shortcut: shortcut(shortcutId),
      icon,
      recency: used[id] ?? 0,
      run,
    });
    const commands: PaletteItem[] = [
      command("newNote", "New note", "Create in current workspace", FileText, () => {
        const note = state.addNote();
        state.openTab({ module: "notes", title: note.title, entityId: note.id });
      }),
      command("newTask", "New task", "Create and inspect a task", CalendarPlus, () => {
        const category = state.categories.find(
          (entry) => entry.workspaceId === state.activeWorkspaceId,
        );
        if (!category) return;
        const task = state.addItem({
          kind: "task",
          title: "New task",
          description: "",
          categoryId: category.id,
          dueAt: new Date().toISOString(),
          allDay: true,
          priority: "none",
          subtasks: [],
          rruleExceptions: [],
          reminders: [],
        });
        state.selectCalendarItem(task.id);
        state.setModule("calendar");
      }),
      command("newMap", "New map", "Create an empty Canvas map", MapIcon, () => {
        const map = state.addMap();
        state.openTab({ module: "maps", title: map.name, entityId: map.id });
      }),
      command("newHabit", "New habit", "Add a checkbox habit", Grid3X3, () => {
        const category = state.categories.find(
          (entry) => entry.workspaceId === state.activeWorkspaceId,
        );
        if (category)
          state.addHabit({ name: "New habit", categoryId: category.id, type: "checkbox" });
        state.setModule("daily");
      }),
      command("newMetric", "New metric", "Add a numeric metric", Grid3X3, () => {
        const category = state.categories.find(
          (entry) => entry.workspaceId === state.activeWorkspaceId,
        );
        if (category)
          state.addMetric({ name: "New metric", unit: "value", categoryId: category.id });
        state.setModule("daily");
      }),
      command("startTraining", "Start training", "Open your Training module", Dumbbell, () =>
        state.setModule("training"),
      ),
      command("startFocus", "Start focus", "Open the Focus studio", Timer, () =>
        state.setModule("focus"),
      ),
      command(
        "newProject",
        "New project",
        "Create a project in the current workspace",
        FolderKanban,
        () => {
          const project = state.addProject({
            name: "Untitled project",
            outcome: "",
            kind: "custom",
            status: "idea",
          });
          state.openTab({ module: "projects", title: project.name, entityId: project.id });
        },
      ),
      ...(
        [
          "home",
          "notes",
          "maps",
          "calendar",
          "daily",
          "training",
          "recap",
          "projects",
          "focus",
          "settings",
        ] as ModuleId[]
      ).map((module) =>
        command(
          `open-${module}`,
          module[0]!.toUpperCase() + module.slice(1),
          "Open module",
          module === "home"
            ? Home
            : module === "maps"
              ? MapIcon
              : module === "settings"
                ? Settings
                : module === "recap"
                  ? Sparkles
                  : module === "projects"
                    ? FolderKanban
                    : module === "focus"
                      ? Timer
                      : module === "training"
                        ? Dumbbell
                        : Command,
          () => state.setModule(module),
          module,
        ),
      ),
      command(
        "toggleSidebar",
        "Toggle sidebar",
        "Show or hide the left sidebar",
        PanelLeftClose,
        state.toggleSidebar,
      ),
      command(
        "toggleContext",
        "Toggle context panel",
        "Show or hide the right panel",
        PanelRightClose,
        state.toggleRightPanel,
      ),
      command(
        "splitHorizontal",
        "Split pane right",
        "Open the current tab beside itself",
        Columns2,
        () => state.splitPane("horizontal"),
      ),
      command("splitVertical", "Split pane down", "Open the current tab below itself", Rows2, () =>
        state.splitPane("vertical"),
      ),
      command("closeTab", "Close active tab", "Close the selected unpinned tab", Command, () =>
        state.closeTab(state.activeTabId),
      ),
      command("quickCapture", "Quick capture", "Capture a note or task", FileText, () =>
        window.dispatchEvent(new Event("diorna-open-quick-capture")),
      ),
      command(
        "backup",
        "Back up now",
        "Create a local vault backup",
        Download,
        () =>
          void chooseAndBackupVault(state.settings.backupLocation, state.settings.backupRetention),
      ),
      command(
        "export",
        "Export entire vault",
        "Create a portable export",
        Download,
        () => void chooseAndExportVault(),
      ),
      command(
        "import-obsidian",
        "Import Obsidian vault",
        "Import non-destructively",
        Upload,
        () => void chooseAndImport("obsidian", state.activeWorkspaceId),
      ),
      command(
        "import-notion",
        "Import Notion export",
        "Import non-destructively",
        Upload,
        () => void chooseAndImport("notion", state.activeWorkspaceId),
      ),
      command(
        "reindex",
        "Re-index vault",
        "Rebuild the local search index",
        Search,
        () =>
          void rebuildNativeIndex().then((count) =>
            window.alert(`Index rebuilt from ${count} files.`),
          ),
      ),
      ...state.workspaces.map((workspace, index) =>
        command(
          `workspace-${workspace.id}`,
          `Switch to ${workspace.name}`,
          "Workspace",
          Home,
          () => state.setWorkspace(workspace.id),
          `workspace${index + 1}`,
        ),
      ),
    ];
    const workspaceTabs = state.tabs.filter((tab) =>
      state.panes.some((pane) => pane.tabIds.includes(tab.id)),
    );
    const entityRecency = (entityId: string, module: ModuleId) => {
      const tab = workspaceTabs.find(
        (entry) => entry.entityId === entityId && entry.module === module,
      );
      return tab ? (recentTabs.get(tab.id) ?? 0) : 0;
    };
    const content: PaletteItem[] = [
      ...selectWorkspace(state.notes, state.activeWorkspaceId)
        .filter((note) => !note.trashedAt)
        .map((note) => ({
          id: note.id,
          title: note.title,
          detail: note.path,
          kind: "note" as const,
          shortcut: "",
          icon: FileText,
          recency: entityRecency(note.id, "notes"),
          run: () => state.openTab({ module: "notes", title: note.title, entityId: note.id }),
        })),
      ...selectWorkspace(state.maps, state.activeWorkspaceId)
        .filter((map) => !map.trashedAt)
        .map((map) => ({
          id: map.id,
          title: map.name,
          detail: map.path,
          kind: "map" as const,
          shortcut: "",
          icon: MapIcon,
          recency: entityRecency(map.id, "maps"),
          run: () => state.openTab({ module: "maps", title: map.name, entityId: map.id }),
        })),
      ...selectWorkspace(state.items, state.activeWorkspaceId)
        .filter((item) => !item.trashedAt)
        .map((item) => ({
          id: item.id,
          title: item.title,
          detail: item.kind,
          kind: "item" as const,
          shortcut: "",
          icon: CalendarPlus,
          color: state.categories.find((category) => category.id === item.categoryId)?.color,
          recency: 0,
          run: () => {
            state.selectCalendarItem(item.id);
            localStorage.setItem("diorna-open-calendar-item", item.id);
            state.setModule("calendar");
          },
        })),
    ];
    const workspaceNotes = selectWorkspace(state.notes, state.activeWorkspaceId).filter(
      (note) => !note.trashedAt,
    );
    const tags: PaletteItem[] = [...new Set(workspaceNotes.flatMap((note) => note.tags))].map(
      (tag) => ({
        id: `tag-${tag}`,
        title: `#${tag}`,
        detail: `${workspaceNotes.filter((note) => note.tags.includes(tag)).length} notes`,
        kind: "tag",
        shortcut: "",
        icon: Hash,
        recency: 0,
        run: () => {
          localStorage.setItem("diorna-note-filter", `tag:${tag}`);
          state.setModule("notes");
        },
      }),
    );
    const courses: PaletteItem[] = selectWorkspace(state.courses, state.activeWorkspaceId).map(
      (course) => ({
        id: course.id,
        title: course.name,
        detail: `${course.code} · ${course.semester}`,
        kind: "course",
        shortcut: "",
        icon: BookOpen,
        color: course.color,
        recency: 0,
        run: () => {
          localStorage.setItem("diorna-note-filter", `course:${course.id}`);
          state.setModule("notes");
        },
      }),
    );
    const settings: PaletteItem[] = settingSections.map((title) => ({
      id: `setting-${title.toLocaleLowerCase().replace(/\W+/g, "-")}`,
      title,
      detail: "Setting",
      kind: "setting",
      shortcut: "",
      icon: Settings,
      recency: used[`setting-${title}`] ?? 0,
      run: () => {
        localStorage.setItem("diorna-settings-section", title);
        state.setModule("settings");
      },
    }));
    const source =
      prefix === ">"
        ? commands
        : prefix === "#"
          ? tags
          : prefix === "@"
            ? courses
            : prefix === "/"
              ? content.filter((item) => item.kind === "note" || item.kind === "map")
              : [...commands, ...content, ...tags, ...courses, ...settings];
    const term = [">", "#", "@", "/"].includes(prefix ?? "") ? query.slice(1) : query;
    if (!term)
      return [...source]
        .sort((a, b) => b.recency - a.recency || a.title.localeCompare(b.title))
        .slice(0, 12);
    return new Fuse(source, { keys: ["title", "detail"], threshold: 0.4, includeScore: true })
      .search(term)
      .sort((a, b) => b.item.recency - a.item.recency || (a.score ?? 1) - (b.score ?? 1))
      .map((result) => result.item)
      .slice(0, 12);
  }, [query, state]);
  useEffect(() => setSelectedIndex(0), [query]);
  const choose = (item: PaletteItem) => {
    const recent = commandRecency();
    recent[item.id] = Date.now();
    localStorage.setItem("diorna-command-recency", JSON.stringify(recent));
    item.run();
    state.setCommandPaletteOpen(false);
  };
  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={() => state.setCommandPaletteOpen(false)}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") state.setCommandPaletteOpen(false);
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((index) => Math.min(items.length - 1, index + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((index) => Math.max(0, index - 1));
              }
              if (event.key === "Enter" && items[selectedIndex]) choose(items[selectedIndex]);
            }}
            placeholder="Search or type a command…"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-results">
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={index === selectedIndex ? "selected" : ""}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => choose(item)}
              >
                <Icon size={17} />
                {item.color && (
                  <i className="command-category" style={{ background: item.color }} />
                )}
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </button>
            );
          })}
          {!items.length && (
            <div className="empty-state compact">
              <Search />
              <strong>No results</strong>
              <span>Try a different phrase or prefix.</span>
            </div>
          )}
        </div>
        <footer>
          <span>
            <kbd>↑↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Open
          </span>
          <span>
            Prefixes: <b>&gt;</b> commands · <b>#</b> tags · <b>@</b> courses · <b>/</b> files
          </span>
        </footer>
      </div>
    </div>
  );
}

function commandRecency(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem("diorna-command-recency") ?? "{}") as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}
