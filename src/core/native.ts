import { invoke } from "@tauri-apps/api/core";
import TurndownService from "turndown";
import type {
  AppSettings,
  CalendarItem,
  CanvasMap,
  Category,
  Course,
  Flashcard,
  Habit,
  HabitEntry,
  Metric,
  MetricEntry,
  Note,
  Recap,
  ReferenceRecord,
  ReviewLog,
  StudyTemplate,
  Workspace,
} from "@/shared/models";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

export const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function initialiseNativeVault(path?: string): Promise<void> {
  if (!isTauri()) return;
  if (path) await invoke("initialise_vault", { path });
  else await invoke("initialise_default_vault");
}

export async function persistNativeSettings(settings: AppSettings): Promise<void> {
  if (!isTauri()) return;
  await invoke("write_settings", { settings });
}

export async function readNativeSettings(): Promise<Partial<AppSettings> | undefined> {
  if (!isTauri()) return undefined;
  return invoke<Partial<AppSettings>>("read_settings");
}

export interface StructuredSnapshot {
  workspaces: Workspace[];
  categories: Category[];
  courses: Course[];
  templates: StudyTemplate[];
  flashcards: Flashcard[];
  reviewLogs: ReviewLog[];
  references: ReferenceRecord[];
  items: CalendarItem[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  metrics: Metric[];
  metricEntries: MetricEntry[];
  recaps: Recap[];
}

export async function persistNativeStructuredState(snapshot: StructuredSnapshot): Promise<void> {
  if (!isTauri()) return;
  await invoke("persist_structured_state", { snapshot });
}

export async function readNativeStructuredState(): Promise<
  { initialized: boolean; snapshot: StructuredSnapshot } | undefined
> {
  if (!isTauri()) return undefined;
  return invoke<{ initialized: boolean; snapshot: StructuredSnapshot }>("load_structured_state");
}

interface DiskNote {
  id: string;
  workspaceId: string;
  path: string;
  title: string;
  markdown: string;
  courseId?: string;
  tags: string[];
  properties: Note["properties"];
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
}

export async function readNativeFileContent(): Promise<
  { notes: Note[]; maps: CanvasMap[] } | undefined
> {
  if (!isTauri()) return undefined;
  const [{ default: DOMPurify }, { marked }] = await Promise.all([
    import("dompurify"),
    import("marked"),
  ]);
  const content = await invoke<{
    notes: DiskNote[];
    maps: CanvasMap[];
  }>("load_file_content");
  return {
    notes: content.notes.map(({ markdown, ...note }) => ({
      ...note,
      body: DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string),
    })),
    maps: content.maps,
  };
}

export async function persistNativeNote(note: Note): Promise<void> {
  if (!isTauri()) return;
  const markdown = turndown.turndown(note.body);
  await invoke("save_note", {
    input: {
      id: note.id,
      workspaceId: note.workspaceId,
      relativePath: note.path.replace(/^notes[\\/]/, ""),
      title: note.title,
      markdown,
      courseId: note.courseId ?? null,
      tags: note.tags,
      properties: note.properties,
      starred: note.starred ?? false,
      expectedHash: null,
    },
  });
}

export interface NoteRevision {
  id: string;
  noteId: string;
  markdown: string;
  html: string;
  createdAt: string;
}

export async function readNativeNoteRevisions(
  workspaceId: string,
  noteId: string,
): Promise<NoteRevision[]> {
  if (!isTauri()) return [];
  const [{ default: DOMPurify }, { marked }] = await Promise.all([
    import("dompurify"),
    import("marked"),
  ]);
  const revisions = await invoke<Array<Omit<NoteRevision, "html">>>("list_note_revisions", {
    workspaceId,
    noteId,
  });
  return revisions.map((revision) => ({
    ...revision,
    html: DOMPurify.sanitize(marked.parse(revision.markdown, { async: false }) as string),
  }));
}

export async function exportMarkdownNotes(notes: Note[], exportName: string): Promise<void> {
  const files = await Promise.all(
    notes.map(async (note) => ({
      relativePath: `${safeFileName(note.title)}.md`,
      content: await noteToMarkdown(note),
    })),
  );
  if (!isTauri()) {
    const content =
      files.length === 1
        ? files[0]!.content
        : files.map((file) => `<!-- ${file.relativePath} -->\n\n${file.content}`).join("\n\n");
    downloadText(`${safeFileName(exportName)}.md`, content);
    return;
  }
  const { open, save } = await import("@tauri-apps/plugin-dialog");
  if (files.length === 1) {
    const path = await save({
      defaultPath: files[0]!.relativePath,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (path) await invoke("export_text_file", { path, content: files[0]!.content });
    return;
  }
  const destination = await open({
    directory: true,
    multiple: false,
    title: `Export ${exportName} as Markdown`,
  });
  if (typeof destination === "string") await invoke("export_text_bundle", { destination, files });
}

async function noteToMarkdown(note: Note): Promise<string> {
  const { stringify } = await import("yaml");
  const metadata = stringify({
    id: note.id,
    title: note.title,
    ...(note.courseId ? { courseId: note.courseId } : {}),
    tags: note.tags,
    properties: note.properties,
    created: note.createdAt,
    updated: note.updatedAt,
  }).trim();
  return `---\n${metadata}\n---\n\n${turndown.turndown(note.body)}\n`;
}

function safeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "-").trim() || "Diorna export";
}

function downloadText(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function persistNativeCanvas(map: CanvasMap): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_canvas", {
    mapId: map.id,
    workspaceId: map.workspaceId,
    relativePath: map.path.replace(/^maps[\\/]/, ""),
    canvasJson: JSON.stringify({
      nodes: map.nodes,
      edges: map.edges,
      diorna: { ...(map.parentMapId ? { parentMapId: map.parentMapId } : {}) },
    }),
  });
}

export async function hideCurrentWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  await getCurrentWebviewWindow().hide();
}

export async function chooseVaultFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose a Diorna vault",
  });
  return typeof selected === "string" ? selected : null;
}

export async function chooseAndImport(
  kind: "obsidian" | "notion",
  workspaceId: string,
): Promise<void> {
  if (!isTauri()) {
    window.alert("Imports are available in the Windows desktop build.");
    return;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const source = await open({
    directory: true,
    multiple: false,
    title: `Choose ${kind === "obsidian" ? "an Obsidian vault" : "a Notion export folder"}`,
  });
  if (typeof source !== "string") return;
  const report = await invoke<{
    imported: number;
    skipped: number;
    warnings: string[];
  }>(`import_${kind}`, { source, workspaceId });
  window.alert(
    `Imported ${report.imported} files${report.skipped ? `; skipped ${report.skipped}` : ""}.${report.warnings.length ? `\n${report.warnings.join("\n")}` : ""}`,
  );
}

export async function chooseAndExportVault(): Promise<void> {
  if (!isTauri()) {
    window.alert("Full export is available in the Windows desktop build.");
    return;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const destination = await open({
    directory: true,
    multiple: false,
    title: "Export Diorna vault",
  });
  if (typeof destination !== "string") return;
  const output = await invoke<string>("export_vault", { destination });
  window.alert(`Export complete:\n${output}`);
}

export async function chooseAndBackupVault(): Promise<void> {
  if (!isTauri()) {
    window.alert("Backups are available in the Windows desktop build.");
    return;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const destination = await open({
    directory: true,
    multiple: false,
    title: "Choose backup folder",
  });
  if (typeof destination !== "string") return;
  const output = await invoke<string>("create_backup", { destination });
  window.alert(`Backup complete:\n${output}`);
}

export async function exportNativeXlsx(
  defaultName: string,
  sheets: Array<{ name: string; rows: string[][] }>,
): Promise<void> {
  if (!isTauri()) {
    window.alert("XLSX export is available in the Windows desktop build.");
    return;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "Excel workbook", extensions: ["xlsx"] }],
  });
  if (!path) return;
  await invoke("export_xlsx", { path, sheets });
}

export async function storeNativeApiKey(provider: string, apiKey: string): Promise<void> {
  if (!isTauri() || !apiKey) return;
  await invoke("store_api_key", { provider, apiKey });
}

export async function loadNativeApiKey(provider: string): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  return (await invoke<string | null>("load_api_key", { provider })) ?? undefined;
}
