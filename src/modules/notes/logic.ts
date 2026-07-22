import type { Note } from "@/shared/models";

export interface WikiLink {
  target: string;
  alias?: string;
  index: number;
  length: number;
}
export interface Backlink {
  sourceNoteId: string;
  sourceTitle: string;
  context: string;
  index: number;
}
export interface Replacement {
  noteId: string;
  title: string;
  before: string;
  after: string;
  line: number;
}

export function parseWikiLinks(text: string): WikiLink[] {
  return [...text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map((match) => ({
    target: match[1]!.trim(),
    ...(match[2] ? { alias: match[2].trim() } : {}),
    index: match.index,
    length: match[0].length,
  }));
}

export function rewriteWikiLinks(text: string, oldTitle: string, newTitle: string): string {
  return text.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (whole, target: string, alias?: string) =>
    target.trim().toLocaleLowerCase() === oldTitle.toLocaleLowerCase()
      ? `[[${newTitle}${alias ?? ""}]]`
      : whole,
  );
}

export function findBacklinks(notes: Note[], target: Note): Backlink[] {
  return notes
    .filter((note) => note.workspaceId === target.workspaceId && note.id !== target.id)
    .flatMap((note) =>
      parseWikiLinks(stripHtml(note.body))
        .filter((link) => link.target.toLocaleLowerCase() === target.title.toLocaleLowerCase())
        .map((link) => ({
          sourceNoteId: note.id,
          sourceTitle: note.title,
          context: sentenceAt(stripHtml(note.body), link.index),
          index: link.index,
        })),
    );
}

export function findUnlinkedMentions(notes: Note[], target: Note): Backlink[] {
  const escaped = target.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
  return notes
    .filter((note) => note.workspaceId === target.workspaceId && note.id !== target.id)
    .flatMap((note) => {
      const plain = stripHtml(note.body);
      const linkRanges = parseWikiLinks(plain).map((link) => [
        link.index,
        link.index + link.length,
      ]);
      return [...plain.matchAll(pattern)]
        .filter(
          (match) =>
            !linkRanges.some(([start, end]) => match.index >= start! && match.index < end!),
        )
        .map((match) => ({
          sourceNoteId: note.id,
          sourceTitle: note.title,
          context: sentenceAt(plain, match.index),
          index: match.index,
        }));
    });
}

export function extractTags(text: string): string[] {
  return [
    ...new Set(
      [...stripHtml(text).matchAll(/(?:^|\s)#([\p{L}\d_-]+(?:\/[\p{L}\d_-]+)*)/gu)].map((match) =>
        match[1]!.toLocaleLowerCase(),
      ),
    ),
  ].sort();
}

export function renameTag(tags: string[], oldName: string, newName: string): string[] {
  return tags.map((tag) =>
    tag === oldName || tag.startsWith(`${oldName}/`)
      ? `${newName}${tag.slice(oldName.length)}`
      : tag,
  );
}

export function applyTemplate(
  template: string,
  values: {
    title: string;
    course?: string;
    date?: Date;
    week?: number;
    semester?: string;
  },
): { content: string; cursor: number } {
  const date = values.date ?? new Date();
  const variables: Record<string, string> = {
    date: new Intl.DateTimeFormat("en-CA").format(date),
    time: new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
    title: values.title,
    course: values.course ?? "",
    week: String(values.week ?? getIsoWeek(date)),
    semester: values.semester ?? "",
  };
  let content = template.replace(
    /\{\{(date|time|title|course|week|semester)\}\}/g,
    (_, key: string) => variables[key]!,
  );
  const cursor = content.indexOf("{{cursor}}");
  content = content.replace("{{cursor}}", "");
  return { content, cursor: cursor < 0 ? content.length : cursor };
}

export function searchNotes(notes: Note[], query: string): Note[] {
  const terms = tokenizeQuery(query);
  return notes.filter((note) =>
    terms.every((term) => {
      const negated = term.startsWith("NOT ");
      const value = negated ? term.slice(4) : term;
      const match = matchesTerm(note, value);
      return negated ? !match : match;
    }),
  );
}

export function previewReplace(notes: Note[], search: string, replacement: string): Replacement[] {
  if (!search) return [];
  return notes.flatMap((note) =>
    stripHtml(note.body)
      .split(/\r?\n/)
      .flatMap((line, index) =>
        line.includes(search)
          ? [
              {
                noteId: note.id,
                title: note.title,
                before: line,
                after: line.replaceAll(search, replacement),
                line: index + 1,
              },
            ]
          : [],
      ),
  );
}

function matchesTerm(note: Note, term: string): boolean {
  const [field, ...rest] = term.split(":");
  const value = rest.join(":").replace(/^"|"$/g, "").toLocaleLowerCase();
  if (rest.length) {
    if (field === "tag")
      return note.tags.some((tag) => tag === value || tag.startsWith(`${value}/`));
    if (field === "folder") return note.path.toLocaleLowerCase().includes(`/${value}/`);
    if (field === "course") return (note.courseId ?? "").toLocaleLowerCase().includes(value);
    if (field === "created" || field === "updated") {
      const actual = (field === "created" ? note.createdAt : note.updatedAt).slice(0, 10);
      return value.startsWith(">")
        ? actual > value.slice(1)
        : value.startsWith("<")
          ? actual < value.slice(1)
          : actual === value;
    }
    if (field === "has") return value === "image" ? /<img|!\[/.test(note.body) : false;
    if (field === "is")
      return value === "task" ? /data-type="task|\[[ x]\]/i.test(note.body) : false;
    if (field && note.properties[field])
      return String(note.properties[field].value).toLocaleLowerCase().includes(value);
  }
  const haystack = `${note.title} ${stripHtml(note.body)} ${note.tags.join(" ")} ${Object.values(
    note.properties,
  )
    .map((property) => String(property.value))
    .join(" ")}`.toLocaleLowerCase();
  return haystack.includes(term.replace(/^"|"$/g, "").toLocaleLowerCase());
}

function tokenizeQuery(query: string): string[] {
  return [...query.matchAll(/NOT\s+(?:"[^"]+"|\S+)|"[^"]+"|\S+/gi)]
    .map((match) => match[0]!)
    .filter((term) => !["AND", "OR", "(", ")"].includes(term.toUpperCase()));
}
function sentenceAt(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(".", index) + 1, text.lastIndexOf("\n", index) + 1);
  const endCandidates = [text.indexOf(".", index), text.indexOf("\n", index)].filter(
    (value) => value >= 0,
  );
  const end = endCandidates.length ? Math.min(...endCandidates) + 1 : text.length;
  return text.slice(start, end).trim();
}
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function getIsoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
