import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import {
  BookOpen,
  CalendarPlus,
  Command,
  FileText,
  Hash,
  Map,
  Search,
  Settings,
} from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import type { ModuleId } from "@/shared/models";

export function CommandPalette() {
  const state = useDiornaStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const items = useMemo(() => {
    const prefix = query[0];
    const commands = [
      {
        id: "new-note",
        title: "New note",
        detail: "Create in current workspace",
        kind: "command",
        shortcut: "Ctrl+N",
        icon: FileText,
        run: () => {
          const note = state.addNote();
          state.openTab({
            module: "notes",
            title: note.title,
            entityId: note.id,
          });
        },
      },
      {
        id: "new-task",
        title: "New task",
        detail: "Add to calendar",
        kind: "command",
        shortcut: "Ctrl+Shift+T",
        icon: CalendarPlus,
        run: () => state.setModule("calendar"),
      },
      ...(["notes", "maps", "calendar", "daily", "recap", "settings"] as ModuleId[]).map(
        (module) => ({
          id: module,
          title: `Open ${module}`,
          detail: "Navigate",
          kind: "command",
          shortcut: "",
          icon: module === "maps" ? Map : module === "settings" ? Settings : Command,
          run: () => state.setModule(module),
        }),
      ),
    ];
    const content = [
      ...selectWorkspace(state.notes, state.activeWorkspaceId).map((note) => ({
        id: note.id,
        title: note.title,
        detail: note.path,
        kind: "note",
        shortcut: "",
        icon: FileText,
        run: () =>
          state.openTab({
            module: "notes",
            title: note.title,
            entityId: note.id,
          }),
      })),
      ...selectWorkspace(state.maps, state.activeWorkspaceId).map((map) => ({
        id: map.id,
        title: map.name,
        detail: map.path,
        kind: "map",
        shortcut: "",
        icon: Map,
        run: () => state.openTab({ module: "maps", title: map.name, entityId: map.id }),
      })),
      ...selectWorkspace(state.items, state.activeWorkspaceId).map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.kind,
        kind: "item",
        shortcut: "",
        icon: CalendarPlus,
        run: () => state.setModule("calendar"),
      })),
    ];
    const workspaceNotes = selectWorkspace(state.notes, state.activeWorkspaceId);
    const tags = [...new Set(workspaceNotes.flatMap((note) => note.tags))].map((tag) => ({
      id: `tag-${tag}`,
      title: `#${tag}`,
      detail: `${workspaceNotes.filter((note) => note.tags.includes(tag)).length} notes`,
      kind: "tag",
      shortcut: "",
      icon: Hash,
      run: () => {
        state.setModule("notes");
      },
    }));
    const courses = selectWorkspace(state.courses, state.activeWorkspaceId).map((course) => ({
      id: course.id,
      title: course.name,
      detail: `${course.code} · ${course.semester}`,
      kind: "course",
      shortcut: "",
      icon: BookOpen,
      run: () => state.setModule("notes"),
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
              : [...commands, ...content, ...tags, ...courses];
    const term = [">", "#", "@", "/"].includes(prefix ?? "") ? query.slice(1) : query;
    if (!term) return source.slice(0, 10);
    return new Fuse(source, { keys: ["title", "detail"], threshold: 0.4 })
      .search(term)
      .map((result) => result.item)
      .slice(0, 12);
  }, [query, state]);
  useEffect(() => setSelectedIndex(0), [query]);
  const choose = (item: (typeof items)[number]) => {
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
