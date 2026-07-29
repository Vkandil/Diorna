import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStandaloneUrl,
  loadLinkPreview,
  normalizeExternalUrl,
  parseLinkPreviewHtml,
} from "@/core/linkPreview";

describe("rich link previews", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("normalizes public web addresses and rejects local or private targets", () => {
    expect(normalizeExternalUrl("example.com/story#details")).toBe("https://example.com/story");
    expect(isStandaloneUrl("https://example.com/story")).toBe(true);
    expect(isStandaloneUrl("read https://example.com")).toBe(false);
    expect(normalizeExternalUrl("file:///C:/secret.txt")).toBeUndefined();
    expect(normalizeExternalUrl("http://localhost:3000")).toBeUndefined();
    expect(normalizeExternalUrl("http://192.168.1.5")).toBeUndefined();
    expect(normalizeExternalUrl("http://[fd00::1]")).toBeUndefined();
    expect(normalizeExternalUrl("http://[fe80::1]")).toBeUndefined();
  });

  it("prefers Open Graph metadata and resolves public relative assets", () => {
    const preview = parseLinkPreviewHtml(
      `
        <html>
          <head>
            <title>Fallback title</title>
            <meta property="og:title" content="A useful article">
            <meta property="og:description" content="A concise description of the article.">
            <meta property="og:site_name" content="Example Journal">
            <meta property="og:image" content="/media/cover.jpg">
            <link rel="shortcut icon" href="/favicon.ico">
          </head>
        </html>
      `,
      "https://example.com/story",
      "https://www.example.com/story",
    );

    expect(preview).toMatchObject({
      title: "A useful article",
      description: "A concise description of the article.",
      siteName: "Example Journal",
      imageUrl: "https://www.example.com/media/cover.jpg",
      faviconUrl: "https://www.example.com/favicon.ico",
    });
  });

  it("does not expose private image URLs supplied by a public page", () => {
    const preview = parseLinkPreviewHtml(
      '<meta property="og:image" content="http://127.0.0.1/private.png">',
      "https://example.com",
    );
    expect(preview.imageUrl).toBe("");
  });

  it("fetches once and reuses the persisted preview cache", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        '<meta property="og:title" content="Cached title"><meta name="description" content="Cached description">',
        {
          headers: { "content-type": "text/html" },
        },
      ),
    );

    const first = await loadLinkPreview("https://cache-preview.example/article", "workspace");
    const second = await loadLinkPreview("https://cache-preview.example/article", "workspace");

    expect(first.title).toBe("Cached title");
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
