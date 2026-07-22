import { useEffect, useMemo, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useDiornaStore } from "@/core/store";
import { citationKeys, formatReference, type CitationStyle } from "./bibliography";

export const ReferenceListBlock = Node.create({
  name: "referenceList",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { citationStyle: { default: "apa" } };
  },
  parseHTML() {
    return [{ tag: 'section[data-type="reference-list"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { "data-type": "reference-list" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ReferenceListView);
  },
});

function ReferenceListView({ node, updateAttributes, editor }: NodeViewProps) {
  const workspaceId = useDiornaStore((state) => state.activeWorkspaceId);
  const allReferences = useDiornaStore((state) => state.references);
  const references = useMemo(
    () => allReferences.filter((reference) => reference.workspaceId === workspaceId),
    [allReferences, workspaceId],
  );
  const [, setRevision] = useState(0);
  useEffect(() => {
    const update = () => setRevision((value) => value + 1);
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);
  const keys = citationKeys(editor.getText());
  const cited = references.filter((reference) => keys.has(reference.citationKey.toLowerCase()));
  const style = node.attrs.citationStyle as CitationStyle;
  return (
    <NodeViewWrapper className="reference-list-node">
      <header>
        <strong>References</strong>
        <select
          aria-label="Reference list citation style"
          value={style}
          onChange={(event) => updateAttributes({ citationStyle: event.target.value })}
        >
          <option value="apa">APA</option>
          <option value="ieee">IEEE</option>
          <option value="harvard">Harvard</option>
        </select>
      </header>
      {cited.map((reference, index) => (
        <p key={reference.id}>{formatReference(reference, style, index + 1)}</p>
      ))}
      {!cited.length && <p className="muted">Insert a citation with @ to build this list.</p>}
    </NodeViewWrapper>
  );
}
