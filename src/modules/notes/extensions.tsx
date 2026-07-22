import { useEffect, useId, useState } from "react";
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

const codeLowlight = createLowlight(common);
codeLowlight.register({ python, r, sql, javascript, typescript, bash, json, yaml, latex });

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
