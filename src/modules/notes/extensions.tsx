import { useEffect, useId, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import katex from "katex";
import mermaid from "mermaid";
import DOMPurify from "dompurify";
import {
  AlertCircle,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Layers3,
} from "lucide-react";
import "katex/dist/katex.min.css";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { latex: { default: "E = mc^2" }, number: { default: "" } };
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
});

function MathBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const latex = String(node.attrs.latex);
  const [editing, setEditing] = useState(false);
  let html = "";
  let error = "";
  try {
    html = katex.renderToString(latex, {
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
        <input
          autoFocus
          value={latex}
          onChange={(event) => updateAttributes({ latex: event.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => event.key === "Enter" && setEditing(false)}
        />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {error && (
        <small>
          <AlertCircle />
          {error}
        </small>
      )}
      {node.attrs.number && <span className="equation-number">({node.attrs.number})</span>}
    </NodeViewWrapper>
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
  draggable: true,
  addAttributes() {
    return {
      kind: { default: "file" },
      src: { default: "" },
      title: { default: "Untitled attachment" },
      size: { default: "" },
      caption: { default: "" },
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

function AttachmentView({ node, updateAttributes, selected }: NodeViewProps) {
  const kind = String(node.attrs.kind);
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
        className={`attachment-node image ${selected ? "selected" : ""}`}
      >
        <img src={node.attrs.src} alt={node.attrs.caption || node.attrs.title} />
        <input
          value={node.attrs.caption}
          onChange={(event) => updateAttributes({ caption: event.target.value })}
          placeholder="Add a caption…"
        />
      </NodeViewWrapper>
    );
  if (kind === "video" && node.attrs.src)
    return (
      <NodeViewWrapper className="attachment-node">
        <video controls src={node.attrs.src} />
      </NodeViewWrapper>
    );
  if (kind === "audio" && node.attrs.src)
    return (
      <NodeViewWrapper className="attachment-node">
        <audio controls src={node.attrs.src} />
      </NodeViewWrapper>
    );
  if (kind === "pdf" && node.attrs.src)
    return (
      <NodeViewWrapper className="attachment-node pdf">
        <iframe title={node.attrs.title} src={node.attrs.src} />
        <span>PDF · Select text in the viewer to quote it into this note.</span>
      </NodeViewWrapper>
    );
  return (
    <NodeViewWrapper className={`attachment-node placeholder ${selected ? "selected" : ""}`}>
      <Icon />
      <span>
        <strong>{node.attrs.title}</strong>
        <small>
          {kind}
          {node.attrs.size ? ` · ${node.attrs.size}` : ""}
        </small>
      </span>
      <button contentEditable={false}>Choose file…</button>
    </NodeViewWrapper>
  );
}
