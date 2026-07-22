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

export interface OutlineEntry {
  level: number;
  text: string;
  anchor: string;
}

export function parseWikiLinks(text: string): WikiLink[] {
  const normalized = wikiLinkText(text);
  return [...normalized.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map((match) => ({
    target: match[1]!.trim(),
    ...(match[2] ? { alias: match[2].trim() } : {}),
    index: match.index,
    length: match[0].length,
  }));
}

export function rewriteWikiLinks(text: string, oldTitle: string, newTitle: string): string {
  const replaced = text.replace(
    /\[\[([^\]|]+)(\|[^\]]+)?\]\]/g,
    (whole, target: string, alias?: string) =>
      target.trim().toLocaleLowerCase() === oldTitle.toLocaleLowerCase()
        ? `[[${newTitle}${alias ?? ""}]]`
        : whole,
  );
  if (!replaced.includes('data-type="wiki-link"')) return replaced;
  const document = new DOMParser().parseFromString(replaced, "text/html");
  for (const link of document.querySelectorAll<HTMLElement>('[data-type="wiki-link"]')) {
    const target = link.dataset.target ?? link.textContent ?? "";
    if (target.trim().toLocaleLowerCase() !== oldTitle.toLocaleLowerCase()) continue;
    link.dataset.target = newTitle;
    if (!link.dataset.label) link.textContent = newTitle;
    link.title = `Open ${newTitle}`;
  }
  return document.body.innerHTML;
}

export function wikiLinksToEditorHtml(value: string): string {
  const document = new DOMParser().parseFromString(value, "text/html");
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (
      !text.parentElement?.closest('code, pre, [data-type="wiki-link"]') &&
      /\[\[/.test(text.data)
    )
      textNodes.push(text);
  }
  for (const text of textNodes) {
    const matches = [...text.data.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
    if (!matches.length) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.append(text.data.slice(cursor, match.index));
      const target = match[1]!.trim();
      const label = match[2]?.trim() ?? "";
      const link = document.createElement("span");
      link.dataset.type = "wiki-link";
      link.dataset.target = target;
      link.dataset.label = label;
      link.className = "wiki-link";
      link.setAttribute("role", "link");
      link.title = `Open ${target}`;
      link.textContent = label || target;
      fragment.append(link);
      cursor = match.index! + match[0].length;
    }
    fragment.append(text.data.slice(cursor));
    text.replaceWith(fragment);
  }
  return document.body.innerHTML;
}

export function wikiLinkText(value: string): string {
  if (!/<[a-z][\s\S]*>/i.test(value)) return value;
  const document = new DOMParser().parseFromString(value, "text/html");
  for (const link of document.querySelectorAll<HTMLElement>('[data-type="wiki-link"]')) {
    const target = link.dataset.target ?? link.textContent ?? "";
    const label = link.dataset.label;
    link.replaceWith(document.createTextNode(`[[${target}${label ? `|${label}` : ""}]]`));
  }
  return document.body.textContent ?? "";
}

export function findBacklinks(notes: Note[], target: Note): Backlink[] {
  return notes
    .filter((note) => note.workspaceId === target.workspaceId && note.id !== target.id)
    .flatMap((note) =>
      parseWikiLinks(note.body)
        .filter((link) => link.target.toLocaleLowerCase() === target.title.toLocaleLowerCase())
        .map((link) => ({
          sourceNoteId: note.id,
          sourceTitle: note.title,
          context: sentenceAt(wikiLinkText(note.body), link.index),
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
      const plain = wikiLinkText(note.body);
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
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return notes;
  return notes.filter((note) => evaluateQuery(note, tokens));
}

export function previewReplace(notes: Note[], search: string, replacement: string): Replacement[] {
  if (!search) return [];
  return notes.flatMap((note) =>
    htmlToLines(note.body)
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

export function extractOutline(html: string): OutlineEntry[] {
  return [...html.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match, index) => {
    const text = stripHtml(match[2] ?? "") || `Heading ${index + 1}`;
    return {
      level: Number(match[1]),
      text,
      anchor: `${slugify(text)}-${index + 1}`,
    };
  });
}

export function convertFirstUnlinkedMention(body: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linked = new RegExp(`\\[\\[${escaped}(?:\\|[^\\]]+)?\\]\\]`, "i");
  const placeholders: string[] = [];
  const protectedBody = body.replace(/\[\[[^\]]+\]\]/g, (value) => {
    placeholders.push(value);
    return `DIORNA-WIKILINK-${placeholders.length - 1}-END`;
  });
  if (linked.test(body) && !new RegExp(escaped, "i").test(protectedBody)) return body;
  const replaced = protectedBody.replace(new RegExp(escaped, "i"), () => `[[${title}]]`);
  return replaced.replace(
    /DIORNA-WIKILINK-(\d+)-END/g,
    (_, index: string) => placeholders[Number(index)]!,
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
  return [...query.matchAll(/(?:[^\s():]+:)?"[^"]*"|\(|\)|\b(?:AND|OR|NOT)\b|[^\s()]+/gi)].map(
    (match) => match[0]!,
  );
}

function evaluateQuery(note: Note, tokens: string[]): boolean {
  let index = 0;
  const peek = () => tokens[index]?.toUpperCase();
  const consume = () => tokens[index++];
  const primary = (): boolean => {
    if (peek() === "(") {
      consume();
      const result = or();
      if (peek() === ")") consume();
      return result;
    }
    const token = consume();
    return token ? matchesTerm(note, token) : true;
  };
  const not = (): boolean => {
    if (peek() === "NOT") {
      consume();
      return !not();
    }
    return primary();
  };
  const and = (): boolean => {
    let result = not();
    while (index < tokens.length && peek() !== "OR" && peek() !== ")") {
      if (peek() === "AND") consume();
      result = not() && result;
    }
    return result;
  };
  const or = (): boolean => {
    let result = and();
    while (peek() === "OR") {
      consume();
      result = and() || result;
    }
    return result;
  };
  return or();
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

function htmlToLines(value: string): string {
  return value
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}
function getIsoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
