export interface DatedNoteTask {
  line: number;
  title: string;
  date: string;
  checked: boolean;
}

const dateAnnotation = /(?:📅\s*|@due\(\s*|\[due:\s*|@)(\d{4}-\d{2}-\d{2})(?:\s*\)|\s*\])?/iu;

export function extractDatedNoteTasks(html: string): DatedNoteTask[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll<HTMLElement>("li[data-checked]")].flatMap(
    (element, index) => {
      const raw = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const explicit = element.dataset.date;
      const match = raw.match(dateAnnotation);
      const date = explicit ?? match?.[1];
      if (!date) return [];
      const title = raw.replace(dateAnnotation, "").replace(/\s+/g, " ").trim();
      if (!title) return [];
      return [
        {
          line: index + 1,
          title,
          date,
          checked: element.dataset.checked === "true",
        },
      ];
    },
  );
}

export function setDatedNoteTaskChecked(html: string, line: number, checked: boolean): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const item = document.querySelectorAll<HTMLElement>("li[data-checked]")[line - 1];
  if (!item) return html;
  item.dataset.checked = String(checked);
  const input = item.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (input) input.checked = checked;
  return document.body.innerHTML;
}

export function noteTaskDueAt(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year!, month! - 1, day!, 23, 59, 0, 0).toISOString();
}
