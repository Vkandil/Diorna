import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Onboarding } from "@/components/Onboarding";
import { useDiornaStore } from "@/core/store";
import { hideCurrentWindow, initialiseNativeVault, readNativeSettings } from "@/core/native";
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
      })
      .catch((error: unknown) => console.error("Unable to initialise the native vault", error));
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
