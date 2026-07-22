import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import katex from "katex";
import { Download, FileText, Printer, X } from "lucide-react";
import { exportMarkdownNotes } from "@/core/native";
import type { Course, Note, ReferenceRecord } from "@/shared/models";
import { citationKeys, formatReference, type CitationStyle } from "@/modules/student/bibliography";
import { extractOutline } from "./logic";

type ExportScope = "note" | "folder" | "course";

export function NoteExportDialog({
  note,
  notes,
  courses,
  references,
  onClose,
}: {
  note: Note;
  notes: Note[];
  courses: Course[];
  references: ReferenceRecord[];
  onClose: () => void;
}) {
  const [scope, setScope] = useState<ExportScope>("note");
  const [titlePage, setTitlePage] = useState(true);
  const [tableOfContents, setTableOfContents] = useState(true);
  const [pageNumbers, setPageNumbers] = useState(true);
  const course = courses.find((entry) => entry.id === note.courseId);
  const folder = noteFolder(note.path);
  const selected = useMemo(() => {
    if (scope === "folder") return notes.filter((entry) => noteFolder(entry.path) === folder);
    if (scope === "course" && note.courseId)
      return notes.filter((entry) => entry.courseId === note.courseId);
    return [note];
  }, [folder, note, notes, scope]);
  const exportName =
    scope === "folder" ? folder || "Root notes" : scope === "course" ? course?.name : note.title;
  const print = () => {
    const clear = () => {
      document.body.classList.remove("printing-notes");
      window.removeEventListener("afterprint", clear);
    };
    document.body.classList.add("printing-notes");
    window.addEventListener("afterprint", clear);
    window.setTimeout(() => window.print(), 50);
  };
  return (
    <>
      <div className="modal-layer" role="presentation" onMouseDown={onClose}>
        <section
          className="export-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-export-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <Download size={17} />
              <strong id="note-export-title">Export notes</strong>
            </div>
            <button className="icon-button" aria-label="Close export" onClick={onClose}>
              <X size={15} />
            </button>
          </header>
          <div className="export-dialog-body">
            <label>
              Scope
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as ExportScope)}
              >
                <option value="note">This note</option>
                <option value="folder">Folder: {folder || "Root"}</option>
                <option value="course" disabled={!course}>
                  Course: {course?.name ?? "No course assigned"}
                </option>
              </select>
            </label>
            <p className="muted">
              {selected.length} note{selected.length === 1 ? "" : "s"} selected. Markdown stays
              portable; PDF uses the rendered editor layout.
            </p>
            <fieldset>
              <legend>PDF options</legend>
              <label>
                <input
                  type="checkbox"
                  checked={titlePage}
                  onChange={(event) => setTitlePage(event.target.checked)}
                />
                Title page
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={tableOfContents}
                  onChange={(event) => setTableOfContents(event.target.checked)}
                />
                Table of contents
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={pageNumbers}
                  onChange={(event) => setPageNumbers(event.target.checked)}
                />
                Page numbers
              </label>
            </fieldset>
          </div>
          <footer>
            <button
              className="button"
              onClick={() => void exportMarkdownNotes(selected, exportName ?? "Diorna export")}
            >
              <FileText size={14} /> Export Markdown
            </button>
            <button className="button primary" onClick={print}>
              <Printer size={14} /> Print / save PDF
            </button>
          </footer>
        </section>
      </div>
      {createPortal(
        <PrintDocument
          title={exportName ?? "Diorna export"}
          notes={selected}
          titlePage={titlePage}
          tableOfContents={tableOfContents}
          pageNumbers={pageNumbers}
          references={references}
          {...(scope === "course" && course ? { course } : {})}
        />,
        document.body,
      )}
    </>
  );
}

function PrintDocument({
  title,
  notes,
  titlePage,
  tableOfContents,
  pageNumbers,
  references,
  course,
}: {
  title: string;
  notes: Note[];
  titlePage: boolean;
  tableOfContents: boolean;
  pageNumbers: boolean;
  references: ReferenceRecord[];
  course?: Course;
}) {
  return (
    <section className={`print-export ${pageNumbers ? "with-page-numbers" : ""}`}>
      {titlePage && (
        <header className="print-title-page">
          <span>Diorna</span>
          <h1>{title}</h1>
          {course && (
            <p>
              {course.code} · {course.semester} · {course.instructor}
            </p>
          )}
          <time>{new Date().toLocaleDateString()}</time>
        </header>
      )}
      {tableOfContents && (
        <nav className="print-toc">
          <h1>Table of contents</h1>
          {notes.map((entry) => (
            <div key={entry.id}>
              <strong>{entry.title}</strong>
              {extractOutline(entry.body).map((heading) => (
                <span
                  style={{ paddingInlineStart: `${(heading.level - 1) * 12}px` }}
                  key={heading.anchor}
                >
                  {heading.text}
                </span>
              ))}
            </div>
          ))}
        </nav>
      )}
      {notes.map((entry) => (
        <article className="print-note" key={entry.id}>
          <h1>{entry.title}</h1>
          {!!entry.tags.length && (
            <p className="print-tags">{entry.tags.map((tag) => `#${tag}`).join("  ")}</p>
          )}
          <div dangerouslySetInnerHTML={{ __html: renderExportHtml(entry.body, references) }} />
        </article>
      ))}
      {pageNumbers && <footer className="print-page-number" />}
    </section>
  );
}

function renderExportHtml(html: string, references: ReferenceRecord[]): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const keys = citationKeys(document.body.textContent ?? "");
  const cited = references.filter((reference) => keys.has(reference.citationKey.toLowerCase()));
  document.querySelectorAll<HTMLElement>('[data-type="reference-list"]').forEach((element) => {
    const style = (element.getAttribute("citationstyle") ?? "apa") as CitationStyle;
    element.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "References";
    element.append(heading);
    cited.forEach((reference, index) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = formatReference(reference, style, index + 1);
      element.append(paragraph);
    });
  });
  const equations = [...document.querySelectorAll<HTMLElement>('[data-type="math-block"]')];
  const labels = new Map<string, number>();
  let number = 0;
  equations.forEach((element) => {
    if (element.getAttribute("number") !== "auto") return;
    number += 1;
    const label = element.getAttribute("label")?.trim();
    if (label) labels.set(label, number);
  });
  const resolveReferences = (value: string) =>
    value.replace(/\\ref\{([^}]+)\}/g, (_, label: string) => String(labels.get(label) ?? "??"));
  number = 0;
  equations.forEach((element) => {
    const latex = resolveReferences(element.getAttribute("latex") ?? "");
    element.innerHTML = katex.renderToString(latex, {
      displayMode: true,
      throwOnError: false,
      trust: false,
    });
    if (element.getAttribute("number") === "auto") {
      number += 1;
      const badge = document.createElement("span");
      badge.className = "equation-number";
      badge.textContent = `(${number})`;
      element.append(badge);
    }
  });
  document.querySelectorAll<HTMLElement>('[data-type="math-inline"]').forEach((element) => {
    const latex = resolveReferences(element.getAttribute("latex") ?? "");
    element.innerHTML = katex.renderToString(latex, {
      displayMode: false,
      throwOnError: false,
      trust: false,
    });
  });
  document.querySelectorAll<HTMLElement>('[data-type="mermaid"]').forEach((element) => {
    if (!element.textContent?.trim()) element.textContent = element.getAttribute("code") ?? "";
  });
  return document.body.innerHTML;
}

function noteFolder(path: string): string {
  const relative = path.replace(/^notes[\\/]/, "").replace(/\\/g, "/");
  const separator = relative.lastIndexOf("/");
  return separator < 0 ? "" : relative.slice(0, separator);
}
