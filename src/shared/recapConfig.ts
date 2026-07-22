export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1";
export const OPENROUTER_MODEL = "moonshotai/kimi-k2.6";

export function recapSecretId(endpoint: string): string {
  try {
    const hostname = new URL(endpoint).hostname.toLocaleLowerCase();
    const normalized = hostname.replace(/[^a-z0-9_-]/g, "_");
    return normalized || "remote";
  } catch {
    return "remote";
  }
}
