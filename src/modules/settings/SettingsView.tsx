import { useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Bell,
  BookOpen,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  Keyboard,
  LayoutGrid,
  Palette,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  UserRound,
  Wrench,
} from "lucide-react";
import { useDiornaStore } from "@/core/store";
import {
  chooseAndBackupVault,
  chooseAndExportVault,
  chooseAndImport,
  chooseAndMoveVault,
  chooseAndRestoreBackup,
  chooseDirectory,
  deleteNativeWorkspace,
  getNativeVaultInfo,
  hasNativeApiKey,
  listNativeTrash,
  openExternalUrl,
  openNativeVault,
  persistNativeKeymap,
  purgeNativeTrash,
  readNativeKeymap,
  readNativeFileContent,
  rebuildNativeIndex,
  restoreNativeTrash,
  storeNativeApiKey,
  type NativeVaultInfo,
  type NativeTrashRecord,
} from "@/core/native";
import thirdPartyNotices from "../../../THIRD_PARTY_NOTICES.md?raw";
import projectLicense from "../../../LICENSE?raw";
import releaseNotes from "../../../CHANGELOG.md?raw";
import { listOllamaModels } from "@/modules/recap/summarizer";
import { checkAndDownloadUpdate, isPortableBuild, type UpdateState } from "@/core/updater";
import { OPENROUTER_ENDPOINT, OPENROUTER_MODEL, recapSecretId } from "@/shared/recapConfig";

const sections = [
  ["general", "General", UserRound],
  ["appearance", "Appearance", Palette],
  ["vault", "Vault", Database],
  ["workspaces", "Workspaces", LayoutGrid],
  ["editor", "Editor", Wrench],
  ["categories", "Categories", Tags],
  ["calendar", "Calendar", Bell],
  ["daily", "Daily Grid", LayoutGrid],
  ["recap", "Recap", Sparkles],
  ["shortcuts", "Shortcuts", Keyboard],
  ["backup", "Backup", HardDrive],
  ["import", "Import / Export", Upload],
  ["about", "About", ShieldCheck],
] as const;

const sectionKeywords: Record<string, string> = {
  general: "language windows launch tray default workspace update channel",
  appearance: "theme accent font size line width density",
  vault: "location move explorer re-index storage usage",
  workspaces: "create rename color reorder delete dashboard layout",
  editor: "spell check language brackets tab folder template",
  categories: "name color icon order",
  calendar: "week start visible hours duration reminder",
  daily: "window future check-in week start",
  recap: "provider endpoint model api key automatic privacy",
  shortcuts: "keymap keyboard conflict reset",
  backup: "location frequency retention restore",
  import: "obsidian notion export vault",
  about: "version licence notices repository release notes",
};

const dashboardLabels: Record<string, string> = {
  score: "Today’s completion",
  agenda: "Agenda and deadlines",
  courses: "Courses",
  flashcards: "Flashcards due",
  projects: "Active projects",
  streaks: "Current streaks",
  recent: "Recently edited",
  recap: "Monthly recap",
};

export function SettingsView() {
  const state = useDiornaStore();
  const [active, setActive] = useState(() => {
    const requested = localStorage.getItem("diorna-settings-section")?.toLocaleLowerCase();
    return sections.find(([, label]) => label.toLocaleLowerCase() === requested)?.[0] ?? "general";
  });
  const [query, setQuery] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [vaultInfo, setVaultInfo] = useState<NativeVaultInfo>();
  const [updateState, setUpdateState] = useState<UpdateState>();
  const [portable, setPortable] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<"idle" | "checking" | "ready" | "offline">(
    "idle",
  );
  useEffect(() => {
    if (state.settings.recapProvider !== "local") return;
    setOllamaStatus("checking");
    void listOllamaModels()
      .then((models) => {
        setOllamaModels(models);
        setOllamaStatus(models.length ? "ready" : "offline");
      })
      .catch(() => setOllamaStatus("offline"));
  }, [state.settings.recapProvider]);
  useEffect(() => {
    void getNativeVaultInfo().then((info) => info && setVaultInfo(info));
    void isPortableBuild().then(setPortable);
    void readNativeKeymap().then((keymap) => {
      if (keymap) {
        const current = useDiornaStore.getState();
        current.updateSettings({ keymap: { ...current.settings.keymap, ...keymap } });
      }
    });
  }, []);
  const visible = useMemo(
    () =>
      sections.filter(([id, label]) =>
        `${label} ${sectionKeywords[id]}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );
  return (
    <div className="settings-layout">
      <aside>
        <div className="settings-search">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings"
          />
        </div>
        {visible.map(([id, label, Icon]) => (
          <button
            key={id}
            className={active === id ? "active" : ""}
            onClick={() => {
              setActive(id);
              localStorage.setItem("diorna-settings-section", label);
            }}
          >
            <Icon />
            {label}
          </button>
        ))}
      </aside>
      <div className="settings-content">
        <header>
          <span className="eyebrow">Preferences</span>
          <h1>{sections.find(([id]) => id === active)?.[1]}</h1>
        </header>
        {renderSection(
          active,
          state,
          ollamaModels,
          ollamaStatus,
          vaultInfo,
          setVaultInfo,
          portable,
          updateState,
          setUpdateState,
        )}
      </div>
    </div>
  );
}

function renderSection(
  active: string,
  state: ReturnType<typeof useDiornaStore.getState>,
  ollamaModels: string[],
  ollamaStatus: "idle" | "checking" | "ready" | "offline",
  vaultInfo: NativeVaultInfo | undefined,
  setVaultInfo: (info: NativeVaultInfo) => void,
  portable: boolean,
  updateState: UpdateState | undefined,
  setUpdateState: (state: UpdateState) => void,
) {
  if (active === "appearance")
    return (
      <SettingsGroup
        title="Theme & interface"
        description="A calm, dense workspace tuned to your display."
      >
        <Field label="Theme">
          <div className="segmented">
            {(["light", "dark", "system"] as const).map((theme) => (
              <button
                key={theme}
                className={state.settings.theme === theme ? "active" : ""}
                onClick={() => state.updateSettings({ theme })}
              >
                {theme}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Accent color">
          <div className="swatches">
            <button
              aria-label="Use Windows accent color"
              title="Windows accent"
              className={state.settings.accentColor === "system" ? "selected" : ""}
              style={{ background: "AccentColor" }}
              onClick={() => state.updateSettings({ accentColor: "system" })}
            />
            {["#5b5bd6", "#3f70b5", "#168a68", "#b47619", "#c0445c", "#795ac8"].map((color) => (
              <button
                key={color}
                aria-label={`Use accent color ${color}`}
                className={state.settings.accentColor === color ? "selected" : ""}
                style={{ background: color }}
                onClick={() => state.updateSettings({ accentColor: color })}
              />
            ))}
          </div>
        </Field>
        <Field label="Density">
          <select
            value={state.settings.density}
            onChange={(event) =>
              state.updateSettings({
                density: event.target.value as "compact" | "comfortable",
              })
            }
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </Field>
        <Field label="Interface font">
          <select
            value={state.settings.interfaceFont}
            onChange={(event) => state.updateSettings({ interfaceFont: event.target.value })}
          >
            <option value="system-ui">System UI</option>
            <option value="Inter">Inter</option>
            <option value="Cascadia Code">Cascadia Code</option>
          </select>
        </Field>
        <Field label="Editor font">
          <select
            value={state.settings.editorFont}
            onChange={(event) => state.updateSettings({ editorFont: event.target.value })}
          >
            <option value="system-ui">System sans</option>
            <option value="Charter">Charter</option>
            <option value="Georgia">Georgia</option>
            <option value="Inter">Inter</option>
            <option value="Cascadia Code">Cascadia Code</option>
          </select>
        </Field>
        <Field label="Editor font size">
          <div className="range-fields">
            <input
              type="range"
              min={12}
              max={24}
              value={state.settings.editorFontSize}
              onChange={(event) =>
                state.updateSettings({ editorFontSize: Number(event.target.value) })
              }
            />
            <output>{state.settings.editorFontSize}px</output>
          </div>
        </Field>
        <Field label="Editor line width">
          <div className="range-fields">
            <input
              type="range"
              min={520}
              max={1200}
              step={20}
              value={state.settings.editorLineWidth}
              onChange={(event) =>
                state.updateSettings({ editorLineWidth: Number(event.target.value) })
              }
            />
            <output>{state.settings.editorLineWidth}px</output>
          </div>
        </Field>
      </SettingsGroup>
    );
  if (active === "workspaces")
    return (
      <>
        <SettingsGroup title="Workspaces" description="Data is isolated at the storage boundary.">
          {[...state.workspaces]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((workspace, index) => (
              <div className="workspace-setting" key={workspace.id}>
                <input
                  type="color"
                  aria-label={`${workspace.name} color`}
                  value={workspace.color}
                  onChange={(event) =>
                    state.updateWorkspace(workspace.id, { color: event.target.value })
                  }
                />
                <input
                  aria-label="Workspace name"
                  value={workspace.name}
                  onChange={(event) =>
                    state.updateWorkspace(workspace.id, { name: event.target.value })
                  }
                />
                <select
                  aria-label={`${workspace.name} workspace type`}
                  value={workspace.kind}
                  onChange={(event) =>
                    state.updateWorkspace(workspace.id, {
                      kind: event.target.value as typeof workspace.kind,
                    })
                  }
                >
                  <option value="student">Study</option>
                  <option value="personal">Personal</option>
                  <option value="custom">Custom</option>
                </select>
                <button
                  className="icon-button"
                  aria-label={`Move ${workspace.name} up`}
                  disabled={index === 0}
                  onClick={() => state.moveWorkspace(workspace.id, -1)}
                >
                  <ArrowUp />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move ${workspace.name} down`}
                  disabled={index === state.workspaces.length - 1}
                  onClick={() => state.moveWorkspace(workspace.id, 1)}
                >
                  <ArrowDown />
                </button>
                <button
                  className="icon-button danger"
                  aria-label={`Delete ${workspace.name}`}
                  disabled={state.workspaces.length <= 1}
                  onClick={() => {
                    const confirmation = window.prompt(
                      `Type ${workspace.name} to permanently delete this workspace`,
                    );
                    if (confirmation === workspace.name)
                      void deleteNativeWorkspace(workspace.id)
                        .then(() => state.deleteWorkspace(workspace.id))
                        .catch((error: unknown) =>
                          window.alert(`Unable to delete workspace: ${String(error)}`),
                        );
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          <button
            className="button icon-text"
            onClick={() =>
              state.addWorkspace(`Workspace ${state.workspaces.length + 1}`, "#657287")
            }
          >
            <Plus /> New workspace
          </button>
        </SettingsGroup>
        <SettingsGroup
          title="Dashboard layout"
          description="Order or hide widgets for the active workspace. You can also drag them on Home."
        >
          <DashboardLayoutSettings state={state} />
        </SettingsGroup>
      </>
    );
  if (active === "categories") {
    const categories = state.categories
      .filter((category) => category.workspaceId === state.activeWorkspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return (
      <SettingsGroup
        title="Categories"
        description="Categories provide the color used by calendar items, habits, and metrics."
      >
        <div className="category-settings-list">
          {categories.map((category, index) => (
            <div key={category.id}>
              <input
                className="category-icon-input"
                aria-label={`${category.name} icon`}
                value={category.icon}
                maxLength={2}
                onChange={(event) =>
                  state.updateCategory(category.id, { icon: event.target.value })
                }
              />
              <input
                type="color"
                aria-label={`${category.name} color`}
                value={category.color}
                onChange={(event) =>
                  state.updateCategory(category.id, { color: event.target.value })
                }
              />
              <input
                aria-label="Category name"
                value={category.name}
                onChange={(event) =>
                  state.updateCategory(category.id, { name: event.target.value })
                }
              />
              <button
                className="icon-button"
                aria-label={`Move ${category.name} up`}
                disabled={index === 0}
                onClick={() => state.moveCategory(category.id, -1)}
              >
                <ArrowUp />
              </button>
              <button
                className="icon-button"
                aria-label={`Move ${category.name} down`}
                disabled={index === categories.length - 1}
                onClick={() => state.moveCategory(category.id, 1)}
              >
                <ArrowDown />
              </button>
              <button
                className="icon-button danger"
                aria-label={`Delete ${category.name}`}
                disabled={categories.length === 1}
                onClick={() => state.deleteCategory(category.id)}
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
        <button className="button icon-text" onClick={() => state.addCategory()}>
          <Plus /> New category
        </button>
      </SettingsGroup>
    );
  }
  if (active === "calendar")
    return (
      <SettingsGroup
        title="Calendar"
        description="Choose the hours shown in Day and Week views and default reminder timing."
      >
        <Field label="Week starts on">
          <select
            value={state.settings.weekStartsOn}
            onChange={(event) =>
              state.updateSettings({ weekStartsOn: Number(event.target.value) as 0 | 1 })
            }
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </Field>
        <Field label="Visible hours">
          <div className="range-fields">
            <input
              type="number"
              min={0}
              max={23}
              aria-label="First visible hour"
              value={state.settings.calendarVisibleStart}
              onChange={(event) =>
                state.updateSettings({
                  calendarVisibleStart: Math.min(
                    state.settings.calendarVisibleEnd - 1,
                    Math.max(0, Number(event.target.value)),
                  ),
                })
              }
            />
            <span>to</span>
            <input
              type="number"
              min={1}
              max={24}
              aria-label="Last visible hour"
              value={state.settings.calendarVisibleEnd}
              onChange={(event) =>
                state.updateSettings({
                  calendarVisibleEnd: Math.max(
                    state.settings.calendarVisibleStart + 1,
                    Math.min(24, Number(event.target.value)),
                  ),
                })
              }
            />
          </div>
        </Field>
        <Field label="Default reminder">
          <select
            value={state.settings.defaultReminderMinutes}
            onChange={(event) =>
              state.updateSettings({ defaultReminderMinutes: Number(event.target.value) })
            }
          >
            <option value={0}>At start time</option>
            <option value={5}>5 minutes before</option>
            <option value={10}>10 minutes before</option>
            <option value={30}>30 minutes before</option>
            <option value={60}>1 hour before</option>
            <option value={1440}>1 day before</option>
          </select>
        </Field>
        <Field label="Default event duration">
          <select
            value={state.settings.defaultEventDurationMinutes}
            onChange={(event) =>
              state.updateSettings({ defaultEventDurationMinutes: Number(event.target.value) })
            }
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>1 hour</option>
            <option value={90}>1 hour 30 minutes</option>
            <option value={120}>2 hours</option>
          </select>
        </Field>
        <small>Individual items can override this with one or more reminder times.</small>
      </SettingsGroup>
    );
  if (active === "editor")
    return (
      <SettingsGroup
        title="Editor defaults"
        description="These defaults apply to new editor sessions; note-specific view options can still override them."
      >
        <Toggle
          label="Spell-check"
          description="Use the Windows spell-check service while typing."
          checked={state.settings.spellCheck}
          onChange={(spellCheck) => state.updateSettings({ spellCheck })}
        />
        <Field label="Spell-check language">
          <select
            value={state.settings.spellCheckLanguage}
            onChange={(event) =>
              state.updateSettings({
                spellCheckLanguage: event.target.value as "en-US" | "fr-FR",
              })
            }
          >
            <option value="en-US">English (United States)</option>
            <option value="fr-FR">Français (France)</option>
          </select>
        </Field>
        <Toggle
          label="Auto-pair brackets"
          description="Insert the closing bracket, brace, quote, or parenthesis."
          checked={state.settings.autoPairBrackets}
          onChange={(autoPairBrackets) => state.updateSettings({ autoPairBrackets })}
        />
        <Field label="Tab key">
          <select
            value={state.settings.tabBehavior}
            onChange={(event) =>
              state.updateSettings({ tabBehavior: event.target.value as "indent" | "focus" })
            }
          >
            <option value="indent">Indent the current block</option>
            <option value="focus">Move focus to the next control</option>
          </select>
        </Field>
        <Field label="Default new-note folder">
          <input
            value={state.settings.defaultNoteFolder}
            onChange={(event) => state.updateSettings({ defaultNoteFolder: event.target.value })}
            placeholder="notes"
          />
        </Field>
        <Field label="Default template">
          <select
            value={state.settings.defaultTemplateId}
            onChange={(event) => state.updateSettings({ defaultTemplateId: event.target.value })}
          >
            <option value="">None</option>
            {state.templates
              .filter((template) => template.workspaceId === state.activeWorkspaceId)
              .map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name}
                </option>
              ))}
          </select>
        </Field>
      </SettingsGroup>
    );
  if (active === "shortcuts") {
    const conflicts = shortcutConflicts(state.settings.keymap);
    return (
      <SettingsGroup
        title="Keyboard shortcuts"
        description="Changes are written to .app/keymap.json. Duplicate shortcuts are highlighted."
      >
        <div className="shortcut-list">
          {Object.entries(state.settings.keymap).map(([command, shortcut]) => {
            const conflict = conflicts.has(command);
            return (
              <label className={conflict ? "conflict" : ""} key={command}>
                <span>{shortcutLabel(command)}</span>
                <input
                  value={shortcut}
                  aria-invalid={conflict}
                  onChange={(event) => {
                    const keymap = { ...state.settings.keymap, [command]: event.target.value };
                    state.updateSettings({ keymap });
                    void persistNativeKeymap(keymap);
                  }}
                />
                {conflict && <small>Conflict</small>}
              </label>
            );
          })}
        </div>
        <div className="button-row">
          <button
            className="button"
            onClick={() => {
              const keymap = defaultKeymap();
              state.updateSettings({ keymap });
              void persistNativeKeymap(keymap);
            }}
          >
            <RotateCcw /> Reset to defaults
          </button>
        </div>
      </SettingsGroup>
    );
  }
  if (active === "recap")
    return (
      <>
        <SettingsGroup
          title="Summariser"
          description="The report always works without a model. Remote and local models only enrich its prose."
        >
          <div className="recommended-provider">
            <span>
              <strong>Recommended: OpenRouter + Kimi K2.6</strong>
              <small>A capable, low-cost model for monthly and yearly recap narratives.</small>
            </span>
            <button
              className="button"
              onClick={() =>
                state.updateSettings({
                  recapProvider: "remote",
                  recapEndpoint: OPENROUTER_ENDPOINT,
                  recapModel: OPENROUTER_MODEL,
                })
              }
            >
              Use recommended setup
            </button>
          </div>
          <Field label="Provider">
            <select
              value={state.settings.recapProvider}
              onChange={(event) =>
                state.updateSettings({
                  recapProvider: event.target.value as "none" | "remote" | "local",
                })
              }
            >
              <option value="none">None — deterministic template</option>
              <option value="remote">Remote — OpenAI compatible</option>
              <option value="local">Local — Ollama</option>
            </select>
          </Field>
          <Field label="Endpoint">
            <input
              value={state.settings.recapEndpoint}
              onChange={(event) => state.updateSettings({ recapEndpoint: event.target.value })}
            />
          </Field>
          <Field label="Model">
            <input
              list="ollama-models"
              value={state.settings.recapModel}
              onChange={(event) => state.updateSettings({ recapModel: event.target.value })}
              placeholder="Provider model identifier"
            />
            <datalist id="ollama-models">
              {ollamaModels.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            {state.settings.recapProvider === "local" && (
              <small>
                {ollamaStatus === "checking"
                  ? "Checking localhost:11434…"
                  : ollamaStatus === "ready"
                    ? `${ollamaModels.length} installed model${ollamaModels.length === 1 ? "" : "s"} detected`
                    : "Ollama is not running or has no installed models."}
              </small>
            )}
          </Field>
          <Field label="Temperature">
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={state.settings.recapTemperature}
              onChange={(event) =>
                state.updateSettings({ recapTemperature: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="Maximum tokens">
            <input
              type="number"
              min="256"
              max="16000"
              step="128"
              value={state.settings.recapMaxTokens}
              onChange={(event) =>
                state.updateSettings({ recapMaxTokens: Number(event.target.value) })
              }
            />
          </Field>
          <RemoteApiKeyField
            endpoint={state.settings.recapEndpoint}
            onSaved={() => state.updateSettings({ recapProvider: "remote" })}
          />
          <Toggle
            label="Aggregated statistics only"
            description="Exclude note titles and all free text from remote requests."
            checked={state.settings.recapAggregatesOnly}
            onChange={(checked) => state.updateSettings({ recapAggregatesOnly: checked })}
          />
        </SettingsGroup>
        <SettingsGroup title="Automatic generation">
          <Toggle
            label="Monthly recap"
            description="Generate on the first day of each month."
            checked={state.settings.recapAutoMonthly}
            onChange={(checked) => state.updateSettings({ recapAutoMonthly: checked })}
          />
          <Toggle
            label="Yearly recap"
            description="Generate on 1 January."
            checked={state.settings.recapAutoYearly}
            onChange={(checked) => state.updateSettings({ recapAutoYearly: checked })}
          />
        </SettingsGroup>
      </>
    );
  if (active === "vault")
    return (
      <>
        <SettingsGroup
          title="Vault location"
          description="Markdown notes and Canvas JSON remain the source of truth."
        >
          <Field label="Current location">
            <div className="path-field">
              <code>{vaultInfo?.path ?? state.settings.vaultLocation}</code>
              <button className="button" onClick={() => void openNativeVault()}>
                <FolderOpen /> Open
              </button>
            </div>
          </Field>
          <div className="storage-card">
            <HardDrive />
            <span>
              <strong>{formatBytes(vaultInfo?.totalBytes ?? 0)} used</strong>
              <small>
                {vaultInfo?.workspaces
                  .map((workspace) => `${workspace.name} ${formatBytes(workspace.bytes)}`)
                  .join(" · ") ?? "Open the desktop build to inspect storage"}
              </small>
            </span>
          </div>
          <div className="button-row">
            <button
              className="button"
              onClick={() =>
                void chooseAndMoveVault()
                  .then((info) => {
                    if (!info) return;
                    setVaultInfo(info);
                    state.updateSettings({ vaultLocation: info.path });
                  })
                  .catch((error: unknown) => window.alert(`Unable to move vault: ${String(error)}`))
              }
            >
              Move vault…
            </button>
            <button
              className="button"
              onClick={() =>
                void rebuildNativeIndex()
                  .then((count) => {
                    window.alert(`Index rebuilt from ${count} files.`);
                    return getNativeVaultInfo();
                  })
                  .then((info) => info && setVaultInfo(info))
              }
            >
              <RotateCcw /> Re-index
            </button>
          </div>
        </SettingsGroup>
        <TrashManager state={state} />
      </>
    );
  if (active === "backup")
    return (
      <SettingsGroup
        title="Local backups"
        description="Daily, plus one before every database migration. The last ten are retained."
      >
        <Field label="Backup location">
          <div className="path-field">
            <code>{state.settings.backupLocation}</code>
            <button
              className="button"
              onClick={() =>
                void chooseDirectory("Choose backup folder").then(
                  (backupLocation) => backupLocation && state.updateSettings({ backupLocation }),
                )
              }
            >
              Choose…
            </button>
          </div>
        </Field>
        <Field label="Frequency">
          <select
            value={state.settings.backupFrequency}
            onChange={(event) =>
              state.updateSettings({
                backupFrequency: event.target.value as "daily" | "weekly" | "launch",
              })
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="launch">On launch</option>
          </select>
        </Field>
        <Field label="Retention">
          <input
            type="number"
            min={1}
            max={100}
            value={state.settings.backupRetention}
            onChange={(event) =>
              state.updateSettings({
                backupRetention: Math.max(1, Math.min(100, Number(event.target.value))),
              })
            }
          />
        </Field>
        <div className="button-row">
          <button
            className="button primary"
            onClick={() =>
              void chooseAndBackupVault(
                state.settings.backupLocation,
                state.settings.backupRetention,
              )
            }
          >
            <Download /> Back up now
          </button>
          <button className="button" onClick={() => void chooseAndRestoreBackup()}>
            <ArchiveRestore /> Restore…
          </button>
        </div>
      </SettingsGroup>
    );
  if (active === "import")
    return (
      <SettingsGroup
        title="Move data in or out"
        description="Imports are non-destructive and undoable as one operation."
      >
        <div className="import-cards">
          <button onClick={() => void chooseAndImport("obsidian", state.activeWorkspaceId)}>
            <Upload />
            <span>
              <strong>Import Obsidian vault</strong>
              <small>Notes, links, attachments, frontmatter, and .canvas files</small>
            </span>
          </button>
          <button onClick={() => void chooseAndImport("notion", state.activeWorkspaceId)}>
            <Upload />
            <span>
              <strong>Import Notion export</strong>
              <small>Markdown pages, CSV databases, images, and files</small>
            </span>
          </button>
          <button onClick={() => void chooseAndExportVault()}>
            <Download />
            <span>
              <strong>Export entire vault</strong>
              <small>Portable files plus structured data as JSON</small>
            </span>
          </button>
        </div>
      </SettingsGroup>
    );
  if (active === "about")
    return <AboutSection onComponents={() => state.setModule("components")} />;
  return (
    <SettingsGroup
      title={
        active === "general"
          ? "General"
          : (sections.find(([id]) => id === active)?.[1] ?? "Settings")
      }
      description="These preferences apply to Diorna on this device."
    >
      {active === "general" && (
        <>
          <Field label="Language">
            <select
              value={state.settings.language}
              onChange={(event) =>
                state.updateSettings({
                  language: event.target.value as "en" | "fr",
                  weekStartsOn: event.target.value === "fr" ? 1 : 0,
                  dailyWeekStartsOn: event.target.value === "fr" ? 1 : 0,
                  spellCheckLanguage: event.target.value === "fr" ? "fr-FR" : "en-US",
                })
              }
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </Field>
          <Toggle
            label="Start with Windows"
            description={
              portable
                ? "Portable mode never writes a startup registration."
                : "Launch Diorna when you sign in."
            }
            checked={state.settings.startWithWindows}
            disabled={portable}
            onChange={(checked) => state.updateSettings({ startWithWindows: checked })}
          />
          <Toggle
            label="Minimise to tray"
            description="Keep quick capture available when closing the window."
            checked={state.settings.minimizeToTray}
            onChange={(checked) => state.updateSettings({ minimizeToTray: checked })}
          />
          <Field label="Default workspace on launch">
            <select
              value={state.settings.defaultWorkspaceId}
              onChange={(event) => state.updateSettings({ defaultWorkspaceId: event.target.value })}
            >
              <option value="">Last used workspace</option>
              {state.workspaces
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((workspace) => (
                  <option value={workspace.id} key={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Update channel">
            <select
              value={state.settings.updateChannel}
              onChange={(event) =>
                state.updateSettings({ updateChannel: event.target.value as "stable" | "beta" })
              }
            >
              <option value="stable">Stable</option>
              <option value="beta">Beta</option>
            </select>
          </Field>
          <Toggle
            label="Automatic updates"
            description={
              portable
                ? "Portable builds never contact the update service."
                : "Disable for a fully manual update workflow."
            }
            checked={state.settings.updateEnabled}
            disabled={portable}
            onChange={(checked) => state.updateSettings({ updateEnabled: checked })}
          />
          <div className="settings-action-row">
            <button
              className="button icon-text"
              disabled={
                portable ||
                updateState?.status === "checking" ||
                updateState?.status === "downloading"
              }
              onClick={() =>
                void checkAndDownloadUpdate(true, state.settings.updateChannel).then(setUpdateState)
              }
            >
              <RotateCcw size={15} /> Check for updates
            </button>
            {updateState?.status === "current" && <small>Diorna is up to date.</small>}
            {updateState?.status === "checking" && <small>Checking…</small>}
            {updateState?.status === "downloading" && (
              <small>
                Downloading {updateState.progress === null ? "…" : `${updateState.progress}%`}
              </small>
            )}
            {updateState?.status === "ready" && (
              <small>Version {updateState.version} is ready to install.</small>
            )}
            {updateState?.status === "error" && <small role="alert">{updateState.message}</small>}
          </div>
        </>
      )}
      {active === "daily" && (
        <>
          <Toggle
            label="Allow future check-in"
            description="Future days are read-only by default."
            checked={state.settings.allowFutureCheckIn}
            onChange={(checked) => state.updateSettings({ allowFutureCheckIn: checked })}
          />
          <Field label="Default window">
            <select
              value={state.settings.dailyWindow}
              onChange={(event) =>
                state.updateSettings({
                  dailyWindow: event.target.value as typeof state.settings.dailyWindow,
                })
              }
            >
              <option value="plus-minus-3">±3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="week">Current week</option>
              <option value="month">Current month</option>
            </select>
          </Field>
          <Field label="Week starts on">
            <select
              value={state.settings.dailyWeekStartsOn}
              onChange={(event) =>
                state.updateSettings({
                  dailyWeekStartsOn: Number(event.target.value) as 0 | 1,
                })
              }
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </Field>
        </>
      )}
      {!["general", "daily"].includes(active) && (
        <div className="empty-settings">
          <Wrench />
          <strong>Configuration ready</strong>
          <p>This section is backed by the human-readable vault settings file.</p>
        </div>
      )}
    </SettingsGroup>
  );
}

function AboutSection({ onComponents }: { onComponents: () => void }) {
  const [document, setDocument] = useState<"license" | "notices" | "release" | null>(null);
  return (
    <SettingsGroup title="Diorna 0.1.0" description="The daily register of things done.">
      <div className="about-mark">D</div>
      <p>
        Copyright © Diorna contributors. Free software under AGPL-3.0-only; distributed without
        warranty.
      </p>
      <div className="button-row">
        <button
          className="button"
          onClick={() => void openExternalUrl("https://github.com/diorna-app/diorna")}
        >
          View source
        </button>
        <button className="button" onClick={() => setDocument("license")}>
          Licence
        </button>
        <button className="button" onClick={() => setDocument("notices")}>
          Third-party notices
        </button>
        <button className="button" onClick={() => setDocument("release")}>
          Release notes
        </button>
        <button className="button" onClick={onComponents}>
          Component library
        </button>
      </div>
      <small>No telemetry. No accounts. Your files remain yours.</small>
      {document && (
        <div className="legal-overlay" role="dialog" aria-modal="true">
          <section className="legal-dialog">
            <header>
              <h2>
                {document === "license"
                  ? "Licence"
                  : document === "notices"
                    ? "Third-party notices"
                    : "Release notes"}
              </h2>
              <button className="icon-button" aria-label="Close" onClick={() => setDocument(null)}>
                ×
              </button>
            </header>
            <pre>
              {document === "license"
                ? projectLicense
                : document === "notices"
                  ? thirdPartyNotices
                  : releaseNotes}
            </pre>
          </section>
        </div>
      )}
    </SettingsGroup>
  );
}

function TrashManager({ state }: { state: ReturnType<typeof useDiornaStore.getState> }) {
  const [nativeRecords, setNativeRecords] = useState<NativeTrashRecord[]>([]);
  const workspaceId = state.activeWorkspaceId;
  const refresh = () =>
    void listNativeTrash(workspaceId)
      .then(setNativeRecords)
      .catch((error: unknown) => console.warn("Unable to list native trash", error));
  useEffect(() => {
    void listNativeTrash(workspaceId)
      .then(setNativeRecords)
      .catch((error: unknown) => console.warn("Unable to list native trash", error));
  }, [workspaceId]);
  const nativeKeys = new Set(
    nativeRecords.map((record) => `${record.kind}:${record.originalPath.replace(/\\/g, "/")}`),
  );
  const localRecords: NativeTrashRecord[] = [
    ...state.notes
      .filter((entry) => entry.workspaceId === workspaceId && entry.trashedAt)
      .map((entry) => ({
        id: `local-note-${entry.id}`,
        workspaceId,
        kind: "notes" as const,
        originalPath: entry.path.replace(/^notes[\\/]/, "").replace(/\\/g, "/"),
        trashPath: "",
        deletedAt: entry.trashedAt!,
      })),
    ...state.maps
      .filter((entry) => entry.workspaceId === workspaceId && entry.trashedAt)
      .map((entry) => ({
        id: `local-map-${entry.id}`,
        workspaceId,
        kind: "maps" as const,
        originalPath: entry.path.replace(/^maps[\\/]/, "").replace(/\\/g, "/"),
        trashPath: "",
        deletedAt: entry.trashedAt!,
      })),
  ].filter((record) => !nativeKeys.has(`${record.kind}:${record.originalPath}`));
  const files = [...nativeRecords, ...localRecords].sort((a, b) =>
    b.deletedAt.localeCompare(a.deletedAt),
  );
  const items = state.items.filter((entry) => entry.workspaceId === workspaceId && entry.trashedAt);
  const restoreFile = async (record: NativeTrashRecord) => {
    const localOnly = record.id.startsWith("local-");
    const restoredPath = localOnly
      ? record.originalPath
      : await restoreNativeTrash(workspaceId, record.id);
    state.restoreFileTrash(record.kind, record.originalPath, restoredPath);
    if (!localOnly) {
      const disk = await readNativeFileContent();
      if (disk) state.hydrateFileContent(disk);
    }
    refresh();
  };
  const purgeFile = async (record: NativeTrashRecord) => {
    if (!record.id.startsWith("local-")) await purgeNativeTrash(workspaceId, record.id);
    state.purgeFileTrash(record.kind, record.originalPath);
    refresh();
  };
  const empty = !files.length && !items.length;
  return (
    <SettingsGroup
      title="Trash"
      description="Deleted files can be restored for 30 days; expired entries are removed automatically."
    >
      <div className="trash-settings-list">
        {files.map((record) => (
          <div key={record.id}>
            {record.kind === "notes" ? <BookOpen size={15} /> : <LayoutGrid size={15} />}
            <span>
              <strong>{record.originalPath.split(/[\\/]/).at(-1)}</strong>
              <small>
                {record.kind === "notes" ? "Note" : "Map"} · deleted{" "}
                {new Date(record.deletedAt).toLocaleDateString()}
              </small>
            </span>
            <button className="button compact" onClick={() => void restoreFile(record)}>
              Restore
            </button>
            <button
              className="icon-button danger"
              aria-label="Purge permanently"
              onClick={() => void purgeFile(record)}
            >
              <Trash2 />
            </button>
          </div>
        ))}
        {items.map((item) => (
          <div key={item.id}>
            <Bell size={15} />
            <span>
              <strong>{item.title}</strong>
              <small>
                {item.kind} · deleted {new Date(item.trashedAt!).toLocaleDateString()}
              </small>
            </span>
            <button className="button compact" onClick={() => state.restoreItem(item.id)}>
              Restore
            </button>
            <button
              className="icon-button danger"
              aria-label={`Purge ${item.title} permanently`}
              onClick={() => state.purgeItem(item.id)}
            >
              <Trash2 />
            </button>
          </div>
        ))}
        {empty && <div className="empty-mini">Trash is empty.</div>}
      </div>
      {!empty && (
        <button
          className="button danger"
          onClick={() => {
            if (!window.confirm("Permanently purge every item in this workspace’s Trash?")) return;
            files.forEach((record) => void purgeFile(record));
            items.forEach((item) => state.purgeItem(item.id));
          }}
        >
          Empty trash now
        </button>
      )}
    </SettingsGroup>
  );
}

function DashboardLayoutSettings({ state }: { state: ReturnType<typeof useDiornaStore.getState> }) {
  const workspace = state.workspaces.find((entry) => entry.id === state.activeWorkspaceId)!;
  const defaults =
    workspace.kind === "student"
      ? ["score", "agenda", "courses", "flashcards", "streaks", "recent", "recap"]
      : ["score", "agenda", "projects", "streaks", "recent", "recap"];
  const stored = state.settings.dashboardWidgetOrder[workspace.id] ?? defaults;
  const order = [...stored, ...defaults.filter((id) => !stored.includes(id))];
  const hidden = state.settings.dashboardHiddenWidgets[workspace.id] ?? [];
  const save = (nextOrder: string[], nextHidden = hidden) =>
    state.updateSettings({
      dashboardWidgetOrder: {
        ...state.settings.dashboardWidgetOrder,
        [workspace.id]: nextOrder,
      },
      dashboardHiddenWidgets: {
        ...state.settings.dashboardHiddenWidgets,
        [workspace.id]: nextHidden,
      },
    });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    save(next);
  };
  return (
    <div className="dashboard-setting-list">
      {order.map((id, index) => (
        <div key={id}>
          <input
            type="checkbox"
            aria-label={`Show ${dashboardLabels[id]}`}
            checked={!hidden.includes(id)}
            onChange={(event) =>
              save(
                order,
                event.target.checked ? hidden.filter((entry) => entry !== id) : [...hidden, id],
              )
            }
          />
          <span>{dashboardLabels[id] ?? id}</span>
          <button
            className="icon-button"
            aria-label={`Move ${dashboardLabels[id]} up`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp />
          </button>
          <button
            className="icon-button"
            aria-label={`Move ${dashboardLabels[id]} down`}
            disabled={index === order.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown />
          </button>
        </div>
      ))}
    </div>
  );
}

function SettingsGroup({
  title,
  description = "",
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-group">
      <header>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}

function RemoteApiKeyField({ endpoint, onSaved }: { endpoint: string; onSaved: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"checking" | "missing" | "saved" | "error">("checking");
  const provider = recapSecretId(endpoint);

  useEffect(() => {
    let active = true;
    setStatus("checking");
    void hasNativeApiKey(provider)
      .then((stored) => active && setStatus(stored ? "saved" : "missing"))
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [provider]);

  const save = async () => {
    const value = apiKey.trim();
    if (!value) return;
    try {
      await storeNativeApiKey(provider, value);
      setApiKey("");
      setStatus("saved");
      onSaved();
      window.dispatchEvent(new Event("diorna-api-key-changed"));
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="setting-field api-key-field">
      <span>API key</span>
      <div>
        <div className="api-key-input">
          <input
            aria-label="OpenRouter API key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            placeholder="sk-or-v1-…"
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
          />
          <button className="button" disabled={!apiKey.trim()} onClick={() => void save()}>
            Save key
          </button>
        </div>
        <small className={`api-key-status ${status}`} aria-live="polite">
          {status === "checking"
            ? "Checking secure storage…"
            : status === "saved"
              ? "API key saved securely with Windows DPAPI."
              : status === "error"
                ? "The API key could not be saved or read."
                : "No API key saved on this device."}
        </small>
        <button
          className="text-button"
          onClick={() => void openExternalUrl("https://openrouter.ai/keys")}
        >
          Create or manage an OpenRouter key
        </button>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="setting-field">
      <span>{label}</span>
      <div>{children}</div>
    </label>
  );
}
function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-field">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i />
    </label>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function defaultKeymap(): Record<string, string> {
  return {
    commandPalette: "Ctrl+K",
    quickCapture: "Ctrl+Alt+Space",
    toggleSidebar: "Ctrl+B",
    closeTab: "Ctrl+W",
    nextRecentTab: "Ctrl+Tab",
    notes: "Ctrl+1",
    maps: "Ctrl+2",
    calendar: "Ctrl+3",
    daily: "Ctrl+4",
    recap: "Ctrl+5",
    home: "Ctrl+0",
    settings: "Ctrl+,",
    newNote: "Ctrl+N",
    newTask: "Ctrl+Shift+T",
    toggleContext: "Ctrl+Shift+B",
    splitHorizontal: "Ctrl+\\",
    splitVertical: "Ctrl+Shift+\\",
    workspace1: "Ctrl+Shift+1",
    workspace2: "Ctrl+Shift+2",
    workspace3: "Ctrl+Shift+3",
    workspace4: "Ctrl+Shift+4",
    workspace5: "Ctrl+Shift+5",
    workspace6: "Ctrl+Shift+6",
    workspace7: "Ctrl+Shift+7",
    workspace8: "Ctrl+Shift+8",
    workspace9: "Ctrl+Shift+9",
  };
}

function shortcutConflicts(keymap: Record<string, string>): Set<string> {
  const commands = Object.keys(keymap);
  return new Set(
    commands.filter((command) => {
      const value = keymap[command]?.trim().toLocaleLowerCase();
      return Boolean(
        value &&
          commands.some(
            (other) => other !== command && keymap[other]?.trim().toLocaleLowerCase() === value,
          ),
      );
    }),
  );
}

function shortcutLabel(command: string): string {
  const labels: Record<string, string> = {
    commandPalette: "Command palette",
    quickCapture: "Quick capture",
    toggleSidebar: "Toggle sidebar",
    closeTab: "Close tab",
    nextRecentTab: "Most recent tab",
    notes: "Open Notes",
    maps: "Open Maps",
    calendar: "Open Calendar",
    daily: "Open Daily",
    recap: "Open Recap",
    home: "Open Home",
    settings: "Open Settings",
    newNote: "New note",
    newTask: "New task",
    toggleContext: "Toggle context panel",
    splitHorizontal: "Split pane right",
    splitVertical: "Split pane down",
  };
  return labels[command] ?? command.replace(/([A-Z])/g, " $1");
}
