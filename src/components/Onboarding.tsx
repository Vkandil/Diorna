import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Moon,
  Palette,
  Plus,
  Sun,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { useDiornaStore } from "@/core/store";
import type { AppSettings, Workspace } from "@/shared/models";
import { createId } from "@/shared/id";
import {
  chooseDirectory,
  chooseVaultFolder,
  importNativeFolder,
  initialiseNativeVault,
} from "@/core/native";

export function Onboarding() {
  const finish = useDiornaStore((state) => state.finishOnboarding);
  const updateSettings = useDiornaStore((state) => state.updateSettings);
  const [step, setStep] = useState(0);
  const [theme, setTheme] = useState<AppSettings["theme"]>("system");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([
    {
      id: "workspace-student",
      name: "Student",
      color: "#5b5bd6",
      folderName: "Student",
      sortOrder: 0,
      kind: "student",
      createdAt: new Date().toISOString(),
    },
    {
      id: "workspace-personal",
      name: "Personal",
      color: "#168a68",
      folderName: "Personal",
      sortOrder: 1,
      kind: "personal",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [sample, setSample] = useState(true);
  const [vaultPath, setVaultPath] = useState("Documents\\Diorna");
  const [importSource, setImportSource] = useState<{
    kind: "obsidian" | "notion";
    path: string;
  }>();
  const [finishing, setFinishing] = useState(false);
  const complete = async () => {
    setFinishing(true);
    try {
      const vault = await initialiseNativeVault(
        vaultPath === "Documents\\Diorna" ? undefined : vaultPath,
      );
      updateSettings({ vaultLocation: vault?.path ?? vaultPath });
      await finish(workspaces, theme, sample);
      if (importSource) {
        const report = await importNativeFolder(
          importSource.kind,
          importSource.path,
          workspaces[0]!.id,
        );
        if (report)
          window.alert(
            `Imported ${report.imported} files${report.skipped ? `; skipped ${report.skipped}` : ""}.${report.warnings.length ? `\n${report.warnings.join("\n")}` : ""}`,
          );
      }
    } catch (error) {
      window.alert(`Unable to prepare the vault: ${String(error)}`);
      setFinishing(false);
    }
  };
  const steps = [
    <section key="vault">
      <Database size={28} />
      <span className="eyebrow">Step 1 of 4</span>
      <h1>Choose your vault</h1>
      <p>Diorna stores everything as files you own. The default is a Diorna folder in Documents.</p>
      <label>
        Vault location
        <input value={vaultPath} readOnly />
      </label>
      <button
        className="button"
        onClick={() => void chooseVaultFolder().then((path) => path && setVaultPath(path))}
      >
        Choose another folder…
      </button>
    </section>,
    <section key="theme">
      <Palette size={28} />
      <span className="eyebrow">Step 2 of 4</span>
      <h1>Make it comfortable</h1>
      <p>You can change this any time in Appearance.</p>
      <div className="choice-grid">
        {(["light", "dark", "system"] as const).map((value) => (
          <button
            key={value}
            className={`choice ${theme === value ? "selected" : ""}`}
            onClick={() => setTheme(value)}
          >
            {value === "light" ? <Sun /> : value === "dark" ? <Moon /> : <Palette />}
            <strong>{value[0]!.toUpperCase() + value.slice(1)}</strong>
            {theme === value && <Check size={16} />}
          </button>
        ))}
      </div>
    </section>,
    <section key="workspaces">
      <Users size={28} />
      <span className="eyebrow">Step 3 of 4</span>
      <h1>Separate your worlds</h1>
      <p>Workspaces never leak data into one another. Keep one, rename them, or build your own.</p>
      <div className="onboarding-workspaces">
        {workspaces.map((workspace, index) => (
          <div className="onboarding-workspace" key={workspace.id}>
            <input
              type="color"
              aria-label={`${workspace.name} workspace color`}
              value={workspace.color}
              onChange={(event) =>
                setWorkspaces((current) =>
                  current.map((entry) =>
                    entry.id === workspace.id ? { ...entry, color: event.target.value } : entry,
                  ),
                )
              }
            />
            <label>
              <span>Name</span>
              <input
                aria-label={
                  workspace.id === "workspace-student"
                    ? "Study workspace"
                    : workspace.id === "workspace-personal"
                      ? "Personal workspace"
                      : `Workspace ${index + 1} name`
                }
                value={workspace.name}
                onChange={(event) =>
                  setWorkspaces((current) =>
                    current.map((entry) =>
                      entry.id === workspace.id ? { ...entry, name: event.target.value } : entry,
                    ),
                  )
                }
              />
            </label>
            <label>
              <span>Type</span>
              <select
                aria-label={`${workspace.name} workspace type`}
                value={workspace.kind}
                onChange={(event) =>
                  setWorkspaces((current) =>
                    current.map((entry) =>
                      entry.id === workspace.id
                        ? { ...entry, kind: event.target.value as Workspace["kind"] }
                        : entry,
                    ),
                  )
                }
              >
                <option value="student">Study</option>
                <option value="personal">Personal</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <button
              className="icon-button danger"
              aria-label={`Remove ${workspace.name} workspace`}
              disabled={workspaces.length === 1}
              onClick={() => {
                setWorkspaces((current) => current.filter((entry) => entry.id !== workspace.id));
                if (workspace.id === "workspace-student") setSample(false);
              }}
            >
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
      <button
        className="button icon-text"
        onClick={() => {
          const index = workspaces.length + 1;
          const name = `Workspace ${index}`;
          setWorkspaces((current) => [
            ...current,
            {
              id: createId("workspace"),
              name,
              color: "#657287",
              folderName: name,
              sortOrder: current.length,
              kind: "custom",
              createdAt: new Date().toISOString(),
            },
          ]);
        }}
      >
        <Plus /> Add workspace
      </button>
    </section>,
    <section key="import">
      <Upload size={28} />
      <span className="eyebrow">Step 4 of 4</span>
      <h1>Ready when you are</h1>
      <p>You can import an Obsidian or Notion export now or later.</p>
      <div className="button-row">
        {(["obsidian", "notion"] as const).map((kind) => (
          <button
            className="button"
            key={kind}
            onClick={() =>
              void chooseDirectory(
                `Choose ${kind === "obsidian" ? "an Obsidian vault" : "a Notion export"}`,
              ).then((path) => path && setImportSource({ kind, path }))
            }
          >
            Import {kind === "obsidian" ? "Obsidian" : "Notion"}…
          </button>
        ))}
      </div>
      {importSource && <small>Ready to import: {importSource.path}</small>}
      <label className="check-row">
        <input
          type="checkbox"
          checked={sample}
          onChange={(event) => setSample(event.target.checked)}
        />{" "}
        Load an example workspace with the Gym map and a week of activity
      </label>
    </section>,
  ];
  return (
    <main className="onboarding">
      <div className="onboarding-brand">
        <div className="brand-mark">D</div>
        <strong>Diorna</strong>
        <p>Your daily register.</p>
      </div>
      <div className="onboarding-card">
        {steps[step]}
        <footer>
          <div className="step-dots">
            {steps.map((_, index) => (
              <i key={index} className={index === step ? "active" : ""} />
            ))}
          </div>
          <div className="button-row">
            {step > 0 && (
              <button className="button icon-text" onClick={() => setStep(step - 1)}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <button
              className="button primary icon-text"
              disabled={finishing}
              onClick={() => (step === 3 ? void complete() : setStep(step + 1))}
            >
              {step === 3 ? (finishing ? "Preparing…" : "Enter Diorna") : "Continue"}
              {step < 3 && <ChevronRight size={16} />}
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
