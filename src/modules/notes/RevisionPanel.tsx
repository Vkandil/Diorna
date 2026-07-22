import { useEffect, useMemo, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { readNativeNoteRevisions, type NoteRevision } from "@/core/native";
import type { Note } from "@/shared/models";

export function RevisionPanel({
  note,
  onClose,
  onRestore,
}: {
  note: Note;
  onClose: () => void;
  onRestore: (html: string) => void;
}) {
  const [revisions, setRevisions] = useState<NoteRevision[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    void readNativeNoteRevisions(note.workspaceId, note.id)
      .then((values) => {
        if (!active) return;
        setRevisions(values);
        setSelectedId(values[0]?.id);
      })
      .catch((reason: unknown) => active && setError(String(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [note.id, note.workspaceId]);
  const selected = revisions.find((revision) => revision.id === selectedId);
  const diff = useMemo(
    () => lineDiff(selected?.markdown ?? "", htmlToText(note.body)),
    [note.body, selected?.markdown],
  );
  return (
    <aside className="revision-panel" aria-label="Revision history">
      <header>
        <div>
          <History size={16} />
          <strong>Revision history</strong>
        </div>
        <button className="icon-button" aria-label="Close revision history" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <div className="revision-layout">
        <nav aria-label="Revisions">
          {loading && <p className="muted">Loading revisions…</p>}
          {error && <p className="error-text">{error}</p>}
          {!loading && !revisions.length && (
            <p className="muted">No earlier revisions yet. Revisions appear after edits.</p>
          )}
          {revisions.map((revision, index) => (
            <button
              className={revision.id === selectedId ? "active" : ""}
              key={revision.id}
              onClick={() => setSelectedId(revision.id)}
            >
              <strong>{new Date(revision.createdAt).toLocaleString()}</strong>
              <small>{index === 0 ? "Previous version" : `${index + 1} saves ago`}</small>
            </button>
          ))}
        </nav>
        <section className="revision-diff" aria-label="Revision diff">
          <header>
            <span>Earlier</span>
            <span>Current</span>
          </header>
          <pre>
            {diff.map((line, index) => (
              <span className={line.kind} key={`${line.kind}-${index}`}>
                <i>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</i>
                {line.text || " "}
              </span>
            ))}
          </pre>
          <button
            className="button primary"
            disabled={!selected}
            onClick={() => selected && onRestore(selected.html)}
          >
            <RotateCcw size={14} /> Restore this revision
          </button>
        </section>
      </div>
    </aside>
  );
}

type DiffLine = { kind: "same" | "added" | "removed"; text: string };

function lineDiff(before: string, after: string): DiffLine[] {
  const left = before.split(/\r?\n/);
  const right = after.split(/\r?\n/);
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1)
    for (let j = right.length - 1; j >= 0; j -= 1)
      rows[i]![j] =
        left[i] === right[j]
          ? rows[i + 1]![j + 1]! + 1
          : Math.max(rows[i + 1]![j]!, rows[i]![j + 1]!);
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      result.push({ kind: "same", text: left[i]! });
      i += 1;
      j += 1;
    } else if (j < right.length && (i === left.length || rows[i]![j + 1]! >= rows[i + 1]![j]!)) {
      result.push({ kind: "added", text: right[j++]! });
    } else {
      result.push({ kind: "removed", text: left[i++]! });
    }
  }
  return result;
}

function htmlToText(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.body.innerText || document.body.textContent || "";
}
