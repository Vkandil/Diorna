import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Moon,
  Palette,
  Sun,
  Upload,
  Users,
} from "lucide-react";
import { useDiornaStore } from "@/core/store";
import type { AppSettings } from "@/shared/models";
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
  const [studentName, setStudentName] = useState("Student");
  const [personalName, setPersonalName] = useState("Personal");
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
      finish(studentName || "Student", personalName || "Personal", theme, sample);
      if (importSource) {
        const report = await importNativeFolder(
          importSource.kind,
          importSource.path,
          "workspace-student",
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
      <p>Workspaces never leak data into one another.</p>
      <label>
        Study workspace
        <input value={studentName} onChange={(event) => setStudentName(event.target.value)} />
      </label>
      <label>
        Personal workspace
        <input value={personalName} onChange={(event) => setPersonalName(event.target.value)} />
      </label>
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
