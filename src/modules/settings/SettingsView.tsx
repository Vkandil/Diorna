import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  Bell,
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
  Upload,
  UserRound,
  Wrench,
} from "lucide-react";
import { useDiornaStore } from "@/core/store";
import {
  chooseAndBackupVault,
  chooseAndExportVault,
  chooseAndImport,
  openExternalUrl,
  storeNativeApiKey,
} from "@/core/native";
import thirdPartyNotices from "../../../THIRD_PARTY_NOTICES.md?raw";
import projectLicense from "../../../LICENSE?raw";

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

export function SettingsView() {
  const state = useDiornaStore();
  const [active, setActive] = useState("general");
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => sections.filter(([, label]) => label.toLowerCase().includes(query.toLowerCase())),
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
          <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}>
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
        {renderSection(active, state)}
      </div>
    </div>
  );
}

function renderSection(active: string, state: ReturnType<typeof useDiornaStore.getState>) {
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
            {["#5b5bd6", "#3f70b5", "#168a68", "#b47619", "#c0445c", "#795ac8"].map((color) => (
              <button
                key={color}
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
          <select>
            <option>System UI</option>
            <option>Inter</option>
          </select>
        </Field>
        <Field label="Editor font">
          <select>
            <option>System sans</option>
            <option>Source Serif</option>
            <option>Inter</option>
          </select>
        </Field>
      </SettingsGroup>
    );
  if (active === "workspaces")
    return (
      <SettingsGroup title="Workspaces" description="Data is isolated at the storage boundary.">
        {state.workspaces.map((workspace) => (
          <div className="workspace-setting" key={workspace.id}>
            <i style={{ background: workspace.color }} />
            <input
              value={workspace.name}
              onChange={(event) => state.renameWorkspace(workspace.id, event.target.value)}
            />
            <span>{workspace.kind}</span>
            <button>•••</button>
          </div>
        ))}
        <button
          className="button icon-text"
          onClick={() => state.addWorkspace(`Workspace ${state.workspaces.length + 1}`, "#657287")}
        >
          <Plus /> New workspace
        </button>
      </SettingsGroup>
    );
  if (active === "recap")
    return (
      <>
        <SettingsGroup
          title="Summariser"
          description="The report always works without a model. Remote and local models only enrich its prose."
        >
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
              value={state.settings.recapModel}
              onChange={(event) => state.updateSettings({ recapModel: event.target.value })}
              placeholder="Provider model identifier"
            />
          </Field>
          <Field label="API key">
            <input
              type="password"
              placeholder="Stored with Windows DPAPI"
              onBlur={(event) => {
                void storeNativeApiKey("openrouter", event.currentTarget.value);
                event.currentTarget.value = "";
              }}
            />
            <small>Never stored in the vault or synced files.</small>
          </Field>
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
      <SettingsGroup
        title="Vault location"
        description="Markdown notes and Canvas JSON remain the source of truth."
      >
        <Field label="Current location">
          <div className="path-field">
            <code>Documents\Diorna</code>
            <button className="button">
              <FolderOpen /> Open
            </button>
          </div>
        </Field>
        <div className="storage-card">
          <HardDrive />
          <span>
            <strong>12.4 MB used</strong>
            <small>Notes 2.1 MB · Attachments 9.8 MB · Index 0.5 MB</small>
          </span>
        </div>
        <div className="button-row">
          <button className="button">Move vault…</button>
          <button className="button">
            <RotateCcw /> Re-index
          </button>
        </div>
      </SettingsGroup>
    );
  if (active === "backup")
    return (
      <SettingsGroup
        title="Local backups"
        description="Daily, plus one before every database migration. The last ten are retained."
      >
        <Field label="Backup location">
          <div className="path-field">
            <code>Documents\Diorna Backups</code>
            <button className="button">Choose…</button>
          </div>
        </Field>
        <Field label="Frequency">
          <select>
            <option>Daily</option>
            <option>Weekly</option>
            <option>On launch</option>
          </select>
        </Field>
        <Field label="Retention">
          <input type="number" defaultValue={10} />
        </Field>
        <div className="button-row">
          <button className="button primary" onClick={() => void chooseAndBackupVault()}>
            <Download /> Back up now
          </button>
          <button className="button">
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
                })
              }
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </Field>
          <Toggle
            label="Start with Windows"
            description="Launch Diorna when you sign in."
            checked={state.settings.startWithWindows}
            onChange={(checked) => state.updateSettings({ startWithWindows: checked })}
          />
          <Toggle
            label="Minimise to tray"
            description="Keep quick capture available when closing the window."
            checked={state.settings.minimizeToTray}
            onChange={(checked) => state.updateSettings({ minimizeToTray: checked })}
          />
          <Toggle
            label="Automatic updates"
            description="Disable for a fully manual update workflow."
            checked={state.settings.updateEnabled}
            onChange={(checked) => state.updateSettings({ updateEnabled: checked })}
          />
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
  const [document, setDocument] = useState<"license" | "notices" | null>(null);
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
        <button className="button" onClick={onComponents}>
          Component library
        </button>
      </div>
      <small>No telemetry. No accounts. Your files remain yours.</small>
      {document && (
        <div className="legal-overlay" role="dialog" aria-modal="true">
          <section className="legal-dialog">
            <header>
              <h2>{document === "license" ? "Licence" : "Third-party notices"}</h2>
              <button className="icon-button" aria-label="Close" onClick={() => setDocument(null)}>
                ×
              </button>
            </header>
            <pre>{document === "license" ? projectLicense : thirdPartyNotices}</pre>
          </section>
        </div>
      )}
    </SettingsGroup>
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
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i />
    </label>
  );
}
