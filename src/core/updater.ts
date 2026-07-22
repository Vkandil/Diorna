import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./native";

export type UpdateState =
  | { status: "checking" }
  | { status: "current" }
  | { status: "downloading"; version: string; progress: number | null }
  | { status: "ready"; version: string; notes?: string }
  | { status: "error"; message: string };

let pendingUpdate: import("@tauri-apps/plugin-updater").Update | undefined;
let activeCheck: Promise<UpdateState> | undefined;

function announce(detail: UpdateState): UpdateState {
  window.dispatchEvent(new CustomEvent<UpdateState>("diorna-update-state", { detail }));
  return detail;
}

export async function isPortableBuild(): Promise<boolean> {
  if (!isTauri()) return false;
  const info = await invoke<{ portable: boolean }>("runtime_info");
  return info.portable;
}

export async function checkAndDownloadUpdate(
  manual = false,
  channel: "stable" | "beta" = "stable",
): Promise<UpdateState> {
  if (!isTauri()) return announce({ status: "current" });
  if (activeCheck) return activeCheck;
  activeCheck = (async () => {
    try {
      if (await isPortableBuild()) {
        return announce({
          status: "error",
          message: "Portable builds are updated by replacing the application folder.",
        });
      }
      announce({ status: "checking" });
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check({ timeout: 15_000, target: channel });
      if (!update) return announce({ status: "current" });
      pendingUpdate = update;
      let downloaded = 0;
      let total: number | undefined;
      await update.download((event) => {
        if (event.event === "Started") total = event.data.contentLength;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        if (event.event !== "Finished") {
          announce({
            status: "downloading",
            version: update.version,
            progress: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
          });
        }
      });
      return announce({
        status: "ready",
        version: update.version,
        ...(update.body ? { notes: update.body } : {}),
      });
    } catch (error) {
      const message = String(error);
      if (!manual) console.warn("Background update check failed", error);
      return announce({ status: "error", message });
    } finally {
      activeCheck = undefined;
    }
  })();
  return activeCheck;
}

export async function installDownloadedUpdate(): Promise<void> {
  if (!pendingUpdate) throw new Error("No downloaded update is ready");
  await pendingUpdate.install();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
