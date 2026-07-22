import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import ImageExtension from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import UnderlineExtension from "@tiptap/extension-underline";
import {
  Bold,
  BookOpen,
  Braces,
  ChevronDown,
  Code2,
  Download,
  FilePlus2,
  Folder,
  FolderPlus,
  GraduationCap,
  Hash,
  Heading1,
  Heading2,
  Highlighter,
  History,
  Italic,
  LayoutTemplate,
  Library,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MoreHorizontal,
  Network,
  Brain,
  Quote,
  Redo2,
  Replace,
  Search,
  Sigma,
  Star,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import type { Note } from "@/shared/models";
import { parseWikiLinks, previewReplace, searchNotes } from "./logic";
import {
  AttachmentBlock,
  CalloutBlock,
  CodeBlock,
  FlashcardBlock,
  MathBlock,
  MathInline,
  MermaidBlock,
} from "./extensions";
import { NotePropertiesPanel } from "./NoteProperties";
import { RevisionPanel } from "./RevisionPanel";
import { NoteExportDialog } from "./NoteExportDialog";
import { StudentHub, type StudentView } from "@/modules/student/StudentHub";
import { ReferenceListBlock } from "@/modules/student/ReferenceListBlock";

export function NotesView() {
  const state = useDiornaStore();
  const allNotes = selectWorkspace(state.notes, state.activeWorkspaceId).filter(
    (note) => !note.trashedAt,
  );
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"editor" | "graph" | StudentView>("editor");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceSearch, setReplaceSearch] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [replacementUndo, setReplacementUndo] = useState<Array<{ id: string; body: string }>>([]);
  const [newFolder, setNewFolder] = useState("");
  const savedKey = `diorna-saved-searches-${state.activeWorkspaceId}`;
  const [savedSearches, setSavedSearches] = useState<
    Array<{ id: string; name: string; query: string }>
  >([]);
  useEffect(() => {
    try {
      setSavedSearches(JSON.parse(localStorage.getItem(savedKey) ?? "[]"));
    } catch {
      setSavedSearches([]);
    }
  }, [savedKey]);
  const persistSearches = (next: typeof savedSearches) => {
    setSavedSearches(next);
    localStorage.setItem(savedKey, JSON.stringify(next));
  };
  const notes = useMemo(() => searchNotes(allNotes, filter), [allNotes, filter]);
  const folders = useMemo(
    () =>
      [...new Set(allNotes.map((entry) => noteFolder(entry.path)).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [allNotes],
  );
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allNotes.forEach((entry) =>
      entry.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)),
    );
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [allNotes]);
  const replacementPreview = useMemo(
    () => previewReplace(notes, replaceSearch, replaceWith),
    [notes, replaceSearch, replaceWith],
  );
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const studentWorkspace =
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.kind ===
    "student";
  const [selectedId, setSelectedId] = useState(activeTab?.entityId ?? notes[0]?.id);
  useEffect(() => {
    if (activeTab?.entityId) setSelectedId(activeTab.entityId);
  }, [activeTab?.entityId]);
  const note = allNotes.find((entry) => entry.id === selectedId);
  const create = (folder = "") => {
    const created = state.addNote();
    if (folder)
      state.updateNote(created.id, {
        path: `notes/${folder.replace(/^\/+|\/+$/g, "")}/${created.title}.md`,
      });
    setSelectedId(created.id);
    state.openTab({
      module: "notes",
      title: created.title,
      entityId: created.id,
    });
  };
  return (
    <div className="notes-layout">
      <aside className="note-list-panel">
        <header>
          <div>
            <span className="eyebrow">All notes</span>
            <strong>{notes.length} notes</strong>
          </div>
          <button className="icon-button" aria-label="New note" onClick={() => create()}>
            <FilePlus2 size={17} />
          </button>
          <button
            className={`icon-button ${view === "graph" ? "active" : ""}`}
            aria-label="Note graph"
            title="Note graph (read-only)"
            onClick={() => setView((current) => (current === "graph" ? "editor" : "graph"))}
          >
            <Network size={17} />
          </button>
          <button
            className={`icon-button ${replaceOpen ? "active" : ""}`}
            aria-label="Search and replace"
            title="Search and replace"
            onClick={() => setReplaceOpen((open) => !open)}
          >
            <Replace size={16} />
          </button>
        </header>
        <div className="note-filter">
          <Hash size={14} />
          <input
            placeholder="Search notes or use tag:, folder:, course:…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          {filter && (
            <button
              className="button compact"
              title="Pin this saved search"
              onClick={() => {
                if (savedSearches.some((entry) => entry.query === filter)) return;
                persistSearches([
                  ...savedSearches,
                  { id: crypto.randomUUID(), name: filter, query: filter },
                ]);
              }}
            >
              Save
            </button>
          )}
        </div>
        <div className="note-browser">
          {!!allNotes.some((entry) => entry.starred) && (
            <details open>
              <summary>
                <Star size={13} /> Favourites
              </summary>
              {allNotes
                .filter((entry) => entry.starred)
                .map((entry) => (
                  <button key={entry.id} onClick={() => setSelectedId(entry.id)}>
                    {entry.title}
                  </button>
                ))}
            </details>
          )}
          <details open>
            <summary>
              <Folder size={13} /> Folders
            </summary>
            <button onClick={() => setFilter("")}>
              All notes <small>{allNotes.length}</small>
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                style={{ paddingInlineStart: `${10 + folder.split("/").length * 10}px` }}
                onClick={() => setFilter(`folder:"${folder}"`)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const id = event.dataTransfer.getData("text/diorna-note");
                  const moved = allNotes.find((entry) => entry.id === id);
                  if (moved)
                    state.updateNote(id, { path: `notes/${folder}/${fileName(moved.path)}` });
                }}
              >
                {folder.split("/").at(-1)}
                <small>
                  {allNotes.filter((entry) => noteFolder(entry.path).startsWith(folder)).length}
                </small>
              </button>
            ))}
            <form
              className="new-folder-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (newFolder.trim()) create(newFolder.trim());
                setNewFolder("");
              }}
            >
              <FolderPlus size={13} />
              <input
                aria-label="New folder name"
                placeholder="New folder + note"
                value={newFolder}
                onChange={(event) => setNewFolder(event.target.value)}
              />
            </form>
          </details>
          {!!tagCounts.length && (
            <details>
              <summary>
                <Hash size={13} /> Tags
              </summary>
              {tagCounts.map(([tag, count]) => (
                <button key={tag} onClick={() => setFilter(`tag:${tag}`)}>
                  #{tag} <small>{count}</small>
                </button>
              ))}
            </details>
          )}
          {!!savedSearches.length && (
            <details open>
              <summary>
                <Search size={13} /> Saved searches
              </summary>
              {savedSearches.map((saved) => (
                <div className="saved-search-row" key={saved.id}>
                  <button onClick={() => setFilter(saved.query)}>{saved.name}</button>
                  <button
                    aria-label={`Delete ${saved.name} saved search`}
                    onClick={() =>
                      persistSearches(savedSearches.filter((entry) => entry.id !== saved.id))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </details>
          )}
          {studentWorkspace && (
            <details open>
              <summary>
                <GraduationCap size={13} /> Study
              </summary>
              <button onClick={() => setView("courses")}>
                <BookOpen size={13} /> Courses
              </button>
              <button onClick={() => setView("templates")}>
                <LayoutTemplate size={13} /> Templates
              </button>
              <button onClick={() => setView("review")}>
                <Brain size={13} /> Review{" "}
                <small>
                  {
                    state.flashcards.filter(
                      (card) =>
                        card.workspaceId === state.activeWorkspaceId &&
                        card.dueDate <= new Date().toISOString().slice(0, 10),
                    ).length
                  }
                </small>
              </button>
              <button onClick={() => setView("references")}>
                <Library size={13} /> Bibliography
              </button>
            </details>
          )}
        </div>
        {replaceOpen && (
          <section className="replace-panel" aria-label="Search and replace">
            <input
              autoFocus
              placeholder="Find in filtered notes"
              value={replaceSearch}
              onChange={(event) => setReplaceSearch(event.target.value)}
            />
            <input
              placeholder="Replace with"
              value={replaceWith}
              onChange={(event) => setReplaceWith(event.target.value)}
            />
            <div className="replace-actions">
              <span>{replacementPreview.length} affected lines</span>
              <button
                className="button compact primary"
                disabled={!replacementPreview.length}
                onClick={() => {
                  const affected = notes.filter((entry) => entry.body.includes(replaceSearch));
                  setReplacementUndo(affected.map((entry) => ({ id: entry.id, body: entry.body })));
                  affected.forEach((entry) =>
                    state.updateNote(entry.id, {
                      body: entry.body.replaceAll(replaceSearch, replaceWith),
                    }),
                  );
                }}
              >
                Replace all
              </button>
              <button
                className="button compact"
                disabled={!replacementUndo.length}
                onClick={() => {
                  replacementUndo.forEach((entry) =>
                    state.updateNote(entry.id, { body: entry.body }),
                  );
                  setReplacementUndo([]);
                }}
              >
                Undo
              </button>
            </div>
            <div className="replace-preview">
              {replacementPreview.slice(0, 30).map((entry) => (
                <div key={`${entry.noteId}-${entry.line}`}>
                  <strong>
                    {entry.title}:{entry.line}
                  </strong>
                  <del>{entry.before}</del>
                  <ins>{entry.after}</ins>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="note-list">
          {notes.map((entry) => (
            <div
              className={`note-list-row ${entry.id === selectedId ? "active" : ""}`}
              key={entry.id}
              draggable
              onDragStart={(event) => event.dataTransfer.setData("text/diorna-note", entry.id)}
            >
              <button
                onClick={() => {
                  setSelectedId(entry.id);
                  setView("editor");
                  state.openTab({
                    module: "notes",
                    title: entry.title,
                    entityId: entry.id,
                  });
                }}
              >
                <strong>{entry.title}</strong>
                <p>
                  <HighlightedText
                    text={stripHtml(entry.body).slice(0, 120) || "Empty note"}
                    query={filter}
                  />
                </p>
                <small>
                  {noteFolder(entry.path) || "Root"} ·{" "}
                  {entry.tags.map((tag) => `#${tag}`).join(" ")}
                </small>
              </button>
              <button
                className="star-note"
                aria-label={entry.starred ? `Unstar ${entry.title}` : `Star ${entry.title}`}
                onClick={() => state.updateNote(entry.id, { starred: !entry.starred })}
              >
                <Star size={13} fill={entry.starred ? "currentColor" : "none"} />
              </button>
            </div>
          ))}
        </div>
      </aside>
      {view === "graph" ? (
        <NoteGraph
          notes={allNotes}
          courses={state.courses.filter((entry) => entry.workspaceId === state.activeWorkspaceId)}
          {...(selectedId ? { activeNoteId: selectedId } : {})}
          onOpen={(id) => {
            const target = allNotes.find((entry) => entry.id === id);
            if (!target) return;
            setSelectedId(id);
            setView("editor");
            state.openTab({ module: "notes", title: target.title, entityId: id });
          }}
        />
      ) : (["courses", "templates", "review", "references"] as string[]).includes(view) ? (
        <StudentHub
          view={view as StudentView}
          onOpenNote={(target) => {
            setSelectedId(target.id);
            setView("editor");
            state.openTab({ module: "notes", title: target.title, entityId: target.id });
          }}
        />
      ) : note ? (
        <Editor key={note.id} noteId={note.id} />
      ) : (
        <div className="empty-state">
          <FilePlus2 />
          <h2>Create your first note</h2>
          <p>
            Capture an idea, lecture, or project plan. It will be stored as Markdown in your vault.
          </p>
          <button className="button primary" onClick={() => create()}>
            New note
          </button>
        </div>
      )}
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const words = query
    .replace(/\b(?:AND|OR|NOT)\b|\w+:/gi, " ")
    .match(/[\p{L}\p{N}_-]{2,}/gu)
    ?.slice(0, 5);
  if (!words?.length) return text;
  const pattern = new RegExp(`(${words.map(escapeRegex).join("|")})`, "gi");
  return text
    .split(pattern)
    .map((part, index) =>
      words.some((word) => word.toLocaleLowerCase() === part.toLocaleLowerCase()) ? (
        <mark key={`${part}-${index}`}>{part}</mark>
      ) : (
        part
      ),
    );
}

function NoteGraph({
  notes: allNotes,
  courses,
  activeNoteId,
  onOpen,
}: {
  notes: Note[];
  courses: Array<{ id: string; code: string }>;
  activeNoteId?: string;
  onOpen: (id: string) => void;
}) {
  const [tag, setTag] = useState("");
  const [folder, setFolder] = useState("");
  const [courseId, setCourseId] = useState("");
  const [depth, setDepth] = useState<"1" | "2" | "3" | "all">("all");
  const allByTitle = new Map(allNotes.map((note) => [note.title.toLocaleLowerCase(), note]));
  const allEdges = allNotes.flatMap((source) =>
    parseWikiLinks(stripHtml(source.body)).flatMap((link) => {
      const target = allByTitle.get(link.target.toLocaleLowerCase());
      return target ? [{ source, target }] : [];
    }),
  );
  let notes = allNotes.filter(
    (entry) =>
      (!tag || entry.tags.some((value) => value === tag || value.startsWith(`${tag}/`))) &&
      (!folder || noteFolder(entry.path).startsWith(folder)) &&
      (!courseId || entry.courseId === courseId),
  );
  if (depth !== "all" && activeNoteId) {
    const visible = new Set([activeNoteId]);
    let frontier = new Set([activeNoteId]);
    for (let step = 0; step < Number(depth); step += 1) {
      const next = new Set<string>();
      allEdges.forEach(({ source, target }) => {
        if (frontier.has(source.id)) next.add(target.id);
        if (frontier.has(target.id)) next.add(source.id);
      });
      next.forEach((id) => visible.add(id));
      frontier = next;
    }
    notes = notes.filter((entry) => visible.has(entry.id));
  }
  const width = 900;
  const height = 620;
  const positions = new Map(
    notes.map((note, index) => {
      const angle = (index / Math.max(1, notes.length)) * Math.PI * 2;
      const ring = 180 + (index % 3) * 42;
      return [
        note.id,
        { x: width / 2 + Math.cos(angle) * ring, y: height / 2 + Math.sin(angle) * ring },
      ];
    }),
  );
  const visibleIds = new Set(notes.map((entry) => entry.id));
  const edges = allEdges.filter(
    ({ source, target }) => visibleIds.has(source.id) && visibleIds.has(target.id),
  );
  const degrees = new Map<string, number>();
  edges.forEach(({ source, target }) => {
    degrees.set(source.id, (degrees.get(source.id) ?? 0) + 1);
    degrees.set(target.id, (degrees.get(target.id) ?? 0) + 1);
  });
  return (
    <section className="note-graph" aria-label="Read-only note graph">
      <header>
        <div>
          <span className="eyebrow">Knowledge graph</span>
          <h2>
            {notes.length} notes · {edges.length} links
          </h2>
        </div>
        <span className="badge">Read-only · distinct from Maps</span>
      </header>
      <div className="graph-filters" aria-label="Graph filters">
        <select aria-label="Graph tag" value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="">All tags</option>
          {[...new Set(allNotes.flatMap((entry) => entry.tags))].sort().map((entry) => (
            <option value={entry} key={entry}>
              #{entry}
            </option>
          ))}
        </select>
        <select
          aria-label="Graph folder"
          value={folder}
          onChange={(event) => setFolder(event.target.value)}
        >
          <option value="">All folders</option>
          {[...new Set(allNotes.map((entry) => noteFolder(entry.path)).filter(Boolean))]
            .sort()
            .map((entry) => (
              <option value={entry} key={entry}>
                {entry}
              </option>
            ))}
        </select>
        <select
          aria-label="Graph course"
          value={courseId}
          onChange={(event) => setCourseId(event.target.value)}
        >
          <option value="">All courses</option>
          {courses.map((course) => (
            <option value={course.id} key={course.id}>
              {course.code}
            </option>
          ))}
        </select>
        <select
          aria-label="Link depth"
          value={depth}
          onChange={(event) => setDepth(event.target.value as typeof depth)}
        >
          <option value="1">1 link</option>
          <option value="2">2 links</option>
          <option value="3">3 links</option>
          <option value="all">All links</option>
        </select>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Linked notes graph">
        {edges.map(({ source, target }, index) => {
          const from = positions.get(source.id)!;
          const to = positions.get(target.id)!;
          return (
            <line
              key={`${source.id}-${target.id}-${index}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
        {notes.map((entry) => {
          const point = positions.get(entry.id)!;
          const radius = 15 + Math.min(14, (degrees.get(entry.id) ?? 0) * 3);
          return (
            <g
              key={entry.id}
              onClick={() => onOpen(entry.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onOpen(entry.id);
              }}
              role="button"
              tabIndex={0}
            >
              <circle cx={point.x} cy={point.y} r={radius} />
              <text x={point.x} y={point.y + radius + 16} textAnchor="middle">
                {entry.title}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function Editor({ noteId }: { noteId: string }) {
  const state = useDiornaStore();
  const updateNote = state.updateNote;
  const note = state.notes.find((entry) => entry.id === noteId)!;
  const [title, setTitle] = useState(note.title);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [wikiQuery, setWikiQuery] = useState<string>();
  const [citationQuery, setCitationQuery] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mathPickerOpen, setMathPickerOpen] = useState(false);
  const [mathSearch, setMathSearch] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [typewriter, setTypewriter] = useState(false);
  const [lineWidth, setLineWidth] = useState<"narrow" | "normal" | "wide" | "full">("normal");
  const saveTimer = useRef<number>();
  const workspaceNotes = state.notes.filter(
    (entry) => entry.workspaceId === note.workspaceId && !entry.trashedAt,
  );
  const courses = state.courses.filter((entry) => entry.workspaceId === note.workspaceId);
  const references = state.references.filter((entry) => entry.workspaceId === note.workspaceId);
  const notesRef = useRef(workspaceNotes);
  const noteRef = useRef(note);
  notesRef.current = workspaceNotes;
  noteRef.current = note;
  const openWikiTarget = (targetTitle: string) => {
    const target = notesRef.current.find(
      (entry) => entry.title.toLocaleLowerCase() === targetTitle.toLocaleLowerCase(),
    );
    if (target) {
      state.openTab({ module: "notes", title: target.title, entityId: target.id });
      return;
    }
    const created = state.addNote(targetTitle);
    const folder = noteFolder(noteRef.current.path);
    if (folder) state.updateNote(created.id, { path: `notes/${folder}/${fileName(created.path)}` });
    state.openTab({ module: "notes", title: created.title, entityId: created.id });
  };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      Placeholder.configure({
        placeholder: "Type '/' for blocks, '[[' to link a note…",
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ImageExtension.configure({ allowBase64: false, inline: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ["heading", "paragraph", "image"] }),
      UnderlineExtension,
      MathBlock,
      MathInline,
      CodeBlock,
      CalloutBlock,
      FlashcardBlock,
      ReferenceListBlock,
      MermaidBlock,
      AttachmentBlock,
    ],
    content: note.body,
    onUpdate: ({ editor: current }) => {
      const text = current.getText();
      const { $from } = current.state.selection;
      const beforeCursor = $from.parent.textBetween(0, $from.parentOffset, " ", " ");
      const wikiMatch = beforeCursor.match(/\[\[([^\]]*)$/);
      setWikiQuery(wikiMatch?.[1]);
      const citationMatch = wikiMatch
        ? undefined
        : beforeCursor.match(/(?:^|\s)@([\p{L}\p{N}_-]*)$/u);
      setCitationQuery(citationMatch?.[1]);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(
        () =>
          state.updateNote(noteId, {
            body: current.getHTML(),
            wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
          }),
        700,
      );
    },
    onBlur: ({ editor: current }) =>
      updateNote(noteId, {
        body: current.getHTML(),
        wordCount: current.getText().trim().split(/\s+/).filter(Boolean).length,
      }),
    onSelectionUpdate: ({ editor: current }) => {
      if (!typewriter) return;
      const selection = current.view.domAtPos(current.state.selection.head).node;
      const element = selection instanceof Element ? selection : selection.parentElement;
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    editorProps: {
      attributes: {
        class: "prose-editor",
        spellcheck: "true",
        "aria-label": "Note editor",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "/") {
          window.setTimeout(() => setSlashOpen(true), 0);
          setSlashQuery("");
        }
        if (event.key === "Escape") {
          setSlashOpen(false);
          setWikiQuery(undefined);
          setCitationQuery(undefined);
        }
        return false;
      },
      handleClick: (view, position) => {
        const resolved = view.state.doc.resolve(position);
        if (!resolved.parent.isTextblock) return false;
        const text = resolved.parent.textContent;
        const offset = position - resolved.start();
        const link = parseWikiLinks(text).find(
          (entry) => offset >= entry.index && offset <= entry.index + entry.length,
        );
        if (!link) return false;
        openWikiTarget(link.target);
        return true;
      },
    },
  });
  useEffect(() => {
    const save = () => {
      if (!editor) return;
      updateNote(noteId, {
        body: editor.getHTML(),
        wordCount: editor.getText().trim().split(/\s+/).filter(Boolean).length,
      });
    };
    window.addEventListener("beforeunload", save);
    return () => {
      window.clearTimeout(saveTimer.current);
      window.removeEventListener("beforeunload", save);
      save();
    };
  }, [editor, noteId, updateNote]);
  useEffect(() => {
    document.body.classList.toggle("note-focus-mode", focusMode);
    return () => document.body.classList.remove("note-focus-mode");
  }, [focusMode]);
  const counts = (() => {
    const text = editor?.getText() ?? "";
    return {
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
      chars: text.length,
    };
  })();
  if (!editor) return <div className="editor-loading">Loading editor…</div>;
  const buttons = [
    {
      label: "Undo",
      icon: Undo2,
      run: () => editor.chain().focus().undo().run(),
      active: false,
    },
    {
      label: "Redo",
      icon: Redo2,
      run: () => editor.chain().focus().redo().run(),
      active: false,
    },
    {
      label: "Bold",
      icon: Bold,
      run: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive("bold"),
    },
    {
      label: "Italic",
      icon: Italic,
      run: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive("italic"),
    },
    {
      label: "Underline",
      icon: Underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
      active: editor.isActive("underline"),
    },
    {
      label: "Highlight",
      icon: Highlighter,
      run: () => editor.chain().focus().toggleHighlight().run(),
      active: editor.isActive("highlight"),
    },
    {
      label: "Heading 1",
      icon: Heading1,
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      active: editor.isActive("heading", { level: 1 }),
    },
    {
      label: "Heading 2",
      icon: Heading2,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive("heading", { level: 2 }),
    },
    {
      label: "Bulleted list",
      icon: List,
      run: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive("bulletList"),
    },
    {
      label: "Numbered list",
      icon: ListOrdered,
      run: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive("orderedList"),
    },
    {
      label: "Task list",
      icon: ListChecks,
      run: () =>
        editor.commands.insertContent(
          '<ul data-type="taskList"><li data-checked="false"><p>Task</p></li></ul>',
        ),
      active: false,
    },
    {
      label: "Quote",
      icon: Quote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive("blockquote"),
    },
    {
      label: "Code block",
      icon: Code2,
      run: () => editor.chain().focus().toggleCodeBlock().run(),
      active: editor.isActive("codeBlock"),
    },
    {
      label: "Table",
      icon: Table2,
      run: () =>
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      active: editor.isActive("table"),
    },
  ];
  const slashCommands = [
    ["Paragraph", "Text", () => editor.chain().focus().setParagraph().run()],
    ["Heading 1", "Text", () => editor.chain().focus().setHeading({ level: 1 }).run()],
    ["Heading 2", "Text", () => editor.chain().focus().setHeading({ level: 2 }).run()],
    ["Heading 3", "Text", () => editor.chain().focus().setHeading({ level: 3 }).run()],
    ["Heading 4", "Text", () => editor.chain().focus().setHeading({ level: 4 }).run()],
    ["Bulleted list", "Text", () => editor.chain().focus().toggleBulletList().run()],
    ["Numbered list", "Text", () => editor.chain().focus().toggleOrderedList().run()],
    ["Checkbox list", "Text", () => editor.chain().focus().toggleTaskList().run()],
    ["Quote", "Text", () => editor.chain().focus().toggleBlockquote().run()],
    [
      "Callout",
      "Text",
      () =>
        editor.commands.insertContent({
          type: "calloutBlock",
          attrs: { tone: "info", icon: "💡" },
          content: [{ type: "paragraph" }],
        }),
    ],
    ["Divider", "Text", () => editor.chain().focus().setHorizontalRule().run()],
    ["Code", "Technical", () => editor.chain().focus().toggleCodeBlock().run()],
    [
      "Math equation",
      "Technical",
      () =>
        editor.commands.insertContent({
          type: "mathBlock",
          attrs: { latex: "E = mc^2" },
        }),
    ],
    ["Mermaid diagram", "Technical", () => editor.commands.insertContent({ type: "mermaidBlock" })],
    [
      "Table",
      "Structure",
      () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    ],
    [
      "Image",
      "Media",
      () =>
        editor.commands.insertContent({
          type: "attachmentBlock",
          attrs: { kind: "image", title: "Image" },
        }),
    ],
    [
      "Video",
      "Media",
      () =>
        editor.commands.insertContent({
          type: "attachmentBlock",
          attrs: { kind: "video", title: "Video" },
        }),
    ],
    [
      "Audio",
      "Media",
      () =>
        editor.commands.insertContent({
          type: "attachmentBlock",
          attrs: { kind: "audio", title: "Audio" },
        }),
    ],
    [
      "PDF",
      "Media",
      () =>
        editor.commands.insertContent({
          type: "attachmentBlock",
          attrs: { kind: "pdf", title: "PDF document" },
        }),
    ],
    [
      "File attachment",
      "Media",
      () =>
        editor.commands.insertContent({
          type: "attachmentBlock",
          attrs: { kind: "file", title: "File attachment" },
        }),
    ],
    [
      "Columns",
      "Structure",
      () =>
        editor.commands.insertContent({
          type: "attachmentBlock",
          attrs: { kind: "columns", title: "2 columns" },
        }),
    ],
    [
      "Note embed",
      "Structure",
      () =>
        editor.commands.insertContent({
          type: "attachmentBlock",
          attrs: { kind: "embed", title: "Linked note" },
        }),
    ],
    [
      "Web bookmark",
      "Structure",
      () =>
        editor.commands.insertContent({
          type: "attachmentBlock",
          attrs: { kind: "bookmark", title: "Web bookmark" },
        }),
    ],
    [
      "Table of contents",
      "Structure",
      () =>
        editor.commands.insertContent({
          type: "attachmentBlock",
          attrs: { kind: "toc", title: "Table of contents" },
        }),
    ],
    ["Reference list", "Study", () => editor.commands.insertContent({ type: "referenceList" })],
    ["Flashcard", "Study", () => editor.commands.insertContent({ type: "flashcardBlock" })],
  ] as const;
  const runSlash = (run: () => unknown) => {
    const from = Math.max(1, editor.state.selection.from - 1);
    editor.chain().focus().deleteRange({ from, to: editor.state.selection.from }).run();
    run();
    setSlashOpen(false);
  };
  return (
    <article className={`note-editor line-${lineWidth} ${typewriter ? "typewriter-mode" : ""}`}>
      <header className="editor-toolbar">
        {buttons.map(({ label, icon: Icon, run, active }, index) => (
          <button
            key={`${label}-${index}`}
            className={active ? "active" : ""}
            title={label}
            aria-label={label}
            onClick={run}
          >
            <Icon size={15} />
          </button>
        ))}
        <span className="toolbar-divider" />
        <button title="Insert link">
          <Link2 size={15} />
        </button>
        <button
          title="Insert math"
          aria-label="Insert math"
          className={mathPickerOpen ? "active" : ""}
          onClick={() => setMathPickerOpen((open) => !open)}
        >
          <Sigma size={15} />
        </button>
        <button
          title="Insert code"
          aria-label="Insert code"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Braces size={15} />
        </button>
        <span className="toolbar-spacer" />
        <button title="Export note" aria-label="Export note" onClick={() => setExportOpen(true)}>
          <Download size={16} />
        </button>
        <button
          className={historyOpen ? "active" : ""}
          title="Revision history"
          aria-label="Revision history"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          <History size={16} />
        </button>
        <button
          className={moreOpen ? "active" : ""}
          aria-label="Editor options"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <MoreHorizontal size={16} />
        </button>
        {moreOpen && (
          <div className="editor-options-popover">
            <label>
              <input
                type="checkbox"
                checked={focusMode}
                onChange={(event) => setFocusMode(event.target.checked)}
              />{" "}
              Focus mode
            </label>
            <label>
              <input
                type="checkbox"
                checked={typewriter}
                onChange={(event) => setTypewriter(event.target.checked)}
              />{" "}
              Typewriter scrolling
            </label>
          </div>
        )}
        {mathPickerOpen && (
          <div className="math-picker">
            <header>
              <Search size={14} />
              <input
                autoFocus
                aria-label="Search mathematical symbols"
                placeholder="Search symbols and macros"
                value={mathSearch}
                onChange={(event) => setMathSearch(event.target.value)}
              />
            </header>
            <div>
              {mathSymbols
                .filter(([name, latex]) =>
                  `${name} ${latex}`.toLocaleLowerCase().includes(mathSearch.toLocaleLowerCase()),
                )
                .map(([name, latex]) => (
                  <button
                    title={`${name} · ${latex}`}
                    key={latex}
                    onClick={() => {
                      editor.commands.insertContent({ type: "mathInline", attrs: { latex } });
                      setMathPickerOpen(false);
                    }}
                  >
                    {latex}
                  </button>
                ))}
            </div>
            <button
              className="button compact"
              onClick={() => {
                editor.commands.insertContent({
                  type: "mathBlock",
                  attrs: { latex: mathSearch || "E = mc^2", number: "" },
                });
                setMathPickerOpen(false);
              }}
            >
              Insert display equation
            </button>
          </div>
        )}
      </header>
      <div className="editor-scroll">
        {slashOpen && (
          <div className="slash-menu">
            <header>
              <Search size={14} />
              <input
                autoFocus
                value={slashQuery}
                onChange={(event) => setSlashQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setSlashOpen(false);
                  }
                }}
                placeholder="Search blocks…"
              />
            </header>
            <div>
              {slashCommands
                .filter(([label, group]) =>
                  `${label} ${group}`.toLowerCase().includes(slashQuery.toLowerCase()),
                )
                .map(([label, group, run]) => (
                  <button key={label} onClick={() => runSlash(run)}>
                    <span>
                      <strong>{label}</strong>
                      <small>{group}</small>
                    </span>
                    <kbd>↵</kbd>
                  </button>
                ))}
            </div>
          </div>
        )}
        {wikiQuery !== undefined && (
          <div className="wiki-menu" role="listbox" aria-label="Link a note">
            <header>
              <Link2 size={14} />
              <span>{wikiQuery ? `Link “${wikiQuery}”` : "Link a note"}</span>
            </header>
            {workspaceNotes
              .filter((entry) =>
                entry.title.toLocaleLowerCase().includes(wikiQuery.toLocaleLowerCase()),
              )
              .slice(0, 8)
              .map((entry) => {
                const course = courses.find((item) => item.id === entry.courseId);
                return (
                  <button
                    role="option"
                    aria-selected="false"
                    key={entry.id}
                    onClick={() => {
                      const from = Math.max(1, editor.state.selection.from - wikiQuery.length - 2);
                      editor
                        .chain()
                        .focus()
                        .deleteRange({ from, to: editor.state.selection.from })
                        .insertContent(`[[${entry.title}]]`)
                        .run();
                      setWikiQuery(undefined);
                    }}
                  >
                    <strong>{entry.title}</strong>
                    <small>
                      {noteFolder(entry.path) || "Root"}
                      {course ? ` · ${course.code}` : ""}
                    </small>
                  </button>
                );
              })}
            {!workspaceNotes.some((entry) =>
              entry.title.toLocaleLowerCase().includes(wikiQuery.toLocaleLowerCase()),
            ) && (
              <button
                role="option"
                aria-selected="false"
                onClick={() => {
                  const title = wikiQuery.trim() || "Untitled";
                  const from = Math.max(1, editor.state.selection.from - wikiQuery.length - 2);
                  editor
                    .chain()
                    .focus()
                    .deleteRange({ from, to: editor.state.selection.from })
                    .insertContent(`[[${title}]]`)
                    .run();
                  setWikiQuery(undefined);
                }}
              >
                <strong>Create “{wikiQuery.trim() || "Untitled"}”</strong>
                <small>Created on click in {noteFolder(note.path) || "Root"}</small>
              </button>
            )}
          </div>
        )}
        {citationQuery !== undefined && !!references.length && (
          <div className="wiki-menu citation-menu" role="listbox" aria-label="Insert citation">
            <header>
              <Library size={14} />
              <span>Insert citation</span>
            </header>
            {references
              .filter((reference) =>
                `${reference.citationKey} ${reference.title}`
                  .toLocaleLowerCase()
                  .includes(citationQuery.toLocaleLowerCase()),
              )
              .slice(0, 8)
              .map((reference) => (
                <button
                  role="option"
                  aria-selected="false"
                  key={reference.id}
                  onClick={() => {
                    const from = Math.max(
                      1,
                      editor.state.selection.from - citationQuery.length - 1,
                    );
                    editor
                      .chain()
                      .focus()
                      .deleteRange({ from, to: editor.state.selection.from })
                      .insertContent(`[@${reference.citationKey}]`)
                      .run();
                    setCitationQuery(undefined);
                  }}
                >
                  <strong>@{reference.citationKey}</strong>
                  <small>{reference.title}</small>
                </button>
              ))}
          </div>
        )}
        <NotePropertiesPanel
          note={note}
          courses={courses}
          notes={workspaceNotes}
          onChange={(changes) => state.updateNote(noteId, changes)}
        />
        <input
          className="note-title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            const requestedTitle = title.trim().replace(/[<>:"/\\|?*]/g, "-") || "Untitled";
            const safeTitle = availableTitle(requestedTitle, note, workspaceNotes);
            setTitle(safeTitle);
            state.updateNote(noteId, {
              title: safeTitle,
              path: note.path.replace(/[^/]+\.md$/, `${safeTitle}.md`),
            });
          }}
          aria-label="Note title"
        />
        <div className="tag-row">
          {note.tags.map((tag) => (
            <button
              key={tag}
              title="Remove tag"
              onClick={() =>
                state.updateNote(noteId, { tags: note.tags.filter((entry) => entry !== tag) })
              }
            >
              #{tag} ×
            </button>
          ))}
          {addingTag ? (
            <input
              autoFocus
              aria-label="New tag"
              placeholder="nested/tag"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onBlur={() => {
                const tag = tagInput.trim().replace(/^#/, "").toLocaleLowerCase();
                if (tag && !note.tags.includes(tag))
                  state.updateNote(noteId, { tags: [...note.tags, tag] });
                setTagInput("");
                setAddingTag(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setTagInput("");
                  setAddingTag(false);
                }
              }}
            />
          ) : (
            <button onClick={() => setAddingTag(true)}>+ tag</button>
          )}
        </div>
        <EditorContent editor={editor} />
      </div>
      <footer className="editor-status">
        <span>Markdown</span>
        <span>
          {counts.words} words · {counts.chars} characters ·{" "}
          {Math.max(1, Math.ceil(counts.words / 220))} min read
        </span>
        <button
          onClick={() => {
            const widths = ["narrow", "normal", "wide", "full"] as const;
            setLineWidth(widths[(widths.indexOf(lineWidth) + 1) % widths.length]!);
          }}
        >
          {lineWidth[0]!.toUpperCase() + lineWidth.slice(1)} width <ChevronDown size={12} />
        </button>
      </footer>
      {historyOpen && (
        <RevisionPanel
          note={note}
          onClose={() => setHistoryOpen(false)}
          onRestore={(html) => {
            editor.commands.setContent(html);
            state.updateNote(noteId, {
              body: html,
              wordCount: editor.getText().trim().split(/\s+/).filter(Boolean).length,
            });
            setHistoryOpen(false);
          }}
        />
      )}
      {exportOpen && (
        <NoteExportDialog
          note={note}
          notes={workspaceNotes}
          courses={courses}
          references={references}
          onClose={() => setExportOpen(false)}
        />
      )}
    </article>
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noteFolder(path: string): string {
  const relative = path.replace(/^notes[\\/]/, "").replace(/\\/g, "/");
  const separator = relative.lastIndexOf("/");
  return separator < 0 ? "" : relative.slice(0, separator);
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").at(-1) ?? "Untitled.md";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function availableTitle(requested: string, note: Note, notes: Note[]): string {
  const folder = noteFolder(note.path).toLocaleLowerCase();
  const used = new Set(
    notes
      .filter(
        (entry) => entry.id !== note.id && noteFolder(entry.path).toLocaleLowerCase() === folder,
      )
      .map((entry) => entry.title.toLocaleLowerCase()),
  );
  let title = requested;
  let suffix = 2;
  while (used.has(title.toLocaleLowerCase())) {
    title = `${requested} ${suffix}`;
    suffix += 1;
  }
  return title;
}

const mathSymbols = [
  ["alpha", "\\alpha"],
  ["beta", "\\beta"],
  ["gamma", "\\gamma"],
  ["delta", "\\delta"],
  ["theta", "\\theta"],
  ["lambda", "\\lambda"],
  ["mu", "\\mu"],
  ["pi", "\\pi"],
  ["sigma", "\\sigma"],
  ["omega", "\\omega"],
  ["sum", "\\sum_{i=1}^{n}"],
  ["integral", "\\int_{a}^{b}"],
  ["fraction", "\\frac{a}{b}"],
  ["square root", "\\sqrt{x}"],
  ["limit", "\\lim_{x \\to \\infty}"],
  ["partial", "\\partial"],
  ["nabla", "\\nabla"],
  ["infinity", "\\infty"],
  ["approximately", "\\approx"],
  ["not equal", "\\neq"],
  ["less or equal", "\\leq"],
  ["greater or equal", "\\geq"],
  ["element of", "\\in"],
  ["subset", "\\subseteq"],
  ["forall", "\\forall"],
  ["exists", "\\exists"],
  ["vector", "\\vec{v}"],
  ["matrix", "\\begin{bmatrix}a & b \\\\ c & d\\end{bmatrix}"],
] as const;
