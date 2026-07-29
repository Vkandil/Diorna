import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import katex from "katex";
import mermaid from "mermaid";
import DOMPurify from "dompurify";
import { chooseAndImportNativeAttachment } from "@/core/native";
import { common, createLowlight } from "lowlight";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import sql from "highlight.js/lib/languages/sql";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import latex from "highlight.js/lib/languages/latex";
import {
  AlertCircle,
  Copy,
  ExternalLink,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  GripVertical,
  Layers3,
  Link2,
  RefreshCw,
  Type,
} from "lucide-react";
import "katex/dist/katex.min.css";
import { PdfAttachmentViewer } from "./PdfAttachmentViewer";
import { loadLinkPreview, safeHost, type LinkPreviewData } from "@/core/linkPreview";
import { openExternalUrl } from "@/core/native";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
});

const codeLowlight = createLowlight(common);
codeLowlight.register({ python, r, sql, javascript, typescript, bash, json, yaml, latex });

export const WikiLink = Node.create({
  name: "wikiLink",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-target") ?? element.textContent ?? "",
        renderHTML: (attributes) => ({ "data-target": attributes.target }),
      },
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label") ?? "",
        renderHTML: (attributes) => ({ "data-label": attributes.label }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const target = String(HTMLAttributes["data-target"] ?? "Untitled");
    const label = String(HTMLAttributes["data-label"] ?? "");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "wiki-link",
        class: "wiki-link",
        role: "link",
        title: `Open ${target}`,
      }),
      label || target,
    ];
  },
  renderText({ node }) {
    return String(node.attrs.label || node.attrs.target);
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/,
        type: this.type,
        getAttributes: (match) => ({ target: match[1]?.trim(), label: match[2]?.trim() ?? "" }),
      }),
    ];
  },
});

export const LinkPreviewBlock = Node.create({
  name: "linkPreviewBlock",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() {
    const dataAttribute = (name: string, fallback = "") => ({
      default: fallback,
      parseHTML: (element: HTMLElement) => element.getAttribute(`data-${name}`) ?? fallback,
      renderHTML: (attributes: Record<string, unknown>) => ({
        [`data-${name}`]: String(attributes[toCamelCase(name)] ?? fallback),
      }),
    });
    return {
      previewId: dataAttribute("preview-id"),
      workspaceId: dataAttribute("workspace-id"),
      url: dataAttribute("url"),
      finalUrl: dataAttribute("final-url"),
      title: dataAttribute("title"),
      description: dataAttribute("description"),
      siteName: dataAttribute("site-name"),
      imageUrl: dataAttribute("image-url"),
      imageRelativePath: dataAttribute("image-relative-path"),
      faviconUrl: dataAttribute("favicon-url"),
      faviconRelativePath: dataAttribute("favicon-relative-path"),
      fetchedAt: dataAttribute("fetched-at"),
      autoFetch: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-auto-fetch") !== "false",
        renderHTML: (attributes) => ({ "data-auto-fetch": String(attributes.autoFetch !== false) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-type="link-preview"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-type": "link-preview" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(LinkPreviewView);
  },
});

function LinkPreviewView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const url = String(node.attrs.url ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const dragHandle = useAttachmentPointerDrag({
    editor,
    getPos,
    title: String(node.attrs.title || safeHost(url) || "link"),
  });
  const apply = (preview: LinkPreviewData) =>
    updateAttributes({
      finalUrl: preview.finalUrl,
      title: preview.title,
      description: preview.description,
      siteName: preview.siteName,
      imageUrl: preview.imageUrl,
      imageRelativePath: preview.imageRelativePath,
      faviconUrl: preview.faviconUrl,
      faviconRelativePath: preview.faviconRelativePath,
      fetchedAt: preview.fetchedAt,
    });
  const refresh = (force = false) => {
    if (!url) return;
    setStatus("loading");
    setError("");
    void loadLinkPreview(url, String(node.attrs.workspaceId ?? ""), force)
      .then((preview) => {
        apply(preview);
        setStatus("idle");
      })
      .catch((value: unknown) => {
        setStatus("error");
        setError(value instanceof Error ? value.message : "Preview unavailable");
      });
  };
  useEffect(() => {
    if (!url || node.attrs.fetchedAt || node.attrs.autoFetch === false) return;
    refresh();
    // Fetch once when a new card is inserted; updates are explicit after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  const title = String(node.attrs.title || safeHost(url) || "External link");
  const target = String(node.attrs.finalUrl || url);
  const convertToText = () => {
    if (typeof getPos !== "function") return;
    const position = getPos();
    if (typeof position !== "number") return;
    const link = editor.schema.marks.link?.create({
      href: target,
      rel: "noopener noreferrer",
    });
    const paragraph = editor.schema.nodes.paragraph?.create(
      null,
      editor.schema.text(title, link ? [link] : undefined),
    );
    if (paragraph)
      editor.view.dispatch(
        editor.state.tr.replaceWith(position, position + node.nodeSize, paragraph).scrollIntoView(),
      );
  };
  return (
    <NodeViewWrapper
      as="figure"
      className={`attachment-node link-preview-node ${selected ? "selected" : ""}`}
      data-status={status}
    >
      <AttachmentDragHandle {...dragHandle} />
      {node.attrs.imageUrl ? (
        <img className="link-preview-image" src={String(node.attrs.imageUrl)} alt="" />
      ) : (
        <div className="link-preview-image placeholder" aria-hidden="true">
          <Link2 />
        </div>
      )}
      <div className="link-preview-copy">
        <small>
          {node.attrs.faviconUrl && <img src={String(node.attrs.faviconUrl)} alt="" />}
          {String(node.attrs.siteName || safeHost(target))}
        </small>
        <strong>{title}</strong>
        {node.attrs.description && <p>{String(node.attrs.description)}</p>}
        <span>{safeHost(target)}</span>
      </div>
      <div className="link-preview-actions" contentEditable={false}>
        <button
          type="button"
          title="Open link"
          aria-label={`Open ${title}`}
          onClick={() => void openExternalUrl(target)}
        >
          <ExternalLink />
        </button>
        <button
          type="button"
          title="Copy link"
          aria-label={`Copy ${title} link`}
          onClick={() => void navigator.clipboard.writeText(target)}
        >
          <Copy />
        </button>
        <button
          type="button"
          title="Refresh preview"
          aria-label={`Refresh ${title} preview`}
          disabled={status === "loading"}
          onClick={() => refresh(true)}
        >
          <RefreshCw className={status === "loading" ? "spin" : ""} />
        </button>
        <button
          type="button"
          title="Convert to text link"
          aria-label={`Convert ${title} to a text link`}
          onClick={convertToText}
        >
          <Type />
        </button>
      </div>
      {status === "loading" && (
        <span className="link-preview-status" role="status">
          Loading preview…
        </span>
      )}
      {status === "error" && (
        <button className="link-preview-status error" onClick={() => refresh(true)}>
          {error || "Preview unavailable"} · Retry
        </button>
      )}
    </NodeViewWrapper>
  );
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, character: string) => character.toUpperCase());
}

export const CodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: { default: "python" },
      lineNumbers: { default: true },
      wrap: { default: false },
      filename: { default: "" },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight: codeLowlight });

function CodeBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={`code-block-node ${selected ? "selected" : ""} ${node.attrs.lineNumbers ? "line-numbers" : ""} ${node.attrs.wrap ? "wrap" : ""}`}
    >
      <header contentEditable={false}>
        <input
          aria-label="Code filename"
          placeholder="filename"
          value={String(node.attrs.filename ?? "")}
          onChange={(event) => updateAttributes({ filename: event.target.value })}
        />
        <select
          aria-label="Code language"
          value={String(node.attrs.language ?? "python")}
          onChange={(event) => updateAttributes({ language: event.target.value })}
        >
          {["python", "r", "sql", "javascript", "typescript", "bash", "json", "yaml", "latex"].map(
            (language) => (
              <option value={language} key={language}>
                {language}
              </option>
            ),
          )}
        </select>
        <label>
          <input
            type="checkbox"
            checked={Boolean(node.attrs.lineNumbers)}
            onChange={(event) => updateAttributes({ lineNumbers: event.target.checked })}
          />
          Lines
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(node.attrs.wrap)}
            onChange={(event) => updateAttributes({ wrap: event.target.checked })}
          />
          Wrap
        </label>
        <button onClick={() => void navigator.clipboard.writeText(node.textContent)}>Copy</button>
      </header>
      <div className="code-block-body">
        {node.attrs.lineNumbers && (
          <span className="code-line-numbers" contentEditable={false} aria-hidden="true">
            {node.textContent.split("\n").map((_, index) => (
              <i key={index}>{index + 1}</i>
            ))}
          </span>
        )}
        <pre>
          <NodeViewContent as="code" />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      latex: { default: "E = mc^2" },
      number: { default: "" },
      label: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "math-block" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /\$\$([^$]+)\$\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },
});

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { latex: { default: "x" } };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "math-inline" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /(?<!\$)\$([^$\n]+)\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },
});

function MathInlineView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const latex = String(node.attrs.latex);
  let html = "";
  let error = "";
  try {
    html = katex.renderToString(resolveEditorReferences(latex, editor), {
      displayMode: false,
      throwOnError: true,
      trust: false,
    });
  } catch (value) {
    error = value instanceof Error ? value.message : "Invalid LaTeX";
    html = katex.renderToString(latex, { displayMode: false, throwOnError: false, trust: false });
  }
  return (
    <NodeViewWrapper
      as="span"
      className={`math-inline ${selected ? "selected" : ""} ${error ? "error" : ""}`}
      title={error || latex}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <input
          autoFocus
          value={latex}
          aria-label="Inline LaTeX"
          onChange={(event) => updateAttributes({ latex: event.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => event.key === "Enter" && setEditing(false)}
        />
      ) : (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  );
}

function MathBlockView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const latex = String(node.attrs.latex);
  const [editing, setEditing] = useState(false);
  const numbered = node.attrs.number === "auto";
  const position = typeof getPos === "function" ? getPos() : undefined;
  let equationNumber = "";
  if (numbered) {
    let count = 0;
    editor.state.doc.descendants((child, pos) => {
      if (
        child.type.name === "mathBlock" &&
        child.attrs.number === "auto" &&
        (typeof position !== "number" || pos <= position)
      )
        count += 1;
    });
    equationNumber = String(count);
  }
  let html = "";
  let error = "";
  try {
    html = katex.renderToString(resolveEditorReferences(latex, editor), {
      displayMode: true,
      throwOnError: true,
      trust: false,
    });
  } catch (value) {
    error = value instanceof Error ? value.message : "Invalid LaTeX";
    html = katex.renderToString(latex, {
      displayMode: true,
      throwOnError: false,
      trust: false,
    });
  }
  return (
    <NodeViewWrapper
      className={`math-node ${selected ? "selected" : ""} ${error ? "error" : ""}`}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <div className="math-editor-fields">
          <input
            autoFocus
            value={latex}
            aria-label="Display LaTeX"
            onChange={(event) => updateAttributes({ latex: event.target.value })}
            onKeyDown={(event) => event.key === "Enter" && setEditing(false)}
          />
          <label>
            <input
              type="checkbox"
              checked={numbered}
              onChange={(event) => updateAttributes({ number: event.target.checked ? "auto" : "" })}
            />
            Number equation
          </label>
          <input
            aria-label="Equation label"
            placeholder="Label for \\ref{label}"
            value={String(node.attrs.label)}
            onChange={(event) => updateAttributes({ label: event.target.value })}
          />
          <button className="button compact" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {error && (
        <small>
          <AlertCircle />
          {error}
        </small>
      )}
      {numbered && <span className="equation-number">({equationNumber})</span>}
    </NodeViewWrapper>
  );
}

function resolveEditorReferences(latex: string, editor: NodeViewProps["editor"]): string {
  const labels = new Map<string, number>();
  let number = 0;
  editor.state.doc.descendants((child) => {
    if (child.type.name !== "mathBlock" || child.attrs.number !== "auto") return;
    number += 1;
    const label = String(child.attrs.label ?? "").trim();
    if (label) labels.set(label, number);
  });
  return latex.replace(/\\ref\{([^}]+)\}/g, (_, label: string) =>
    String(labels.get(label) ?? "??"),
  );
}

export const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  content: "block+",
  draggable: true,
  addAttributes() {
    return { tone: { default: "info" }, icon: { default: "💡" } };
  },
  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ node }: NodeViewProps) => (
      <NodeViewWrapper as="aside" className={`callout-node ${node.attrs.tone}`}>
        <span contentEditable={false}>{node.attrs.icon}</span>
        <NodeViewContent className="callout-content" />
      </NodeViewWrapper>
    ));
  },
});

export const FlashcardBlock = Node.create({
  name: "flashcardBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { front: { default: "Question" }, back: { default: "Answer" } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="flashcard"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "flashcard" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ node, updateAttributes, selected }: NodeViewProps) => (
      <NodeViewWrapper className={`flashcard-node ${selected ? "selected" : ""}`}>
        <span contentEditable={false}>Flashcard</span>
        <textarea
          value={node.attrs.front}
          onChange={(event) => updateAttributes({ front: event.target.value })}
          aria-label="Flashcard front"
        />
        <textarea
          value={node.attrs.back}
          onChange={(event) => updateAttributes({ back: event.target.value })}
          aria-label="Flashcard back"
        />
      </NodeViewWrapper>
    ));
  },
});

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { code: { default: "graph LR\n  A[Idea] --> B[Result]" } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "mermaid" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MermaidView);
  },
});

function MermaidView({ node, updateAttributes, selected }: NodeViewProps) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void mermaid
      .render(`diorna-${id}`, String(node.attrs.code))
      .then(({ svg: next }) => {
        if (active) {
          setSvg(
            DOMPurify.sanitize(next, {
              USE_PROFILES: { svg: true, svgFilters: true },
            }),
          );
          setError("");
        }
      })
      .catch((value: unknown) => {
        if (active) setError(value instanceof Error ? value.message : "Diagram error");
      });
    return () => {
      active = false;
    };
  }, [id, node.attrs.code]);
  return (
    <NodeViewWrapper className={`mermaid-node ${selected ? "selected" : ""}`}>
      <textarea
        value={node.attrs.code}
        onChange={(event) => updateAttributes({ code: event.target.value })}
        aria-label="Mermaid source"
      />
      <div contentEditable={false} dangerouslySetInnerHTML={{ __html: svg }} />
      {error && (
        <small>
          <AlertCircle />
          {error}
        </small>
      )}
    </NodeViewWrapper>
  );
}

export const AttachmentBlock = Node.create({
  name: "attachmentBlock",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      kind: { default: "file" },
      src: { default: "" },
      relativePath: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-relative-path") ?? "",
        renderHTML: (attributes) => ({ "data-relative-path": attributes.relativePath }),
      },
      workspaceId: { default: "" },
      title: { default: "Untitled attachment" },
      size: { default: "" },
      caption: { default: "" },
      width: { default: 100 },
      align: { default: "center" },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-type="attachment"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-type": "attachment" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentView);
  },
});

function AttachmentView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const kind = String(node.attrs.kind);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const dragHandle = useAttachmentPointerDrag({ editor, getPos, title: String(node.attrs.title) });
  useEffect(() => {
    if (!lightboxOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [lightboxOpen]);
  const Icon =
    kind === "image"
      ? FileImage
      : kind === "video"
        ? FileVideo
        : kind === "audio"
          ? FileAudio
          : kind === "pdf"
            ? FileText
            : kind === "columns"
              ? Layers3
              : File;
  if (kind === "image" && node.attrs.src)
    return (
      <NodeViewWrapper
        as="figure"
        className={`attachment-node media image align-${node.attrs.align} ${selected ? "selected" : ""}`}
        style={{ width: `${node.attrs.width}%` }}
      >
        <AttachmentDragHandle {...dragHandle} />
        <button
          type="button"
          className="attachment-image-trigger"
          aria-label={`Open ${node.attrs.title} full screen`}
          contentEditable={false}
          onClick={(event) => {
            event.stopPropagation();
            setLightboxOpen(true);
          }}
        >
          <img
            src={node.attrs.src}
            alt={node.attrs.caption || node.attrs.title}
            draggable={false}
          />
        </button>
        {lightboxOpen &&
          createPortal(
            <div
              className="attachment-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={`${node.attrs.title} preview`}
              onClick={() => setLightboxOpen(false)}
            >
              <button
                type="button"
                className="icon-button"
                aria-label="Close image preview"
                onClick={() => setLightboxOpen(false)}
              >
                ×
              </button>
              <img
                src={node.attrs.src}
                alt={node.attrs.caption || node.attrs.title}
                onClick={(event) => event.stopPropagation()}
              />
              {(node.attrs.caption || node.attrs.title) && (
                <p>{node.attrs.caption || node.attrs.title}</p>
              )}
            </div>,
            document.body,
          )}
        {selected && (
          <AttachmentControls
            kind="Image"
            width={Number(node.attrs.width)}
            align={String(node.attrs.align)}
            updateAttributes={updateAttributes}
          />
        )}
        <AttachmentCaption value={String(node.attrs.caption)} updateAttributes={updateAttributes} />
      </NodeViewWrapper>
    );
  if (kind === "video" && node.attrs.src)
    return (
      <NodeViewWrapper
        as="figure"
        className={`attachment-node media video align-${node.attrs.align} ${selected ? "selected" : ""}`}
        style={{ width: `${node.attrs.width}%` }}
      >
        <AttachmentDragHandle {...dragHandle} />
        <video controls src={node.attrs.src} />
        {selected && (
          <AttachmentControls
            kind="Video"
            width={Number(node.attrs.width)}
            align={String(node.attrs.align)}
            updateAttributes={updateAttributes}
          />
        )}
        <AttachmentCaption value={String(node.attrs.caption)} updateAttributes={updateAttributes} />
      </NodeViewWrapper>
    );
  if (kind === "audio" && node.attrs.src)
    return (
      <NodeViewWrapper
        as="figure"
        className={`attachment-node media audio align-${node.attrs.align} ${selected ? "selected" : ""}`}
        style={{ width: `${node.attrs.width}%` }}
      >
        <AttachmentDragHandle {...dragHandle} />
        <audio controls src={node.attrs.src} />
        <AttachmentCaption value={String(node.attrs.caption)} updateAttributes={updateAttributes} />
      </NodeViewWrapper>
    );
  if (kind === "pdf" && node.attrs.src)
    return (
      <NodeViewWrapper
        as="figure"
        className={`attachment-node media pdf align-${node.attrs.align} ${selected ? "selected" : ""}`}
        style={{ width: `${node.attrs.width}%` }}
      >
        <AttachmentDragHandle {...dragHandle} />
        <PdfAttachmentViewer
          src={String(node.attrs.src)}
          relativePath={String(node.attrs.relativePath)}
          title={String(node.attrs.title)}
          editor={editor}
          getPos={() => (typeof getPos === "function" ? getPos() : undefined)}
          nodeSize={node.nodeSize}
        />
        {selected && (
          <AttachmentControls
            kind="PDF"
            width={Number(node.attrs.width)}
            align={String(node.attrs.align)}
            updateAttributes={updateAttributes}
          />
        )}
        <AttachmentCaption value={String(node.attrs.caption)} updateAttributes={updateAttributes} />
      </NodeViewWrapper>
    );
  return (
    <NodeViewWrapper className={`attachment-node placeholder ${selected ? "selected" : ""}`}>
      <AttachmentDragHandle {...dragHandle} />
      <Icon />
      <span>
        <strong>{node.attrs.title}</strong>
        <small>
          {kind}
          {node.attrs.size ? ` · ${node.attrs.size}` : ""}
        </small>
      </span>
      <button
        contentEditable={false}
        onClick={() =>
          void chooseAndImportNativeAttachment(String(node.attrs.workspaceId)).then(
            (attachment) =>
              attachment &&
              updateAttributes({
                src: attachment.displayUrl,
                relativePath: attachment.relativePath,
                title: attachment.name,
                size: humanFileSize(attachment.size),
                kind: attachmentKind(attachment.name),
              }),
          )
        }
      >
        Choose file…
      </button>
    </NodeViewWrapper>
  );
}

function AttachmentCaption({
  value,
  updateAttributes,
}: {
  value: string;
  updateAttributes: NodeViewProps["updateAttributes"];
}) {
  return (
    <input
      value={value}
      onChange={(event) => updateAttributes({ caption: event.target.value })}
      placeholder="Add a caption…"
    />
  );
}

function AttachmentControls({
  kind,
  width,
  align,
  updateAttributes,
}: {
  kind: string;
  width: number;
  align: string;
  updateAttributes: NodeViewProps["updateAttributes"];
}) {
  return (
    <div className="attachment-controls" contentEditable={false}>
      <input
        aria-label={`${kind} width`}
        type="range"
        min="20"
        max="100"
        value={width}
        onInput={(event) =>
          updateAttributes({ width: Number((event.target as HTMLInputElement).value) })
        }
      />
      {(["left", "center", "right"] as const).map((value) => (
        <button
          key={value}
          aria-label={`Align ${kind.toLocaleLowerCase()} ${value}`}
          className={align === value ? "active" : ""}
          onClick={() => updateAttributes({ align: value })}
        >
          {value[0]!.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function AttachmentDragHandle({
  title,
  onPointerDown,
  onKeyDown,
}: {
  title: string;
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className="attachment-drag-handle"
      aria-label={`Move ${title} block`}
      title="Drag to move · Alt+↑/↓ to move with the keyboard"
      contentEditable={false}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <GripVertical />
    </button>
  );
}

function useAttachmentPointerDrag({
  editor,
  getPos,
  title,
}: Pick<NodeViewProps, "editor" | "getPos"> & { title: string }) {
  const getPosRef = useRef(getPos);
  getPosRef.current = getPos;

  return {
    title,
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const source = event.currentTarget.closest<HTMLElement>(".attachment-node");
      if (!source) return;
      event.preventDefault();
      event.stopPropagation();
      const drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        source,
        moved: false,
      };
      let target: { element: HTMLElement; pos: number } | undefined;
      const clearTarget = () => {
        target?.element.classList.remove("attachment-drop-before", "attachment-drop-after");
        target = undefined;
      };
      const clear = () => {
        clearTarget();
        drag.source.classList.remove("attachment-dragging");
        document.body.classList.remove("moving-attachment");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
      };
      const blockAt = (y: number) => {
        const candidates = new Set<HTMLElement>([
          ...Array.from(editor.view.dom.children).filter(
            (element): element is HTMLElement => element instanceof HTMLElement,
          ),
          ...editor.view.dom.querySelectorAll<HTMLElement>(".attachment-node"),
        ]);
        const blocks = [...candidates]
          .filter((element) => element !== drag.source && !element.contains(drag.source))
          .map((element) => {
            const bounds = element.getBoundingClientRect();
            const distance =
              y < bounds.top ? bounds.top - y : y > bounds.bottom ? y - bounds.bottom : 0;
            return { element, bounds, distance };
          });
        const closest = blocks.sort((left, right) => left.distance - right.distance)[0];
        if (!closest) return undefined;
        const bounds = closest.bounds;
        const after = y > bounds.top + bounds.height / 2;
        let position: number | undefined;
        try {
          const start = editor.view.posAtDOM(closest.element, 0);
          const node = editor.state.doc.nodeAt(start);
          position = start + (after ? (node?.nodeSize ?? 0) : 0);
        } catch {
          position = editor.view.posAtCoords({
            left: bounds.left + Math.min(12, bounds.width / 2),
            top: after ? bounds.bottom - 2 : bounds.top + 2,
          })?.pos;
        }
        if (position === undefined) return undefined;
        return {
          element: closest.element,
          pos: position,
          after,
        };
      };
      const move = (pointerEvent: PointerEvent) => {
        if (drag.pointerId !== pointerEvent.pointerId) return;
        if (
          !drag.moved &&
          Math.hypot(pointerEvent.clientX - drag.startX, pointerEvent.clientY - drag.startY) >= 4
        ) {
          drag.moved = true;
          drag.source.classList.add("attachment-dragging");
          document.body.classList.add("moving-attachment");
        }
        if (!drag.moved) return;
        pointerEvent.preventDefault();
        const scroller = editor.view.dom.closest<HTMLElement>(".editor-scroll");
        if (scroller) {
          const bounds = scroller.getBoundingClientRect();
          const edge = 48;
          if (pointerEvent.clientY < bounds.top + edge) scroller.scrollBy({ top: -18 });
          else if (pointerEvent.clientY > bounds.bottom - edge) scroller.scrollBy({ top: 18 });
        }
        const next = blockAt(pointerEvent.clientY);
        if (!next) return;
        clearTarget();
        next.element.classList.add(next.after ? "attachment-drop-after" : "attachment-drop-before");
        target = { element: next.element, pos: next.pos };
      };
      const up = (pointerEvent: PointerEvent) => {
        if (drag.pointerId !== pointerEvent.pointerId) return;
        const destination = target?.pos;
        const position = typeof getPosRef.current === "function" ? getPosRef.current() : undefined;
        const moved = drag.moved;
        clear();
        if (!moved || destination === undefined || typeof position !== "number") return;
        moveAttachment(editor, position, destination);
      };
      const cancel = (pointerEvent: PointerEvent) => {
        if (drag.pointerId === pointerEvent.pointerId) clear();
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      const source = typeof getPosRef.current === "function" ? getPosRef.current() : undefined;
      if (typeof source !== "number") return;
      event.preventDefault();
      moveAttachmentByKeyboard(editor, source, event.key === "ArrowUp" ? -1 : 1);
    },
  };
}

function moveAttachment(editor: NodeViewProps["editor"], source: number, destination: number) {
  const node = editor.state.doc.nodeAt(source);
  if (!node) return;
  let insertAt = destination;
  if (insertAt > source) insertAt -= node.nodeSize;
  if (insertAt === source) return;
  const transaction = editor.state.tr.delete(source, source + node.nodeSize);
  insertAt = Math.max(0, Math.min(insertAt, transaction.doc.content.size));
  editor.view.dispatch(transaction.insert(insertAt, node).scrollIntoView());
}

function moveAttachmentByKeyboard(
  editor: NodeViewProps["editor"],
  source: number,
  direction: -1 | 1,
) {
  const blocks: Array<{ pos: number; size: number }> = [];
  editor.state.doc.forEach((node, offset) => blocks.push({ pos: offset, size: node.nodeSize }));
  const index = blocks.findIndex((block) => block.pos === source);
  if (index < 0) return;
  const neighbour = blocks[index + direction];
  if (!neighbour) return;
  moveAttachment(editor, source, direction < 0 ? neighbour.pos : neighbour.pos + neighbour.size);
}

function attachmentKind(name: string): "image" | "video" | "audio" | "pdf" | "file" {
  const extension = name.split(".").pop()?.toLocaleLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(extension ?? "")) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(extension ?? "")) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(extension ?? "")) return "audio";
  return extension === "pdf" ? "pdf" : "file";
}

function humanFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
