import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Onboarding } from "@/components/Onboarding";
import { useDiornaStore } from "@/core/store";
import {
  hideCurrentWindow,
  initialiseNativeVault,
  persistNativeCanvas,
  persistNativeNote,
  persistNativeStructuredState,
  readNativeFileContent,
  readNativeSettings,
  readNativeStructuredState,
} from "@/core/native";
import { QuickCapture } from "@/components/QuickCapture";
import i18n from "@/i18n";

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Diorna UI error", error, info);
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
  const [systemDark, setSystemDark] = useState(matchMedia("(prefers-color-scheme: dark)").matches);
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
    document.documentElement.style.setProperty("--accent", settings.accentColor);
  }, [dark, settings.accentColor, settings.density]);
  useEffect(() => {
    void i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
  }, [settings.language]);
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
