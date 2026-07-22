import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Onboarding } from "@/components/Onboarding";
import { useDiornaStore } from "@/core/store";
import {
  hideCurrentWindow,
  applyNativeShellSettings,
  initialiseNativeVault,
  persistNativeCanvas,
  persistNativeNote,
  persistNativeStructuredState,
  readNativeFileContent,
  readNativeKeymap,
  readNativeSettings,
  readNativeStructuredState,
  runNativeBackup,
  updateNativeTrayScore,
  logNativeError,
} from "@/core/native";
import { QuickCapture } from "@/components/QuickCapture";
import i18n, { installDomLocalization } from "@/i18n";
import { setDefaultOptions } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { generateDueAutomaticRecaps } from "@/modules/recap/automatic";
import { completionScore, dateKey } from "@/modules/daily/logic";
import { checkAndDownloadUpdate } from "@/core/updater";

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Diorna UI error", error, info);
    void logNativeError(`UI error: ${error.stack ?? error.message}\n${info.componentStack ?? ""}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const diagnostics = `${this.state.error.name}: ${this.state.error.message}\n${this.state.error.stack ?? ""}`;
    return (
      <main className="fatal-error">
        <div>
          <span className="eyebrow">Diorna recovered the window</span>
          <h1>Something went wrong</h1>
          <p>Your files are safe. Copy the diagnostics below when reporting this issue.</p>
          <pre>{diagnostics}</pre>
          <div className="button-row">
            <button className="button primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button className="button" onClick={() => navigator.clipboard.writeText(diagnostics)}>
              Copy diagnostics
            </button>
          </div>
        </div>
      </main>
    );
  }
}

export default function App() {
  const quickCaptureWindow = new URLSearchParams(window.location.search).has("quick-capture");
  const onboardingComplete = useDiornaStore((state) => state.onboardingComplete);
  const settings = useDiornaStore((state) => state.settings);
  const activeWorkspaceId = useDiornaStore((state) => state.activeWorkspaceId);
  const habits = useDiornaStore((state) => state.habits);
  const habitEntries = useDiornaStore((state) => state.habitEntries);
  const [systemDark, setSystemDark] = useState(matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => installDomLocalization(), []);
  useEffect(() => {
    const onError = (event: ErrorEvent) =>
      void logNativeError(`Unhandled error: ${event.error?.stack ?? event.message}`);
    const onRejection = (event: PromiseRejectionEvent) =>
      void logNativeError(`Unhandled promise rejection: ${String(event.reason)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(query.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.density = settings.density;
    document.documentElement.style.setProperty(
      "--accent",
      settings.accentColor === "system" ? "AccentColor" : settings.accentColor,
    );
    document.documentElement.style.setProperty("--font-ui", fontStack(settings.interfaceFont));
    document.documentElement.style.setProperty("--font-editor", fontStack(settings.editorFont));
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${settings.editorFontSize}px`,
    );
    document.documentElement.style.setProperty(
      "--editor-line-width",
      `${settings.editorLineWidth}px`,
    );
  }, [
    dark,
    settings.accentColor,
    settings.density,
    settings.editorFont,
    settings.editorFontSize,
    settings.editorLineWidth,
    settings.interfaceFont,
  ]);
  useEffect(() => {
    if (!onboardingComplete || !settings.updateEnabled) return;
    const timer = window.setTimeout(
      () => void checkAndDownloadUpdate(false, settings.updateChannel),
      4_000,
    );
    return () => window.clearTimeout(timer);
  }, [onboardingComplete, settings.updateChannel, settings.updateEnabled]);
  useEffect(() => {
    void i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
    setDefaultOptions({
      locale: settings.language === "fr" ? fr : enUS,
      weekStartsOn: settings.language === "fr" ? 1 : settings.weekStartsOn,
    });
  }, [settings.language, settings.weekStartsOn]);
  useEffect(() => {
    void applyNativeShellSettings(settings).catch((error: unknown) => {
      console.warn("Unable to apply native shell settings", error);
      window.dispatchEvent(
        new CustomEvent("diorna-toast", { detail: `Windows integration: ${String(error)}` }),
      );
    });
  }, [settings]);
  useEffect(() => {
    const workspaceHabits = habits.filter(
      (habit) => habit.workspaceId === activeWorkspaceId && !habit.archived,
    );
    const workspaceEntries = habitEntries.filter(
      (entry) => entry.workspaceId === activeWorkspaceId,
    );
    void updateNativeTrayScore(
      completionScore(workspaceHabits, workspaceEntries, dateKey(new Date())),
    ).catch((error: unknown) => console.warn("Unable to update tray score", error));
  }, [activeWorkspaceId, habitEntries, habits]);
  useEffect(() => {
    if (!onboardingComplete || sessionStorage.getItem("diorna-backup-checked") === "yes") return;
    sessionStorage.setItem("diorna-backup-checked", "yes");
    const last = localStorage.getItem("diorna-last-backup");
    const elapsed = last ? Date.now() - new Date(last).getTime() : Number.POSITIVE_INFINITY;
    const due =
      settings.backupFrequency === "launch" ||
      (settings.backupFrequency === "daily" && elapsed >= 86_400_000) ||
      (settings.backupFrequency === "weekly" && elapsed >= 7 * 86_400_000);
    if (!due) return;
    void runNativeBackup(settings.backupLocation, settings.backupRetention)
      .then(() => localStorage.setItem("diorna-last-backup", new Date().toISOString()))
      .catch((error: unknown) => console.warn("Automatic backup failed", error));
  }, [
    onboardingComplete,
    settings.backupFrequency,
    settings.backupLocation,
    settings.backupRetention,
  ]);
  useEffect(() => {
    void initialiseNativeVault()
      .then(async () => {
        const nativeSettings = await readNativeSettings();
        if (nativeSettings) useDiornaStore.getState().updateSettings(nativeSettings);
        const loaded = await readNativeStructuredState();
        const files = await readNativeFileContent();
        if (loaded?.initialized) {
          useDiornaStore.getState().hydrateStructured(loaded.snapshot);
          if (files) useDiornaStore.getState().hydrateFileContent(files);
        } else {
          const state = useDiornaStore.getState();
          if (state.onboardingComplete) {
            await Promise.all([
              ...state.notes.map(persistNativeNote),
              ...state.maps.map(persistNativeCanvas),
            ]);
            await persistNativeStructuredState(structuredSnapshot(state));
          }
        }
        const ready = useDiornaStore.getState();
        ready.purgeExpiredTrash();
        if (
          ready.settings.defaultWorkspaceId &&
          ready.workspaces.some((workspace) => workspace.id === ready.settings.defaultWorkspaceId)
        ) {
          ready.setWorkspace(ready.settings.defaultWorkspaceId);
        }
        if (useDiornaStore.getState().onboardingComplete) await generateDueAutomaticRecaps();
      })
      .catch((error: unknown) => console.error("Unable to initialise the native vault", error));
  }, []);
  useEffect(() => {
    let timer = 0;
    const unsubscribe = useDiornaStore.subscribe((state, previous) => {
      if (
        state.workspaces === previous.workspaces &&
        state.categories === previous.categories &&
        state.courses === previous.courses &&
        state.templates === previous.templates &&
        state.flashcards === previous.flashcards &&
        state.reviewLogs === previous.reviewLogs &&
        state.references === previous.references &&
        state.items === previous.items &&
        state.habits === previous.habits &&
        state.habitEntries === previous.habitEntries &&
        state.metrics === previous.metrics &&
        state.metricEntries === previous.metricEntries &&
        state.recaps === previous.recaps
      )
        return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void persistNativeStructuredState(structuredSnapshot(state)).catch((error: unknown) =>
          console.error("Unable to persist structured state", error),
        );
      }, 500);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    let lastDiskValue = "";
    let lastKeymapValue = "";
    const syncExternalSettings = async () => {
      try {
        const disk = await readNativeSettings();
        if (!disk) return;
        const serialized = JSON.stringify(disk);
        if (lastDiskValue && serialized !== lastDiskValue) {
          const current = useDiornaStore.getState().settings;
          if (JSON.stringify({ ...current, ...disk }) !== JSON.stringify(current)) {
            useDiornaStore.getState().updateSettings(disk);
          }
        }
        lastDiskValue = serialized;
        const keymap = await readNativeKeymap();
        if (keymap) {
          const keymapSerialized = JSON.stringify(keymap);
          if (lastKeymapValue && keymapSerialized !== lastKeymapValue) {
            useDiornaStore.getState().updateSettings({ keymap });
          }
          lastKeymapValue = keymapSerialized;
        }
      } catch (error) {
        console.warn("Unable to hot-reload settings.json", error);
      }
    };
    const timer = window.setInterval(() => void syncExternalSettings(), 2_000);
    return () => window.clearInterval(timer);
  }, []);
  if (quickCaptureWindow) {
    return <QuickCapture onClose={() => void hideCurrentWindow()} />;
  }
  return <ErrorBoundary>{onboardingComplete ? <AppShell /> : <Onboarding />}</ErrorBoundary>;
}

function fontStack(font: string): string {
  const stacks: Record<string, string> = {
    "system-ui": 'ui-sans-serif, "Segoe UI Variable", "Segoe UI", sans-serif',
    Inter: 'Inter, ui-sans-serif, "Segoe UI", sans-serif',
    Charter: "Charter, Georgia, serif",
    Georgia: "Georgia, serif",
    "Cascadia Code": '"Cascadia Code", Consolas, monospace',
  };
  return stacks[font] ?? stacks["system-ui"]!;
}

function structuredSnapshot(state: ReturnType<typeof useDiornaStore.getState>) {
  return {
    workspaces: state.workspaces,
    categories: state.categories,
    courses: state.courses,
    templates: state.templates,
    flashcards: state.flashcards,
    reviewLogs: state.reviewLogs,
    references: state.references,
    items: state.items,
    habits: state.habits,
    habitEntries: state.habitEntries,
    metrics: state.metrics,
    metricEntries: state.metricEntries,
    recaps: state.recaps,
  };
}
