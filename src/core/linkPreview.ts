import { fetchNativeLinkPreview, isTauri } from "@/core/native";

const cacheKey = "diorna-link-previews-v1";
const memoryCache = new Map<string, LinkPreviewData>();

export interface LinkPreviewData {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  siteName: string;
  imageUrl: string;
  imageRelativePath: string;
  faviconUrl: string;
  faviconRelativePath: string;
  fetchedAt: string;
}

export function normalizeExternalUrl(value: string): string | undefined {
  const candidate = value.trim();
  if (!candidate) return undefined;
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol) || !isPublicHostname(url.hostname))
      return undefined;
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

export function isStandaloneUrl(value: string): boolean {
  return Boolean(normalizeExternalUrl(value)) && !/\s/.test(value.trim());
}

export function parseLinkPreviewHtml(
  html: string,
  requestedUrl: string,
  finalUrl = requestedUrl,
): LinkPreviewData {
  const document = new DOMParser().parseFromString(html.slice(0, 500_000), "text/html");
  const meta = (key: string) =>
    [...document.querySelectorAll<HTMLMetaElement>("meta")]
      .find(
        (element) =>
          (element.getAttribute("property") ?? element.getAttribute("name") ?? "")
            .trim()
            .toLocaleLowerCase() === key,
      )
      ?.content.trim() ?? "";
  const resolve = (value: string) => {
    try {
      if (!value) return "";
      return normalizeExternalUrl(new URL(value, finalUrl).href) ?? "";
    } catch {
      return "";
    }
  };
  const favicon =
    [...document.querySelectorAll<HTMLLinkElement>("link[rel]")]
      .find((element) =>
        element.rel
          .toLocaleLowerCase()
          .split(/\s+/)
          .some((entry) => entry === "icon" || entry === "shortcut"),
      )
      ?.getAttribute("href") ?? "";
  const host = safeHost(finalUrl);
  return {
    url: requestedUrl,
    finalUrl,
    title: truncate(
      meta("og:title") || meta("twitter:title") || document.title.trim() || host,
      160,
    ),
    description: truncate(
      meta("og:description") || meta("twitter:description") || meta("description"),
      400,
    ),
    siteName: truncate(meta("og:site_name") || host, 100),
    imageUrl: resolve(meta("og:image") || meta("twitter:image")),
    imageRelativePath: "",
    faviconUrl: resolve(favicon),
    faviconRelativePath: "",
    fetchedAt: new Date().toISOString(),
  };
}

export async function loadLinkPreview(
  value: string,
  workspaceId: string,
  force = false,
): Promise<LinkPreviewData> {
  const url = normalizeExternalUrl(value);
  if (!url) throw new Error("Enter a public http:// or https:// URL.");
  if (!force) {
    const cached = memoryCache.get(url) ?? readCache()[url];
    if (cached) {
      memoryCache.set(url, cached);
      return cached;
    }
  }
  let preview: LinkPreviewData;
  if (isTauri()) {
    preview = await fetchNativeLinkPreview(url, workspaceId);
  } else {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`The website returned ${response.status}.`);
      const contentType = response.headers.get("content-type")?.toLocaleLowerCase() ?? "";
      if (contentType && !contentType.includes("text/html") && !contentType.includes("xhtml"))
        throw new Error("This URL does not point to an HTML page.");
      preview = parseLinkPreviewHtml(await response.text(), url, response.url || url);
    } finally {
      window.clearTimeout(timer);
    }
  }
  memoryCache.set(url, preview);
  writeCache(url, preview);
  return preview;
}

export function fallbackLinkPreview(value: string): LinkPreviewData {
  const url = normalizeExternalUrl(value) ?? value.trim();
  return {
    url,
    finalUrl: url,
    title: safeHost(url) || "External link",
    description: "",
    siteName: safeHost(url),
    imageUrl: "",
    imageRelativePath: "",
    faviconUrl: "",
    faviconRelativePath: "",
    fetchedAt: "",
  };
}

export function safeHost(value: string): string {
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLocaleLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1"
  )
    return false;
  if (host.includes(":")) {
    const compact = host.replace(/^0+/, "");
    return !(
      compact.startsWith("fc") ||
      compact.startsWith("fd") ||
      /^fe[89ab]/.test(compact) ||
      compact.startsWith("ff") ||
      compact.startsWith("2001:db8:")
    );
  }
  const ipv4 = host.split(".").map(Number);
  if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [a = 0, b = 0] = ipv4;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function truncate(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1).trimEnd()}…` : normalized;
}

function readCache(): Record<string, LinkPreviewData> {
  try {
    return JSON.parse(localStorage.getItem(cacheKey) ?? "{}") as Record<string, LinkPreviewData>;
  } catch {
    return {};
  }
}

function writeCache(url: string, preview: LinkPreviewData) {
  try {
    const values = { ...readCache(), [url]: preview };
    const entries = Object.entries(values)
      .sort(
        ([, left], [, right]) =>
          Date.parse(right.fetchedAt || "1970-01-01") - Date.parse(left.fetchedAt || "1970-01-01"),
      )
      .slice(0, 100);
    localStorage.setItem(cacheKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // A full or unavailable browser cache must never prevent inserting the link.
  }
}
