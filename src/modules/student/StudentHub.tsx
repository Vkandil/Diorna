import { useState } from "react";
import {
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  FileUp,
  Library,
  Plus,
  Sparkles,
} from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import type { Course, FlashcardGrade, Note } from "@/shared/models";
import { formatReference, parseBibTeX, parseCslJson, type CitationStyle } from "./bibliography";
import { longestReviewStreak, retentionRate } from "./flashcards";

export type StudentView = "courses" | "templates" | "review" | "references";

export function StudentHub({
  view,
  onOpenNote,
}: {
  view: StudentView;
  onOpenNote: (note: Note) => void;
}) {
  if (view === "courses") return <CoursesDashboard onOpenNote={onOpenNote} />;
  if (view === "templates") return <TemplateLibrary onOpenNote={onOpenNote} />;
  if (view === "review") return <ReviewView onOpenNote={onOpenNote} />;
  return <ReferenceLibrary />;
}

function CoursesDashboard({ onOpenNote }: { onOpenNote: (note: Note) => void }) {
  const state = useDiornaStore();
  const courses = selectWorkspace(state.courses, state.activeWorkspaceId);
  const notes = selectWorkspace(state.notes, state.activeWorkspaceId).filter(
    (note) => !note.trashedAt,
  );
  const items = selectWorkspace(state.items, state.activeWorkspaceId).filter(
    (item) => !item.trashedAt,
  );
  const maps = selectWorkspace(state.maps, state.activeWorkspaceId).filter((map) => !map.trashedAt);
  const cards = selectWorkspace(state.flashcards, state.activeWorkspaceId);
  const [selectedId, setSelectedId] = useState(courses[0]?.id);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const selected = courses.find((course) => course.id === selectedId);
  if (!selected)
    return (
      <section className="student-page empty-state">
        <BookOpen />
        <h2>Create your first course</h2>
        <p>Courses connect lecture notes, deadlines, maps, and flashcard progress.</p>
        <button className="button primary" onClick={() => setAdding(true)}>
          Add course
        </button>
        {adding && <CourseForm onDone={(course) => setSelectedId(course.id)} />}
      </section>
    );
  const courseNotes = notes.filter((note) => note.courseId === selected.id);
  const deadlines = items
    .filter((item) => item.courseId === selected.id && (item.dueAt || item.startAt))
    .sort((a, b) => (a.dueAt ?? a.startAt ?? "").localeCompare(b.dueAt ?? b.startAt ?? ""));
  const courseCards = cards.filter((card) => courseNotes.some((note) => note.id === card.noteId));
  const notePaths = new Set(courseNotes.map((note) => note.path));
  const linkedMaps = maps.filter((map) =>
    map.nodes.some((node) => node.file && notePaths.has(node.file)),
  );
  const dueCards = courseCards.filter((card) => card.dueDate <= today()).length;
  const grouped = groupNotesByWeek(courseNotes);
  const progress = semesterProgress(selected.semester);
  const createLecture = () => {
    const template =
      state.templates.find(
        (entry) =>
          entry.workspaceId === selected.workspaceId && entry.defaultCourseId === selected.id,
      ) ?? state.templates.find((entry) => entry.id === "template-lecture");
    if (!template) return;
    const note = state.createNoteFromTemplate(
      template.id,
      `${selected.code} · ${format(new Date(), "yyyy-MM-dd")}`,
      selected.id,
    );
    if (note) onOpenNote(note);
  };
  return (
    <section className="student-page course-dashboard">
      <header className="student-heading">
        <div>
          <span className="eyebrow">Course dashboard</span>
          <h1>
            {selected.code} · {selected.name}
          </h1>
          <p>
            {selected.semester} · {selected.instructor} · {selected.credits} ECTS ·{" "}
            {selected.schedule}
          </p>
        </div>
        <div className="button-row">
          <select
            aria-label="Course dashboard"
            value={selected.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {courses.map((course) => (
              <option value={course.id} key={course.id}>
                {course.code}
              </option>
            ))}
          </select>
          <button className="button" onClick={() => setAdding((open) => !open)}>
            <Plus size={14} /> Course
          </button>
          <button className="button" onClick={() => setEditing((open) => !open)}>
            Edit course
          </button>
          <button className="button primary" onClick={createLecture}>
            <Sparkles size={14} /> New lecture
          </button>
        </div>
      </header>
      {adding && (
        <CourseForm
          onDone={(course) => {
            setSelectedId(course.id);
            setAdding(false);
          }}
        />
      )}
      {editing && <CourseForm course={selected} onDone={() => setEditing(false)} />}
      <div className="course-progress-card">
        <span>Semester progress</span>
        <div>
          <i style={{ width: `${progress}%` }} />
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="student-stat-grid">
        <div>
          <strong>{courseNotes.length}</strong>
          <span>notes</span>
        </div>
        <div>
          <strong>{deadlines.filter((item) => !item.completedAt).length}</strong>
          <span>upcoming</span>
        </div>
        <div>
          <strong>{dueCards}</strong>
          <span>cards due</span>
        </div>
        <div>
          <strong>{courseCards.length}</strong>
          <span>flashcards</span>
        </div>
        <div>
          <strong>{linkedMaps.length}</strong>
          <span>linked maps</span>
        </div>
      </div>
      <div className="course-columns">
        <section className="student-card">
          <header>
            <BookOpen size={15} />
            <strong>Notes by week</strong>
          </header>
          {[...grouped]
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
            .map(([week, values]) => (
              <div className="week-group" key={week}>
                <span>{week}</span>
                {values.map((note) => (
                  <button key={note.id} onClick={() => onOpenNote(note)}>
                    {note.title}
                    <ChevronRight size={13} />
                  </button>
                ))}
              </div>
            ))}
          {!courseNotes.length && <p className="muted">No course notes yet.</p>}
        </section>
        <section className="student-card countdown-list">
          <header>
            <CalendarClock size={15} />
            <strong>Exams & deadlines</strong>
          </header>
          {deadlines.slice(0, 10).map((item) => {
            const date = parseISO(item.dueAt ?? item.startAt!);
            const days = differenceInCalendarDays(date, new Date());
            return (
              <button className={days <= 7 ? "urgent" : ""} key={item.id}>
                <i style={{ background: selected.color }} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{format(date, "EEE d MMM")}</small>
                </span>
                <b>{days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d`}</b>
              </button>
            );
          })}
          {!deadlines.length && <p className="muted">No linked deadlines.</p>}
        </section>
        <section className="student-card">
          <header>
            <Library size={15} />
            <strong>Linked maps</strong>
          </header>
          {linkedMaps.map((map) => (
            <button
              key={map.id}
              onClick={() => state.openTab({ module: "maps", title: map.name, entityId: map.id })}
            >
              {map.name}
              <ChevronRight size={13} />
            </button>
          ))}
          {!linkedMaps.length && (
            <p className="muted">Link a course note from a map to see it here.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function CourseForm({ course, onDone }: { course?: Course; onDone: (course: Course) => void }) {
  const state = useDiornaStore();
  const [name, setName] = useState(course?.name ?? "");
  const [code, setCode] = useState(course?.code ?? "");
  const [semester, setSemester] = useState(course?.semester ?? "");
  const [instructor, setInstructor] = useState(course?.instructor ?? "");
  const [credits, setCredits] = useState(course?.credits ?? 5);
  const [schedule, setSchedule] = useState(course?.schedule ?? "");
  const [color, setColor] = useState(course?.color ?? "#1D518A");
  return (
    <form
      className="course-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !code.trim()) return;
        const values = {
          name: name.trim(),
          code: code.trim(),
          semester,
          instructor,
          credits,
          schedule,
          color,
        };
        if (course) {
          state.updateCourse(course.id, values);
          onDone({ ...course, ...values });
        } else onDone(state.addCourse(values));
      }}
    >
      <input
        aria-label="Course name"
        placeholder="Course name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <input
        aria-label="Course code"
        placeholder="Code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <input
        aria-label="Semester"
        placeholder="Semester"
        value={semester}
        onChange={(event) => setSemester(event.target.value)}
      />
      <input
        aria-label="Instructor"
        placeholder="Instructor"
        value={instructor}
        onChange={(event) => setInstructor(event.target.value)}
      />
      <input
        aria-label="ECTS credits"
        type="number"
        min="0"
        value={credits}
        onChange={(event) => setCredits(Number(event.target.value))}
      />
      <input
        aria-label="Course schedule"
        placeholder="Schedule"
        value={schedule}
        onChange={(event) => setSchedule(event.target.value)}
      />
      <input
        aria-label="Course color"
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
      />
      <button className="button primary" type="submit">
        {course ? "Save course" : "Add course"}
      </button>
    </form>
  );
}

function TemplateLibrary({ onOpenNote }: { onOpenNote: (note: Note) => void }) {
  const state = useDiornaStore();
  const templates = selectWorkspace(state.templates, state.activeWorkspaceId);
  const courses = selectWorkspace(state.courses, state.activeWorkspaceId);
  const [selectedId, setSelectedId] = useState(templates[0]?.id);
  const [title, setTitle] = useState("New lecture");
  const template = templates.find((entry) => entry.id === selectedId);
  return (
    <section className="student-page template-page">
      <header className="student-heading">
        <div>
          <span className="eyebrow">Study templates</span>
          <h1>Reusable note structures</h1>
          <p>
            Variables: {"{{date}} {{time}} {{title}} {{course}} {{week}} {{semester}} {{cursor}}"}
          </p>
        </div>
        <button
          className="button"
          onClick={() => {
            const value = state.addTemplate();
            setSelectedId(value.id);
          }}
        >
          <Plus size={14} /> New template
        </button>
      </header>
      <div className="template-layout">
        <nav>
          {templates.map((entry) => (
            <button
              className={entry.id === selectedId ? "active" : ""}
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
            >
              <strong>{entry.name}</strong>
              <small>{entry.builtIn ? "Built in · editable" : "Custom"}</small>
            </button>
          ))}
        </nav>
        {template && (
          <div className="template-editor">
            <input
              aria-label="Template name"
              value={template.name}
              onChange={(event) => state.updateTemplate(template.id, { name: event.target.value })}
            />
            <label>
              Default for course
              <select
                value={template.defaultCourseId ?? ""}
                onChange={(event) => {
                  const courseId = event.target.value;
                  if (courseId)
                    templates
                      .filter(
                        (entry) => entry.defaultCourseId === courseId && entry.id !== template.id,
                      )
                      .forEach((entry) =>
                        state.updateTemplate(entry.id, { defaultCourseId: undefined }),
                      );
                  state.updateTemplate(template.id, {
                    defaultCourseId: courseId || undefined,
                  });
                }}
              >
                <option value="">No course default</option>
                {courses.map((course) => (
                  <option value={course.id} key={course.id}>
                    {course.code} · {course.name}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              aria-label="Template content"
              value={template.body}
              onChange={(event) => state.updateTemplate(template.id, { body: event.target.value })}
            />
            <div className="template-use">
              <input
                aria-label="New note title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <select aria-label="Template course" defaultValue={template.defaultCourseId ?? ""}>
                {courses.map((course) => (
                  <option value={course.id} key={course.id}>
                    {course.code}
                  </option>
                ))}
              </select>
              <button
                className="button primary"
                onClick={(event) => {
                  const select = event.currentTarget.parentElement?.querySelector("select");
                  const note = state.createNoteFromTemplate(
                    template.id,
                    title,
                    select?.value || undefined,
                  );
                  if (note) onOpenNote(note);
                }}
              >
                Use template
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewView({ onOpenNote }: { onOpenNote: (note: Note) => void }) {
  const state = useDiornaStore();
  const notes = selectWorkspace(state.notes, state.activeWorkspaceId);
  const courses = selectWorkspace(state.courses, state.activeWorkspaceId);
  const logs = selectWorkspace(state.reviewLogs, state.activeWorkspaceId);
  const [courseId, setCourseId] = useState("");
  const [noteId, setNoteId] = useState("");
  const [tag, setTag] = useState("");
  const [revealed, setRevealed] = useState(false);
  const due = selectWorkspace(state.flashcards, state.activeWorkspaceId).filter((card) => {
    const note = notes.find((entry) => entry.id === card.noteId);
    return (
      card.dueDate <= today() &&
      (!courseId || note?.courseId === courseId) &&
      (!noteId || card.noteId === noteId) &&
      (!tag || note?.tags.includes(tag))
    );
  });
  const card = due[0];
  const grades = logs.map((log) => log.grade);
  return (
    <section className="student-page review-page">
      <header className="student-heading">
        <div>
          <span className="eyebrow">Spaced repetition</span>
          <h1>{due.length} cards due</h1>
          <p>
            {logs.length} reviewed · {retentionRate(grades) ?? "—"}% retention ·{" "}
            {longestReviewStreak(logs.map((log) => log.reviewedAt))}-day streak
          </p>
        </div>
        <div className="review-filters">
          <select
            aria-label="Review course"
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
            aria-label="Review note"
            value={noteId}
            onChange={(event) => setNoteId(event.target.value)}
          >
            <option value="">All notes</option>
            {notes.map((note) => (
              <option value={note.id} key={note.id}>
                {note.title}
              </option>
            ))}
          </select>
          <input
            aria-label="Review tag"
            placeholder="Tag"
            value={tag}
            onChange={(event) => setTag(event.target.value.replace(/^#/, ""))}
          />
        </div>
      </header>
      {card ? (
        <div className="review-card">
          <span>{card.cardType === "cloze" ? "Cloze" : "Flashcard"}</span>
          <div className="review-face">
            <p>{card.front}</p>
            {revealed && (
              <>
                <hr />
                <p>{card.back}</p>
              </>
            )}
          </div>
          {!revealed ? (
            <button className="button primary" onClick={() => setRevealed(true)}>
              Show answer
            </button>
          ) : (
            <div className="grade-row">
              {(["again", "hard", "good", "easy"] as FlashcardGrade[]).map((grade) => (
                <button
                  className={`button grade-${grade}`}
                  key={grade}
                  onClick={() => {
                    state.gradeFlashcard(card.id, grade);
                    setRevealed(false);
                  }}
                >
                  {grade[0]!.toUpperCase() + grade.slice(1)}
                </button>
              ))}
            </div>
          )}
          <button
            className="link-button"
            onClick={() => {
              const note = notes.find((entry) => entry.id === card.noteId);
              if (note) onOpenNote(note);
            }}
          >
            Open source note
          </button>
        </div>
      ) : (
        <div className="empty-state">
          <Check />
          <h2>Review complete</h2>
          <p>No cards match these filters.</p>
        </div>
      )}
    </section>
  );
}

function ReferenceLibrary() {
  const state = useDiornaStore();
  const references = selectWorkspace(state.references, state.activeWorkspaceId);
  const [style, setStyle] = useState<CitationStyle>("apa");
  const [query, setQuery] = useState("");
  const filtered = references.filter((reference) =>
    `${reference.citationKey} ${reference.title} ${reference.authors.join(" ")}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <section className="student-page reference-page">
      <header className="student-heading">
        <div>
          <span className="eyebrow">Bibliography</span>
          <h1>Reference library</h1>
          <p>{references.length} references in this workspace.</p>
        </div>
        <div className="button-row">
          <select
            aria-label="Citation style"
            value={style}
            onChange={(event) => setStyle(event.target.value as CitationStyle)}
          >
            <option value="apa">APA</option>
            <option value="ieee">IEEE</option>
            <option value="harvard">Harvard</option>
          </select>
          <label className="button">
            <FileUp size={14} /> Import .bib / CSL-JSON
            <input
              type="file"
              accept=".bib,.json,application/json,text/plain"
              onChange={(event) =>
                void importReferences(event.currentTarget.files?.[0], state.addReferences)
              }
            />
          </label>
        </div>
      </header>
      <div className="reference-toolbar">
        <Library size={15} />
        <input
          placeholder="Search references"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="reference-list">
        {filtered.map((reference, index) => (
          <article key={reference.id}>
            <header>
              <code>@{reference.citationKey}</code>
              <button
                className="button compact"
                onClick={() => void navigator.clipboard.writeText(`[@${reference.citationKey}]`)}
              >
                Copy citation
              </button>
            </header>
            <strong>{reference.title}</strong>
            <p>{formatReference(reference, style, index + 1)}</p>
            {reference.doi && <small>DOI {reference.doi}</small>}
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Library />
          <h2>No references</h2>
          <p>Import a BibTeX file or a Zotero CSL-JSON export.</p>
        </div>
      )}
    </section>
  );
}

async function importReferences(
  file: File | undefined,
  add: ReturnType<typeof useDiornaStore.getState>["addReferences"],
) {
  if (!file) return;
  const text = await file.text();
  const records = file.name.toLocaleLowerCase().endsWith(".bib")
    ? parseBibTeX(text)
    : parseCslJson(text);
  add(records.map((record) => ({ ...record })));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function isoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - start.getTime()) / 86_400_000 + 1) / 7);
}
function semesterProgress(semester: string) {
  const autumn = /autumn|fall/i.test(semester);
  const start = new Date(new Date().getFullYear(), autumn ? 8 : 0, 1);
  return Math.max(
    0,
    Math.min(100, Math.round((differenceInCalendarDays(new Date(), start) / 112) * 100)),
  );
}

function groupNotesByWeek(notes: Note[]): Map<string, Note[]> {
  const groups = new Map<string, Note[]>();
  notes.forEach((note) => {
    const week = `Week ${isoWeek(parseISO(note.createdAt))}`;
    groups.set(week, [...(groups.get(week) ?? []), note]);
  });
  return groups;
}
