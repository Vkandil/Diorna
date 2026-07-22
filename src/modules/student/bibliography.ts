export interface ReferenceRecord {
  id: string;
  citationKey: string;
  title: string;
  authors: string[];
  year?: number;
  container?: string;
  doi?: string;
  url?: string;
}
export type CitationStyle = "apa" | "ieee" | "harvard";

export function parseBibTeX(input: string): ReferenceRecord[] {
  return [...input.matchAll(/@(\w+)\s*\{\s*([^,]+),([\s\S]*?)(?=\n?@\w+\s*\{|$)/g)].map((match) => {
    const fields = Object.fromEntries(
      [...match[3]!.matchAll(/(\w+)\s*=\s*(?:\{|")([^}"]+)(?:\}|")/g)].map((field) => [
        field[1]!.toLowerCase(),
        field[2]!.trim(),
      ]),
    );
    return {
      id: match[2]!.trim(),
      citationKey: match[2]!.trim(),
      title: fields.title ?? "Untitled",
      authors: (fields.author ?? "").split(/\s+and\s+/i).filter(Boolean),
      ...(fields.year ? { year: Number(fields.year) } : {}),
      ...(fields.journal ? { container: fields.journal } : {}),
      ...(fields.doi ? { doi: fields.doi } : {}),
      ...(fields.url ? { url: fields.url } : {}),
    };
  });
}

export function parseCslJson(input: string): ReferenceRecord[] {
  const values = JSON.parse(input) as Array<Record<string, unknown>>;
  return values.map((value) => {
    const authors = Array.isArray(value.author)
      ? value.author.map((author) => {
          const item = author as Record<string, string>;
          return [item.family, item.given].filter(Boolean).join(", ");
        })
      : [];
    const year = (
      (value.issued as { [key: string]: unknown })?.["date-parts"] as number[][] | undefined
    )?.[0]?.[0];
    return {
      id: String(value.id ?? crypto.randomUUID()),
      citationKey: String(value["citation-key"] ?? value.id ?? "reference"),
      title: String(value.title ?? "Untitled"),
      authors,
      ...(year ? { year } : {}),
      ...(value["container-title"] ? { container: String(value["container-title"]) } : {}),
      ...(value.DOI ? { doi: String(value.DOI) } : {}),
      ...(value.URL ? { url: String(value.URL) } : {}),
    };
  });
}

export function formatReference(
  reference: ReferenceRecord,
  style: CitationStyle,
  index = 1,
): string {
  const authors = reference.authors.join(style === "apa" ? ", & " : ", ") || "Unknown";
  if (style === "ieee")
    return `[${index}] ${authors}, “${reference.title},”${reference.container ? ` ${reference.container},` : ""}${reference.year ? ` ${reference.year}.` : ""}`;
  if (style === "harvard")
    return `${authors}${reference.year ? ` (${reference.year})` : ""} ‘${reference.title}’${reference.container ? `, ${reference.container}` : ""}.`;
  return `${authors}${reference.year ? ` (${reference.year})` : ""}. ${reference.title}.${reference.container ? ` ${reference.container}.` : ""}`;
}
