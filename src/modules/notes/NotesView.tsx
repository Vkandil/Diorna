import { useEffect, useMemo, useState } from "react";
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
  Braces,
  ChevronDown,
  Code2,
  FilePlus2,
  Hash,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MoreHorizontal,
  Quote,
  Redo2,
  Search,
  Sigma,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { searchNotes } from "./logic";
import {
  AttachmentBlock,
  CalloutBlock,
  FlashcardBlock,
  MathBlock,
  MermaidBlock,
} from "./extensions";

export function NotesView() {
  const state = useDiornaStore();
  const allNotes = selectWorkspace(state.notes, state.activeWorkspaceId).filter(
    (note) => !note.trashedAt,
  );
  const [filter, setFilter] = useState("");
  const notes = useMemo(() => searchNotes(allNotes, filter), [allNotes, filter]);
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const [selectedId, setSelectedId] = useState(activeTab?.entityId ?? notes[0]?.id);
  useEffect(() => {
    if (activeTab?.entityId) setSelectedId(activeTab.entityId);
  }, [activeTab?.entityId]);
  const note = notes.find((entry) => entry.id === selectedId);
  const create = () => {
    const created = state.addNote();
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
          <button className="icon-button" aria-label="New note" onClick={create}>
            <FilePlus2 size={17} />
          </button>
        </header>
        <div className="note-filter">
          <Hash size={14} />
          <input
            placeholder="Filter notes…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className="note-list">
          {notes.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === selectedId ? "active" : ""}
              onClick={() => {
                setSelectedId(entry.id);
                state.openTab({
                  module: "notes",
                  title: entry.title,
                  entityId: entry.id,
                });
              }}
            >
              <strong>{entry.title}</strong>
              <p>{stripHtml(entry.body).slice(0, 90) || "Empty note"}</p>
              <small>{entry.tags.map((tag) => `#${tag}`).join(" ")}</small>
            </button>
          ))}
        </div>
      </aside>
      {note ? (
        <Editor key={note.id} noteId={note.id} />
      ) : (
        <div className="empty-state">
          <FilePlus2 />
          <h2>Create your first note</h2>
          <p>
            Capture an idea, lecture, or project plan. It will be stored as Markdown in your vault.
          </p>
          <button className="button primary" onClick={create}>
            New note
          </button>
        </div>
      )}
    </div>
  );
}

function Editor({ noteId }: { noteId: string }) {
  const state = useDiornaStore();
  const note = state.notes.find((entry) => entry.id === noteId)!;
  const [title, setTitle] = useState(note.title);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit,
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
      CalloutBlock,
      FlashcardBlock,
      MermaidBlock,
      AttachmentBlock,
    ],
    content: note.body,
    onUpdate: ({ editor: current }) => {
      const text = current.getText();
      window.clearTimeout(Number(document.body.dataset.saveTimer));
      const timer = window.setTimeout(
        () =>
          state.updateNote(noteId, {
            body: current.getHTML(),
            wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
          }),
        700,
      );
      document.body.dataset.saveTimer = String(timer);
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
        if (event.key === "Escape") setSlashOpen(false);
        return false;
      },
    },
  });
  useEffect(
    () => () => {
      if (editor)
        state.updateNote(noteId, {
          body: editor.getHTML(),
          wordCount: editor.getText().trim().split(/\s+/).filter(Boolean).length,
        });
    },
    [editor, noteId, state],
  );
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
    ["Flashcard", "Study", () => editor.commands.insertContent({ type: "flashcardBlock" })],
  ] as const;
  const runSlash = (run: () => unknown) => {
    const from = Math.max(1, editor.state.selection.from - 1);
    editor.chain().focus().deleteRange({ from, to: editor.state.selection.from }).run();
    run();
    setSlashOpen(false);
  };
  return (
    <article className="note-editor">
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
        <button title="Insert math">
          <Sigma size={15} />
        </button>
        <button title="Insert code">
          <Braces size={15} />
        </button>
        <span className="toolbar-spacer" />
        <button>
          <MoreHorizontal size={16} />
        </button>
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
        <div className="note-properties">
          <button>+ Add property</button>
          <span>Updated just now</span>
        </div>
        <input
          className="note-title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            state.updateNote(noteId, {
              title,
              path: note.path.replace(/[^/]+\.md$/, `${title}.md`),
            });
          }}
          aria-label="Note title"
        />
        <div className="tag-row">
          {note.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
          <button>+ tag</button>
        </div>
        <EditorContent editor={editor} />
      </div>
      <footer className="editor-status">
        <span>Markdown</span>
        <span>
          {counts.words} words · {counts.chars} characters ·{" "}
          {Math.max(1, Math.ceil(counts.words / 220))} min read
        </span>
        <button>
          Normal width <ChevronDown size={12} />
        </button>
      </footer>
    </article>
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
