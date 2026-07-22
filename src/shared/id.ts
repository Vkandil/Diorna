export function createId(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
