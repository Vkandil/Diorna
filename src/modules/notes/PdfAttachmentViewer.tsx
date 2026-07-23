import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  MessageSquareQuote,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

interface PdfAttachmentViewerProps {
  src: string;
  relativePath: string;
  title: string;
  editor: Editor;
  getPos: () => number | undefined;
  nodeSize: number;
}

export function PdfAttachmentViewer({
  src,
  relativePath,
  title,
  editor,
  getPos,
  nodeSize,
}: PdfAttachmentViewerProps) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageText, setPageText] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let loaded: PDFDocumentProxy | undefined;
    let loadingTask: { destroy: () => Promise<void> } | undefined;
    const load = async () => {
      try {
        const [pdfjs, worker] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument({ url: src });
        loadingTask = task;
        loaded = await task.promise;
        if (!active) {
          await loaded.destroy();
          return;
        }
        setDocument(loaded);
        setPageNumber(1);
        setError("");
      } catch (caught) {
        if (active)
          setError(caught instanceof Error ? caught.message : "The PDF could not be opened.");
      }
    };
    void load();
    return () => {
      active = false;
      void loadingTask?.destroy();
      void loaded?.destroy();
    };
  }, [src]);

  useEffect(() => {
    if (!document) return;
    let active = true;
    let renderTask: { cancel: () => void; promise: Promise<void> } | undefined;
    const render = async () => {
      const page = await document.getPage(pageNumber);
      if (!active) return;
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = page.getViewport({ scale: zoom * density });
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      renderTask = page.render({ canvas, viewport: renderViewport });
      const textContent = await page.getTextContent();
      if (active)
        setPageText(
          textContent.items
            .map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : ""))
            .join("")
            .replace(/[ \t]+\n/g, "\n")
            .trim(),
        );
      await renderTask.promise;
    };
    setSelectedText("");
    void render().catch((caught: unknown) => {
      if (active && (caught as Error).name !== "RenderingCancelledException")
        setError(caught instanceof Error ? caught.message : "The PDF page could not be rendered.");
    });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber, zoom]);

  useEffect(() => {
    const openPage = (event: Event) => {
      const detail = (event as CustomEvent<{ relativePath: string; page: number }>).detail;
      if (detail.relativePath !== (relativePath || title)) return;
      setPageNumber(Math.max(1, Math.min(document?.numPages ?? detail.page, detail.page)));
      readerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    window.addEventListener("diorna-open-pdf-page", openPage);
    return () => window.removeEventListener("diorna-open-pdf-page", openPage);
  }, [document?.numPages, relativePath, title]);

  const captureSelection = () => {
    const selection = window.getSelection();
    const selected = selection?.toString().trim() ?? "";
    const anchor = selection?.anchorNode;
    if (selected && anchor && textRef.current?.contains(anchor)) setSelectedText(selected);
    else setSelectedText("");
  };

  const quoteSelection = () => {
    const text = selectedText.trim();
    const position = getPos();
    if (!text || position === undefined) return;
    const href = `diorna-pdf:${encodeURIComponent(relativePath || title)}#page=${pageNumber}`;
    editor.commands.insertContentAt(position + nodeSize, [
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `${title}, page ${pageNumber}`,
            marks: [{ type: "link", attrs: { href, target: null, rel: "noopener noreferrer" } }],
          },
        ],
      },
    ]);
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="pdf-reader" contentEditable={false} ref={readerRef}>
      <header className="pdf-reader-toolbar">
        <button
          type="button"
          aria-label="Previous PDF page"
          disabled={!document || pageNumber <= 1}
          onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
        >
          <ChevronLeft />
        </button>
        <label>
          Page
          <input
            aria-label="PDF page number"
            type="number"
            min={1}
            max={document?.numPages ?? 1}
            value={pageNumber}
            disabled={!document}
            onChange={(event) =>
              setPageNumber(
                Math.max(1, Math.min(document?.numPages ?? 1, Number(event.target.value) || 1)),
              )
            }
          />
          <span>/ {document?.numPages ?? "…"}</span>
        </label>
        <button
          type="button"
          aria-label="Next PDF page"
          disabled={!document || pageNumber >= document.numPages}
          onClick={() =>
            setPageNumber((current) => Math.min(document?.numPages ?? current, current + 1))
          }
        >
          <ChevronRight />
        </button>
        <i />
        <button
          type="button"
          aria-label="Zoom PDF out"
          disabled={zoom <= 0.6}
          onClick={() => setZoom((current) => Math.max(0.6, current - 0.2))}
        >
          <ZoomOut />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom PDF in"
          disabled={zoom >= 2.4}
          onClick={() => setZoom((current) => Math.min(2.4, current + 0.2))}
        >
          <ZoomIn />
        </button>
      </header>
      {error ? (
        <div className="pdf-reader-error" role="alert">
          <strong>Unable to display this PDF</strong>
          <span>{error}</span>
          <a href={src} target="_blank" rel="noopener noreferrer">
            Open the original file
          </a>
        </div>
      ) : !document ? (
        <div className="pdf-reader-loading" role="status">
          <LoaderCircle className="spin" />
          Loading PDF…
        </div>
      ) : (
        <div className="pdf-reader-workspace">
          <aside aria-label="PDF page thumbnails">
            {Array.from({ length: document.numPages }, (_, index) => index + 1).map((page) => (
              <PdfThumbnail
                document={document}
                pageNumber={page}
                active={page === pageNumber}
                onSelect={() => setPageNumber(page)}
                key={page}
              />
            ))}
          </aside>
          <section className="pdf-page-stage">
            <canvas ref={canvasRef} aria-label={`${title}, page ${pageNumber}`} />
          </section>
          <section className="pdf-text-panel">
            <header>
              <strong>Selectable text · page {pageNumber}</strong>
              <small>Select a passage to quote it into the note.</small>
            </header>
            <div
              ref={textRef}
              className="pdf-text-layer"
              aria-label={`Selectable text from page ${pageNumber}`}
              onMouseUp={captureSelection}
              onKeyUp={captureSelection}
              tabIndex={0}
            >
              {pageText || "No selectable text was found on this page."}
            </div>
            {selectedText && (
              <button type="button" className="button primary" onClick={quoteSelection}>
                <MessageSquareQuote />
                Quote into note
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function PdfThumbnail({
  document,
  pageNumber,
  active,
  onSelect,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    let renderTask: { cancel: () => void; promise: Promise<void> } | undefined;
    void document.getPage(pageNumber).then((page) => {
      if (!live || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 0.16 });
      const canvas = canvasRef.current;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      renderTask = page.render({ canvas, viewport });
      return renderTask.promise;
    });
    return () => {
      live = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber]);
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      aria-label={`Open PDF page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
    >
      <canvas ref={canvasRef} />
      <span>{pageNumber}</span>
    </button>
  );
}
