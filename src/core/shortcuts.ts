export function matchesShortcut(event: KeyboardEvent, binding: string | undefined): boolean {
  if (!binding?.trim()) return false;
  const parts = binding
    .split("+")
    .map((part) => part.trim().toLocaleLowerCase())
    .filter(Boolean);
  const key = parts.at(-1);
  if (!key) return false;
  const expectsCtrl = parts.includes("ctrl") || parts.includes("control");
  const expectsAlt = parts.includes("alt");
  const expectsShift = parts.includes("shift");
  const expectsMeta = parts.includes("meta") || parts.includes("win") || parts.includes("cmd");
  if (
    event.ctrlKey !== expectsCtrl ||
    event.altKey !== expectsAlt ||
    event.shiftKey !== expectsShift ||
    event.metaKey !== expectsMeta
  )
    return false;
  const actual = normalizeKey(event.key);
  return actual === normalizeKey(key);
}

function normalizeKey(key: string): string {
  const normalized = key.toLocaleLowerCase();
  const aliases: Record<string, string> = {
    " ": "space",
    spacebar: "space",
    esc: "escape",
    del: "delete",
    return: "enter",
  };
  return aliases[normalized] ?? normalized;
}
