import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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
turndown.keep(["figure"]);
turndown.addRule("wiki-link", {
  filter: (node) =>
    node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('span[data-type="wiki-link"]'),
  replacement: (_content, node) => {
    const link = node as HTMLElement;
    const target = link.dataset.target ?? link.textContent ?? "Untitled";
    const label = link.dataset.label;
    return `[[${target}${label ? `|${label}` : ""}]]`;
  },
});

export const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;

export async function logNativeError(message: string): Promise<void> {
  if (!isTauri()) return;
  const { error } = await import("@tauri-apps/plugin-log");
  await error(message);
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export interface NativeVaultInfo {
  path: string;
  totalBytes: number;
  workspaces: Array<{ workspaceId: string; name: string; folderName: string; bytes: number }>;
}

export interface ImportedAttachment {
  relativePath: string;
  displayUrl: string;
  size: number;
  name: string;
}

interface SavedAttachment {
  relativePath: string;
  absolutePath: string;
  size: number;
}

function attachmentResult(saved: SavedAttachment): ImportedAttachment {
  return {
    relativePath: saved.relativePath,
    displayUrl: convertFileSrc(saved.absolutePath),
    size: saved.size,
    name: saved.absolutePath.split(/[\\/]/).pop() ?? "attachment",
  };
}

export async function importNativeAttachmentFile(
  workspaceId: string,
  sourcePath: string,
): Promise<ImportedAttachment> {
  const saved = await invoke<SavedAttachment>("import_attachment", {
    workspaceId,
    name: sourcePath.split(/[\\/]/).pop() ?? "attachment",
    sourcePath,
    dataBase64: null,
  });
  return attachmentResult(saved);
}

export async function importNativeAttachmentBytes(
  workspaceId: string,
  file: File,
): Promise<ImportedAttachment> {
  const dataUrl = await fileDataUrl(file);
  if (!isTauri()) {
    return {
      relativePath: `attachments/${file.name}`,
      displayUrl: dataUrl,
      size: file.size,
      name: file.name,
    };
  }
  const saved = await invoke<SavedAttachment>("import_attachment", {
    workspaceId,
    name: file.name || `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
    sourcePath: null,
    dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
  });
  return attachmentResult(saved);
}

function fileDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read attachment"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export async function chooseAndImportNativeAttachment(
  workspaceId: string,
): Promise<ImportedAttachment | undefined> {
  if (!isTauri()) return undefined;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, title: "Choose an attachment" });
  return typeof path === "string" ? importNativeAttachmentFile(workspaceId, path) : undefined;
}

export async function initialiseNativeVault(path?: string): Promise<NativeVaultInfo | undefined> {
  if (!isTauri()) return undefined;
  if (path) await invoke("initialise_vault", { path });
  else await invoke("initialise_default_vault");
  return getNativeVaultInfo();
}

export async function persistNativeSettings(settings: AppSettings): Promise<void> {
  if (!isTauri()) return;
  await invoke("write_settings", { settings });
}

export async function applyNativeShellSettings(settings: AppSettings): Promise<void> {
  if (!isTauri()) return;
  const runtime = await invoke<{ portable: boolean }>("runtime_info");
  await Promise.all([
    invoke("set_close_to_tray", { enabled: settings.minimizeToTray }),
    ...(runtime.portable
      ? []
      : [invoke("set_start_with_windows", { enabled: settings.startWithWindows })]),
    invoke("set_global_shortcut", { shortcut: settings.keymap.quickCapture }),
  ]);
}

export async function updateNativeTrayScore(score: number | null): Promise<void> {
  if (!isTauri()) return;
  await invoke("update_tray_score", { score });
}

export async function takeNativeOpenRequests(): Promise<string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>("take_open_requests");
}

export async function readNativeSettings(): Promise<Partial<AppSettings> | undefined> {
  if (!isTauri()) return undefined;
  return invoke<Partial<AppSettings>>("read_settings");
}

export async function getNativeVaultInfo(): Promise<NativeVaultInfo | undefined> {
  if (!isTauri()) return undefined;
  return invoke<NativeVaultInfo>("vault_info");
}

export async function rebuildNativeIndex(): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("rebuild_index");
}

export async function deleteNativeWorkspace(workspaceId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_workspace", { workspaceId });
}

export interface NativeTrashRecord {
  id: string;
  workspaceId: string;
  kind: "notes" | "maps";
  originalPath: string;
  trashPath: string;
  deletedAt: string;
}

export async function trashNativeFile(
  workspaceId: string,
  kind: "notes" | "maps",
  relativePath: string,
): Promise<NativeTrashRecord | undefined> {
  if (!isTauri()) return undefined;
  return invoke<NativeTrashRecord>("trash_file", { workspaceId, kind, relativePath });
}

export async function listNativeTrash(workspaceId: string): Promise<NativeTrashRecord[]> {
  if (!isTauri()) return [];
  return invoke<NativeTrashRecord[]>("list_trash", { workspaceId });
}

export async function restoreNativeTrash(workspaceId: string, trashId: string): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("restore_trash", { workspaceId, trashId });
}

export async function purgeNativeTrash(workspaceId: string, trashId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("purge_trash", { workspaceId, trashId });
}

export async function openNativeVault(): Promise<void> {
  const info = await getNativeVaultInfo();
  if (!info) return;
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(info.path);
}

export async function chooseAndMoveVault(): Promise<NativeVaultInfo | undefined> {
  if (!isTauri()) {
    window.alert("Moving the vault is available in the Windows desktop build.");
    return undefined;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const destination = await open({
    directory: true,
    multiple: false,
    title: "Choose an empty destination for the Diorna vault",
  });
  if (typeof destination !== "string") return undefined;
  return invoke<NativeVaultInfo>("move_vault", { destination });
}

export async function readNativeKeymap(): Promise<Record<string, string> | undefined> {
  if (!isTauri()) return undefined;
  return invoke<Record<string, string>>("read_keymap");
}

export async function persistNativeKeymap(keymap: Record<string, string>): Promise<void> {
  if (!isTauri()) return;
  await invoke("write_keymap", { keymap });
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
  hash: string;
}

type DiskMap = CanvasMap & { hash: string };
const nativeFileHashes = new Map<string, string>();
const nativeSaveQueues = new Map<string, Promise<void>>();

async function enqueueNativeSave(key: string, operation: () => Promise<void>): Promise<void> {
  const previous = nativeSaveQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  nativeSaveQueues.set(key, current);
  try {
    await current;
  } finally {
    if (nativeSaveQueues.get(key) === current) nativeSaveQueues.delete(key);
  }
}

function nativeSaveError(error: unknown): never {
  const message = String(error);
  window.dispatchEvent(
    new CustomEvent("diorna-toast", {
      detail: message.toLocaleLowerCase().includes("changed outside")
        ? "This file changed outside Diorna. Reload before saving so neither version is lost."
        : `Unable to save: ${message}`,
    }),
  );
  throw error;
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
    maps: DiskMap[];
  }>("load_file_content");
  const vault = await getNativeVaultInfo();
  return {
    notes: content.notes.map(({ markdown, hash, ...note }) => {
      nativeFileHashes.set(`note:${note.id}`, hash);
      const sanitized = DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string);
      const workspace = vault?.workspaces.find((entry) => entry.workspaceId === note.workspaceId);
      const document = new DOMParser().parseFromString(sanitized, "text/html");
      if (workspace && vault) {
        for (const media of document.querySelectorAll<HTMLElement>(
          "figure[data-type='attachment'], figure[data-type='attachment'] img, figure[data-type='attachment'] video, figure[data-type='attachment'] audio, figure[data-type='attachment'] iframe, img",
        )) {
          const relative = media.dataset.relativePath || media.getAttribute("src") || "";
          if (!relative.startsWith("attachments/")) continue;
          media.dataset.relativePath = relative;
          media.setAttribute(
            "src",
            convertFileSrc(`${vault.path}/${workspace.folderName}/${relative}`),
          );
        }
      }
      return { ...note, body: document.body.innerHTML };
    }),
    maps: content.maps.map(({ hash, ...map }) => {
      nativeFileHashes.set(`map:${map.id}`, hash);
      const workspace = vault?.workspaces.find((entry) => entry.workspaceId === map.workspaceId);
      if (!workspace || !vault) return map;
      return {
        ...map,
        nodes: map.nodes.map((node) =>
          node.type === "file" && node.file?.startsWith("attachments/")
            ? {
                ...node,
                url: convertFileSrc(`${vault.path}/${workspace.folderName}/${node.file}`),
                diorna: {
                  ...node.diorna,
                  nodeType: node.diorna?.nodeType ?? attachmentCanvasNodeType(node.file),
                },
              }
            : node,
        ),
      };
    }),
  };
}

export async function persistNativeNote(note: Note): Promise<void> {
  if (!isTauri()) return;
  await enqueueNativeSave(`note:${note.id}`, async () => {
    const markdown = turndown.turndown(portableNoteHtml(note.body));
    try {
      const saved = await invoke<{ hash: string }>("save_note", {
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
          expectedHash: nativeFileHashes.get(`note:${note.id}`) ?? null,
        },
      });
      nativeFileHashes.set(`note:${note.id}`, saved.hash);
    } catch (error) {
      nativeSaveError(error);
    }
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

export async function exportBinaryFile(
  defaultName: string,
  bytes: Uint8Array,
  filter: { name: string; extensions: string[] },
): Promise<boolean> {
  if (!isTauri()) {
    const buffer = new Uint8Array(bytes).buffer;
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeFileName(defaultName);
    anchor.click();
    URL.revokeObjectURL(url);
    return true;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: safeFileName(defaultName), filters: [filter] });
  if (!path) return false;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  await invoke("export_binary_file", { path, dataBase64: btoa(binary) });
  return true;
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
  return `---\n${metadata}\n---\n\n${turndown.turndown(portableNoteHtml(note.body))}\n`;
}

function portableNoteHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const media of document.querySelectorAll<HTMLElement>(
    "figure[data-type='attachment'], figure[data-type='attachment'] img, figure[data-type='attachment'] video, figure[data-type='attachment'] audio, figure[data-type='attachment'] iframe",
  )) {
    if (media.dataset.relativePath) media.setAttribute("src", media.dataset.relativePath);
  }
  return document.body.innerHTML;
}

function attachmentCanvasNodeType(
  name: string,
): NonNullable<NonNullable<CanvasMap["nodes"][number]["diorna"]>["nodeType"]> {
  const extension = name.split(".").pop()?.toLocaleLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(extension ?? "")) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(extension ?? "")) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(extension ?? "")) return "audio";
  return extension === "pdf" ? "pdf" : "file";
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
  await enqueueNativeSave(`map:${map.id}`, async () => {
    try {
      const saved = await invoke<{ hash: string }>("save_canvas", {
        mapId: map.id,
        workspaceId: map.workspaceId,
        relativePath: map.path.replace(/^maps[\\/]/, ""),
        canvasJson: JSON.stringify({
          nodes: map.nodes.map((node) => {
            if (node.type !== "file" || !node.file?.startsWith("attachments/")) return node;
            const portable = { ...node };
            delete portable.url;
            return portable;
          }),
          edges: map.edges,
          diorna: { ...(map.parentMapId ? { parentMapId: map.parentMapId } : {}) },
        }),
        expectedHash: nativeFileHashes.get(`map:${map.id}`) ?? null,
      });
      nativeFileHashes.set(`map:${map.id}`, saved.hash);
    } catch (error) {
      nativeSaveError(error);
    }
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

export async function chooseDirectory(title: string): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false, title });
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

export async function importNativeFolder(
  kind: "obsidian" | "notion",
  source: string,
  workspaceId: string,
): Promise<{ imported: number; skipped: number; warnings: string[] } | undefined> {
  if (!isTauri()) return undefined;
  return invoke(`import_${kind}`, { source, workspaceId });
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

export async function chooseAndBackupVault(destination?: string, retention = 10): Promise<void> {
  if (!isTauri()) {
    window.alert("Backups are available in the Windows desktop build.");
    return;
  }
  const selected = destination ?? (await chooseDirectory("Choose backup folder"));
  if (!selected) return;
  const output = await invoke<string>("create_backup", { destination: selected, retention });
  window.alert(`Backup complete:\n${output}`);
}

export async function runNativeBackup(destination: string, retention: number): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("create_backup", { destination, retention });
}

export async function chooseAndRestoreBackup(): Promise<void> {
  if (!isTauri()) {
    window.alert("Backup restore is available in the Windows desktop build.");
    return;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const backup = await open({
    directory: false,
    multiple: false,
    title: "Choose a Diorna backup",
    filters: [{ name: "Diorna backup", extensions: ["zip"] }],
  });
  if (typeof backup !== "string") return;
  const confirmed = window.confirm(
    "Restore this backup? Diorna will preserve the current vault beside it as a rollback copy.",
  );
  if (!confirmed) return;
  const rollback = await invoke<string>("restore_backup", { backup });
  window.alert(`Restore complete. The previous vault was preserved at:\n${rollback}`);
  window.location.reload();
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
  if (!apiKey) return;
  if (!isTauri()) {
    sessionStorage.setItem(`diorna-dev-secret:${provider}`, apiKey);
    return;
  }
  await invoke("store_api_key", { provider, apiKey });
}

export async function loadNativeApiKey(provider: string): Promise<string | undefined> {
  if (!isTauri()) return sessionStorage.getItem(`diorna-dev-secret:${provider}`) ?? undefined;
  return (await invoke<string | null>("load_api_key", { provider })) ?? undefined;
}

export async function hasNativeApiKey(provider: string): Promise<boolean> {
  if (!isTauri()) return Boolean(sessionStorage.getItem(`diorna-dev-secret:${provider}`));
  return invoke<boolean>("has_api_key", { provider });
}
