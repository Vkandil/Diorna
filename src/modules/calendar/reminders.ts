import { isTauri } from "@/core/native";
import type { CalendarItem } from "@/shared/models";

const scheduled = new Map<string, number>();

export function scheduleNativeReminders(items: CalendarItem[]): () => void {
  if (!isTauri()) return () => undefined;
  const now = Date.now();
  for (const item of items) {
    if (item.completedAt) continue;
    const at = item.startAt ?? item.dueAt;
    if (!at) continue;
    for (const lead of item.reminders) {
      const fireAt = new Date(at).getTime() - lead * 60_000;
      const delay = fireAt - now;
      const key = `${item.id}:${fireAt}`;
      if (delay <= 0 || delay > 2_147_000_000 || scheduled.has(key)) continue;
      scheduled.set(
        key,
        window.setTimeout(() => {
          void showReminder(item, lead);
          scheduled.delete(key);
        }, delay),
      );
    }
  }
  return () => {
    for (const timer of scheduled.values()) window.clearTimeout(timer);
    scheduled.clear();
  };
}

async function showReminder(item: CalendarItem, lead: number): Promise<void> {
  const { isPermissionGranted, requestPermission, sendNotification } = await import(
    "@tauri-apps/plugin-notification"
  );
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted)
    sendNotification({
      title: item.title,
      body: lead
        ? `Starts in ${lead} minutes`
        : item.kind === "task"
          ? "Task is due now"
          : "Starts now",
    });
}
