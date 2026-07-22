import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BringToFront,
  ChevronRight,
  Copy,
  Download,
  FileAudio,
  Frame,
  Image,
  Link2,
  Lock,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Paperclip,
  Presentation,
  Redo2,
  Search,
  SlidersHorizontal,
  StickyNote,
  Type,
  Undo2,
  Trash2,
} from "lucide-react";
import html2canvas from "html2canvas";
import DOMPurify from "dompurify";
import {
  importNativeAttachmentBytes,
  importNativeAttachmentFile,
  type ImportedAttachment,
} from "@/core/native";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { createId } from "@/shared/id";
import type { CanvasEdge, CanvasMap, CanvasNode, Note as DiornaNote } from "@/shared/models";
import { expandLinkedNoteTree } from "./linkedNotes";

const palette = [
  "#b9d6ff",
  "#ffd3a8",
  "#d6c9ff",
  "#bce7d7",
  "#ffd0db",
  "#e3e7ee",
  "#fff0a8",
  "#c8ecff",
  "#d8f0b7",
  "#f0c8ff",
  "#ffd9c8",
  "#ffffff",
];

type LinkedNotePreview = Pick<DiornaNote, "id" | "title" | "body" | "updatedAt">;
type MapNodeData = { node: CanvasNode; note?: LinkedNotePreview } & Record<string, unknown>;
type MapFlowNode = Node<MapNodeData, "diorna">;
type MapSnapshot = { nodes: CanvasNode[]; edges: CanvasEdge[] };
type MapNodeType = NonNullable<NonNullable<CanvasNode["diorna"]>["nodeType"]>;
type MapMediaType = Extract<MapNodeType, "image" | "video" | "audio" | "pdf" | "file">;
type Alignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "horizontal"
  | "vertical"
  | "width"
  | "height";

const nodeTypes = { diorna: CanvasCardNode };

export function MapsView({ tabId }: { tabId?: string | undefined } = {}) {
  const state = useDiornaStore();
  const maps = selectWorkspace(state.maps, state.activeWorkspaceId).filter((map) => !map.trashedAt);
  const activeTab = state.tabs.find((tab) => tab.id === (tabId ?? state.activeTabId));
  const [mapId, setMapId] = useState(activeTab?.entityId ?? maps[0]?.id);
  const map = maps.find((entry) => entry.id === mapId);
  useEffect(() => {
    if (activeTab?.module === "maps" && maps.some((entry) => entry.id === activeTab.entityId))
      setMapId(activeTab.entityId);
  }, [activeTab?.entityId, activeTab?.module, maps]);
  const createMap = (parentMapId?: string) => {
    const created = state.addMap(parentMapId ? "Untitled sub-map" : "Untitled map");
    if (parentMapId) state.updateMap(created.id, { parentMapId });
    setMapId(created.id);
    state.openTab({ module: "maps", title: created.name, entityId: created.id });
    return created;
  };
  if (!map)
    return (
      <div className="map-module">
        <div className="empty-state">
          <StickyNote />
          <h2>Build ideas spatially</h2>
          <p>Create a free-form canvas. Every position is preserved exactly.</p>
          <button className="button primary" onClick={() => createMap()}>
            New map
          </button>
        </div>
      </div>
    );
  return (
    <CanvasEditor
      key={map.id}
      map={map}
      maps={maps}
      notes={selectWorkspace(state.notes, state.activeWorkspaceId).filter(
        (note) => !note.trashedAt,
      )}
      onSelectMap={(next) => {
        setMapId(next.id);
        state.openTab({ module: "maps", title: next.name, entityId: next.id });
      }}
      onCreateMap={createMap}
      inspectorActive={(tabId ?? state.activeTabId) === state.activeTabId}
    />
  );
}

function CanvasEditor({
  map,
  maps,
  notes,
  onSelectMap,
  onCreateMap,
  inspectorActive,
}: {
  map: CanvasMap;
  maps: CanvasMap[];
  notes: DiornaNote[];
  onSelectMap: (map: CanvasMap) => void;
  onCreateMap: (parentMapId?: string) => CanvasMap;
  inspectorActive: boolean;
}) {
  const state = useDiornaStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<MapFlowNode>(
    toFlowNodes(map.nodes, notes),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(map.edges.map(toFlowEdge));
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<MapFlowNode, Edge> | null>(null);
  const history = useRef<MapSnapshot[]>([{ nodes: map.nodes, edges: map.edges }]);
  const historyIndex = useRef(0);
  const clipboard = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>({ nodes: [], edges: [] });
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const selectedNodesRef = useRef(selectedNodes);
  const selectedEdgesRef = useRef(selectedEdges);
  const [search, setSearch] = useState("");
  const [showMiniMap, setShowMiniMap] = useStoredBoolean("diorna-map-minimap", true);
  const [snap, setSnap] = useStoredBoolean("diorna-map-snap", true);
  const [gridSize, setGridSize] = useStoredNumber("diorna-map-grid", 16);
  const [exportScale, setExportScale] = useState(2);
  const [transparent, setTransparent] = useState(true);
  const [presenting, setPresenting] = useState(false);
  const [presentationIndex, setPresentationIndex] = useState(0);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [nativeDropActive, setNativeDropActive] = useState(false);
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>(null);
  const filteredMaps = maps.filter((entry) =>
    `${entry.path} ${entry.name} ${entry.nodes.map((node) => node.text ?? node.label ?? "").join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const breadcrumb = useMemo(() => mapBreadcrumb(map, maps), [map, maps]);
  const presentationNodes = useMemo(
    () =>
      [...map.nodes].sort(
        (a, b) =>
          (a.diorna?.presentationOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.diorna?.presentationOrder ?? Number.MAX_SAFE_INTEGER),
      ),
    [map.nodes],
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    selectedNodesRef.current = selectedNodes;
  }, [selectedNodes]);
  useEffect(() => {
    selectedEdgesRef.current = selectedEdges;
  }, [selectedEdges]);
  useEffect(() => {
    if (!inspectorActive) {
      setInspectorHost(null);
      return;
    }
    setInspectorHost(document.getElementById("map-inspector-panel"));
  }, [inspectorActive]);
  useEffect(() => {
    setNodes((current) =>
      current.map((flowNode) => {
        const canvasNode = map.nodes.find((entry) => entry.id === flowNode.id);
        if (!canvasNode) return flowNode;
        if (canvasNode.diorna?.nodeType !== "note") {
          if (flowNode.data.node === canvasNode) return flowNode;
          return { ...flowNode, data: { ...flowNode.data, node: canvasNode } };
        }
        const note = notes.find((entry) => entry.path === canvasNode.file);
        const linked = note ? linkedNotePreview(note) : undefined;
        if (
          flowNode.data.node === canvasNode &&
          flowNode.data.note?.id === linked?.id &&
          flowNode.data.note?.title === linked?.title &&
          flowNode.data.note?.body === linked?.body &&
          flowNode.data.note?.updatedAt === linked?.updatedAt
        )
          return flowNode;
        const { note: _previousNote, ...data } = flowNode.data;
        return {
          ...flowNode,
          data: {
            ...data,
            node: canvasNode,
            ...(linked ? { note: linked } : {}),
          },
        };
      }),
    );
  }, [map.nodes, notes, setNodes]);

  const persist = useCallback(
    (canvasNodes: CanvasNode[], canvasEdges: CanvasEdge[], record = true) => {
      setNodes(
        toFlowNodes(canvasNodes, notes).map((node) => ({
          ...node,
          selected: selectedNodesRef.current.includes(node.id),
        })),
      );
      setEdges(
        canvasEdges.map((edge) => ({
          ...toFlowEdge(edge),
          selected: selectedEdgesRef.current.includes(edge.id),
        })),
      );
      state.updateMap(map.id, { nodes: canvasNodes, edges: canvasEdges });
      if (!record) return;
      history.current = history.current.slice(0, historyIndex.current + 1);
      history.current.push({ nodes: canvasNodes, edges: canvasEdges });
      if (history.current.length > 101) history.current.shift();
      historyIndex.current = history.current.length - 1;
    },
    [map.id, notes, setEdges, setNodes, state],
  );

  const commitFlow = useCallback(
    (nextNodes: MapFlowNode[], nextEdges: Edge[], record = true) =>
      persist(
        nextNodes.map((node) =>
          fromFlowNode(
            node,
            map.nodes.find((entry) => entry.id === node.id),
          ),
        ),
        nextEdges.map((edge) =>
          fromFlowEdge(
            edge,
            map.edges.find((entry) => entry.id === edge.id),
          ),
        ),
        record,
      ),
    [map.edges, map.nodes, persist],
  );

  const undo = useCallback(() => {
    if (historyIndex.current === 0) return;
    historyIndex.current -= 1;
    const snapshot = history.current[historyIndex.current]!;
    persist(snapshot.nodes, snapshot.edges, false);
  }, [persist]);
  const redo = useCallback(() => {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current += 1;
    const snapshot = history.current[historyIndex.current]!;
    persist(snapshot.nodes, snapshot.edges, false);
  }, [persist]);

  const addNode = useCallback(
    (
      nodeType: MapNodeType = "text",
      position?: { x: number; y: number },
      changes: Partial<CanvasNode> = {},
    ) => {
      const point = position ??
        flowRef.current?.screenToFlowPosition({ x: 330, y: 220 }) ?? {
          x: 180 + nodesRef.current.length * 24,
          y: 120 + nodesRef.current.length * 24,
        };
      const size = defaultMapNodeSize(nodeType);
      const node: CanvasNode = {
        id: createId("node"),
        type:
          nodeType === "link"
            ? "link"
            : nodeType === "note" || isMapMediaType(nodeType) || nodeType === "submap"
              ? "file"
              : nodeType === "group"
                ? "group"
                : "text",
        x: point.x,
        y: point.y,
        width: size.width,
        height: size.height,
        text: nodeType === "group" ? "New group" : "New idea",
        color: "3",
        diorna: { nodeType, borderWidth: 1 },
        ...changes,
      };
      persist([...map.nodes, node], map.edges);
      setSelectedNodes([node.id]);
      return node;
    },
    [map.edges, map.nodes, persist],
  );

  const addAttachments = useCallback(
    (attachments: ImportedAttachment[], position?: { x: number; y: number }) => {
      if (!attachments.length) return;
      const point = position ??
        flowRef.current?.screenToFlowPosition({ x: 380, y: 260 }) ?? {
          x: 180 + nodesRef.current.length * 24,
          y: 120 + nodesRef.current.length * 24,
        };
      const created = attachments.map((attachment, index): CanvasNode => {
        const nodeType = mapMediaType(attachment.name);
        const size = defaultMapNodeSize(nodeType);
        return {
          id: createId("node"),
          type: "file",
          x: point.x + (index % 2) * 410,
          y: point.y + Math.floor(index / 2) * 390,
          width: size.width,
          height: size.height,
          text: attachment.name,
          file: attachment.relativePath,
          url: attachment.displayUrl,
          color: "12",
          diorna: { nodeType, borderWidth: 1 },
        };
      });
      persist([...map.nodes, ...created], map.edges);
      setSelectedNodes(created.map((node) => node.id));
    },
    [map.edges, map.nodes, persist],
  );

  const removeSelection = useCallback(() => {
    const nodeIds = new Set(selectedNodes);
    const edgeIds = new Set(selectedEdges);
    persist(
      map.nodes.filter((node) => !nodeIds.has(node.id)),
      map.edges.filter(
        (edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.fromNode) && !nodeIds.has(edge.toNode),
      ),
    );
    setSelectedNodes([]);
    setSelectedEdges([]);
  }, [map.edges, map.nodes, persist, selectedEdges, selectedNodes]);

  const copySelection = useCallback(
    (cut = false) => {
      const ids = new Set(selectedNodes);
      clipboard.current = {
        nodes: map.nodes.filter((node) => ids.has(node.id)),
        edges: map.edges.filter((edge) => ids.has(edge.fromNode) && ids.has(edge.toNode)),
      };
      if (cut) removeSelection();
    },
    [map.edges, map.nodes, removeSelection, selectedNodes],
  );
  const pasteSelection = useCallback(() => {
    if (!clipboard.current.nodes.length) return;
    const ids = new Map<string, string>();
    clipboard.current.nodes.forEach((node) => ids.set(node.id, createId("node")));
    const pasted = clipboard.current.nodes.map((node) => ({
      ...node,
      id: ids.get(node.id)!,
      x: node.x + 24,
      y: node.y + 24,
    }));
    const pastedEdges = clipboard.current.edges.map((edge) => ({
      ...edge,
      id: createId("edge"),
      fromNode: ids.get(edge.fromNode)!,
      toNode: ids.get(edge.toNode)!,
    }));
    persist([...map.nodes, ...pasted], [...map.edges, ...pastedEdges]);
    setSelectedNodes(pasted.map((node) => node.id));
  }, [map.edges, map.nodes, persist]);

  const updateNode = useCallback(
    (id: string, changes: Partial<CanvasNode>) =>
      persist(
        map.nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                ...changes,
                ...(changes.diorna ? { diorna: { ...node.diorna, ...changes.diorna } } : {}),
              }
            : node,
        ),
        map.edges,
      ),
    [map.edges, map.nodes, persist],
  );
  const expandLinkedPages = useCallback(
    (node: CanvasNode) => {
      const expansion = expandLinkedNoteTree(node, notes, map.nodes, map.edges);
      persist(expansion.nodes, expansion.edges);
      setSelectedNodes([node.id, ...expansion.addedNodeIds]);
      window.dispatchEvent(
        new CustomEvent("diorna-toast", {
          detail: expansion.addedNodeIds.length
            ? `${expansion.addedNodeIds.length} linked page${expansion.addedNodeIds.length === 1 ? "" : "s"} expanded.`
            : "All linked pages are already expanded.",
        }),
      );
      window.setTimeout(
        () =>
          void flowRef.current?.fitView({
            nodes: [node.id, ...expansion.addedNodeIds].map((id) => ({ id })),
            padding: 0.3,
            duration: 220,
          }),
        50,
      );
    },
    [map.edges, map.nodes, notes, persist],
  );
  const bringSelectionToFront = useCallback(() => {
    const ids = new Set(selectedNodes);
    persist(
      [
        ...map.nodes.filter((node) => !ids.has(node.id)),
        ...map.nodes.filter((node) => ids.has(node.id)),
      ],
      map.edges,
    );
  }, [map.edges, map.nodes, persist, selectedNodes]);

  const alignSelection = useCallback(
    (command: Alignment) => {
      const chosen = map.nodes.filter((node) => selectedNodes.includes(node.id));
      if (chosen.length < 2) return;
      const left = Math.min(...chosen.map((node) => node.x));
      const right = Math.max(...chosen.map((node) => node.x + node.width));
      const top = Math.min(...chosen.map((node) => node.y));
      const bottom = Math.max(...chosen.map((node) => node.y + node.height));
      const orderedX = [...chosen].sort((a, b) => a.x - b.x);
      const orderedY = [...chosen].sort((a, b) => a.y - b.y);
      const widthGap = chosen.length > 2 ? (right - left) / (chosen.length - 1) : 0;
      const heightGap = chosen.length > 2 ? (bottom - top) / (chosen.length - 1) : 0;
      const first = chosen[0]!;
      const next = map.nodes.map((node) => {
        if (!selectedNodes.includes(node.id)) return node;
        if (command === "left") return { ...node, x: left };
        if (command === "center") return { ...node, x: (left + right - node.width) / 2 };
        if (command === "right") return { ...node, x: right - node.width };
        if (command === "top") return { ...node, y: top };
        if (command === "middle") return { ...node, y: (top + bottom - node.height) / 2 };
        if (command === "bottom") return { ...node, y: bottom - node.height };
        if (command === "width") return { ...node, width: first.width };
        if (command === "height") return { ...node, height: first.height };
        if (command === "horizontal") {
          const index = orderedX.findIndex((entry) => entry.id === node.id);
          return { ...node, x: left + widthGap * index - node.width / 2 };
        }
        const index = orderedY.findIndex((entry) => entry.id === node.id);
        return { ...node, y: top + heightGap * index - node.height / 2 };
      });
      persist(next, map.edges);
    },
    [map.edges, map.nodes, persist, selectedNodes],
  );

  useEffect(() => {
    const onResize = (event: Event) => {
      const { id, width, height } = (
        event as CustomEvent<{
          id: string;
          width: number;
          height: number;
        }>
      ).detail;
      updateNode(id, { width, height });
    };
    window.addEventListener("diorna:resize-map-node", onResize);
    return () => window.removeEventListener("diorna:resize-map-node", onResize);
  }, [updateNode]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select") || target.isContentEditable) return;
      if (presenting) {
        if (event.key === "Escape") setPresenting(false);
        else if (event.key === "ArrowRight" || event.key === " ")
          setPresentationIndex((value) => Math.min(presentationNodes.length - 1, value + 1));
        else if (event.key === "ArrowLeft") setPresentationIndex((value) => Math.max(0, value - 1));
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setNodes((current) => current.map((node) => ({ ...node, selected: true })));
        setSelectedNodes(map.nodes.map((node) => node.id));
      } else if (event.ctrlKey && event.key.toLowerCase() === "c") copySelection();
      else if (event.ctrlKey && event.key.toLowerCase() === "x") copySelection(true);
      else if (event.ctrlKey && event.key.toLowerCase() === "v") pasteSelection();
      else if (event.ctrlKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        copySelection();
        window.setTimeout(pasteSelection, 0);
      } else if (event.ctrlKey && event.key.toLowerCase() === "z" && !event.shiftKey) undo();
      else if (
        (event.ctrlKey && event.key.toLowerCase() === "y") ||
        (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "z")
      )
        redo();
      else if (event.ctrlKey && (event.key === "+" || event.key === "="))
        void flowRef.current?.zoomIn();
      else if (event.ctrlKey && event.key === "-") void flowRef.current?.zoomOut();
      else if (event.ctrlKey && event.key === "0") void flowRef.current?.fitView({ padding: 0.18 });
      else if (event.ctrlKey && event.key === "Enter") {
        const source = map.nodes.find((node) => node.id === selectedNodes[0]);
        const created = addNode(
          "text",
          source ? { x: source.x + source.width + 80, y: source.y } : undefined,
        );
        if (source)
          persist(
            [...map.nodes, created],
            [
              ...map.edges,
              {
                id: createId("edge"),
                fromNode: source.id,
                toNode: created.id,
                diorna: { routing: "bezier", arrowheads: "one-way" },
              },
            ],
          );
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (selectedNodes.length || selectedEdges.length)
      )
        removeSelection();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [
    addNode,
    copySelection,
    map.edges,
    map.nodes,
    pasteSelection,
    persist,
    presentationNodes.length,
    presenting,
    redo,
    removeSelection,
    selectedEdges.length,
    selectedNodes,
    setNodes,
    undo,
  ]);

  useEffect(() => {
    if (!presenting || !presentationNodes.length) return;
    const current = presentationNodes[presentationIndex];
    if (current)
      void flowRef.current?.fitView({ nodes: [{ id: current.id }], padding: 0.65, duration: 180 });
  }, [presentationIndex, presentationNodes, presenting]);

  useEffect(() => {
    const clearNativeDropState = () => setNativeDropActive(false);
    window.addEventListener("dragend", clearNativeDropState);
    window.addEventListener("drop", clearNativeDropState);
    window.addEventListener("blur", clearNativeDropState);
    return () => {
      window.removeEventListener("dragend", clearNativeDropState);
      window.removeEventListener("drop", clearNativeDropState);
      window.removeEventListener("blur", clearNativeDropState);
    };
  }, []);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea") || target.isContentEditable) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length) {
        event.preventDefault();
        void Promise.all(
          files.map((file) => importNativeAttachmentBytes(map.workspaceId, file)),
        ).then((attachments) => addAttachments(attachments));
        return;
      }
      const text = event.clipboardData?.getData("text/plain").trim();
      if (text && /^https?:\/\//i.test(text)) addNode("link", undefined, { url: text, text });
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [addAttachments, addNode, map.workspaceId]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void Promise.all([import("@tauri-apps/api/webview"), import("@tauri-apps/api/window")]).then(
      async ([{ getCurrentWebview }, { getCurrentWindow }]) => {
        const scaleFactor = await getCurrentWindow().scaleFactor();
        const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "leave") {
            setNativeDropActive(false);
            return;
          }
          const point = {
            x: event.payload.position.x / scaleFactor,
            y: event.payload.position.y / scaleFactor,
          };
          const target = document.elementFromPoint(point.x, point.y);
          const inside = Boolean(target && canvasRef.current?.contains(target));
          if (event.payload.type === "over") {
            setNativeDropActive(inside);
            return;
          }
          setNativeDropActive(false);
          if (event.payload.type !== "drop" || !inside) return;
          const position = flowRef.current?.screenToFlowPosition(point);
          void Promise.all(
            event.payload.paths.map((path) => importNativeAttachmentFile(map.workspaceId, path)),
          ).then((attachments) => addAttachments(attachments, position));
        });
        if (cancelled) unlisten();
        else dispose = unlisten;
      },
    );
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [addAttachments, map.workspaceId]);

  const exportMap = async (format: "png" | "svg") => {
    if (format === "svg") {
      const svg = canvasToSvg(map.nodes, map.edges, transparent);
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${map.name}.svg`);
      return;
    }
    const target = canvasRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!target) return;
    const canvas = await html2canvas(target, {
      backgroundColor: transparent ? null : "#ffffff",
      scale: exportScale,
      useCORS: false,
    });
    canvas.toBlob((blob) => blob && downloadBlob(blob, `${map.name}.png`), "image/png");
  };

  const selectedNode = map.nodes.find((node) => node.id === selectedNodes[0]);
  const selectedEdge = map.edges.find((edge) => edge.id === selectedEdges[0]);
  return (
    <div className={`map-module ${presenting ? "presenting" : ""}`}>
      <header className="module-toolbar map-toolbar">
        <div className="segmented mini" aria-label="Add map node">
          <button title="Select" className="active">
            <MousePointer2 size={15} />
          </button>
          <button title="Text card" onClick={() => addNode("text")}>
            <Type size={15} />
          </button>
          <button
            title="Note node"
            onClick={() => {
              const first = notes[0];
              addNode("note", undefined, {
                ...(first ? { file: first.path } : {}),
                text: first?.title ?? "Choose a note",
              });
            }}
          >
            <StickyNote size={15} />
          </button>
          <button title="Image node" onClick={() => addNode("image")}>
            <Image size={15} />
          </button>
          <button title="Link node" onClick={() => addNode("link")}>
            <Link2 size={15} />
          </button>
          <button title="Group / frame" onClick={() => addNode("group")}>
            <Frame size={15} />
          </button>
        </div>
        <span className="toolbar-divider" />
        <div className="map-search">
          <Search size={13} />
          <input
            aria-label="Search maps"
            placeholder="Search maps"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          aria-label="Current map"
          value={map.id}
          onChange={(event) => {
            const next = maps.find((entry) => entry.id === event.target.value);
            if (next) onSelectMap(next);
          }}
        >
          {filteredMaps.map((entry) => (
            <option value={entry.id} key={entry.id}>
              {entry.path.replace(/^maps[\\/]/, "")}
            </option>
          ))}
        </select>
        <button className="icon-button" aria-label="New map" onClick={() => onCreateMap()}>
          <Plus />
        </button>
        <button
          className="icon-button"
          aria-label="Duplicate map"
          onClick={() => {
            const copy = state.duplicateMap(map.id);
            if (copy) onSelectMap(copy);
          }}
        >
          <Copy />
        </button>
        <button
          className="icon-button danger"
          aria-label="Move map to trash"
          onClick={() => {
            if (!window.confirm(`Move “${map.name}” to Trash?`)) return;
            const next = maps.find((entry) => entry.id !== map.id);
            state.trashMap(map.id);
            if (next) onSelectMap(next);
          }}
        >
          <Trash2 />
        </button>
        <button
          className="icon-button"
          aria-label="Undo"
          disabled={historyIndex.current === 0}
          onClick={undo}
        >
          <Undo2 />
        </button>
        <button
          className="icon-button"
          aria-label="Redo"
          disabled={historyIndex.current >= history.current.length - 1}
          onClick={redo}
        >
          <Redo2 />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom to fit"
          onClick={() => void flowRef.current?.fitView({ padding: 0.18, duration: 160 })}
        >
          <Maximize />
        </button>
        <button
          className="button compact"
          onClick={() =>
            void flowRef.current?.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 160 })
          }
        >
          100%
        </button>
        <select
          aria-label="Align selection"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) alignSelection(event.target.value as Alignment);
            event.target.value = "";
          }}
        >
          <option value="">Align…</option>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
          <option value="horizontal">Distribute horizontally</option>
          <option value="vertical">Distribute vertically</option>
          <option value="width">Match width</option>
          <option value="height">Match height</option>
        </select>
        <span className="toolbar-spacer" />
        <label className="map-toggle">
          <input
            type="checkbox"
            checked={snap}
            onChange={(event) => setSnap(event.target.checked)}
          />{" "}
          Snap
        </label>
        <input
          className="grid-size"
          aria-label="Grid size"
          type="number"
          min="4"
          max="64"
          value={gridSize}
          onChange={(event) => setGridSize(Math.max(4, Number(event.target.value)))}
        />
        <label className="map-toggle">
          <input
            type="checkbox"
            checked={showMiniMap}
            onChange={(event) => setShowMiniMap(event.target.checked)}
          />{" "}
          Minimap
        </label>
        <button
          className="button icon-text"
          onClick={() => {
            setPresentationIndex(0);
            setPresenting(true);
          }}
        >
          <Presentation /> Present
        </button>
        <select
          aria-label="PNG scale"
          value={exportScale}
          onChange={(event) => setExportScale(Number(event.target.value))}
        >
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="3">3×</option>
          <option value="4">4×</option>
        </select>
        <label className="map-toggle">
          <input
            type="checkbox"
            checked={transparent}
            onChange={(event) => setTransparent(event.target.checked)}
          />{" "}
          Transparent
        </label>
        <button className="button icon-text" onClick={() => void exportMap("png")}>
          <Download /> PNG
        </button>
        <button className="button" onClick={() => void exportMap("svg")}>
          SVG
        </button>
      </header>
      <nav className="map-breadcrumb" aria-label="Map breadcrumb">
        {breadcrumb.map((entry, index) => (
          <span key={entry.id}>
            {index > 0 && <ChevronRight />}
            <button onClick={() => onSelectMap(entry)}>{entry.name}</button>
          </span>
        ))}
        <input
          aria-label="Map name"
          value={map.name}
          onChange={(event) => {
            const folder = map.path.replace(/[^/\\]+$/, "");
            state.updateMap(map.id, {
              name: event.target.value,
              path: `${folder}${event.target.value}.canvas`,
            });
          }}
        />
        <label>
          Folder
          <input
            aria-label="Map folder"
            value={map.path
              .replace(/^maps[\\/]/, "")
              .replace(/[^/\\]+$/, "")
              .replace(/[\\/]$/, "")}
            placeholder="Root"
            onChange={(event) => {
              const folder = event.target.value.replace(/^[/\\]+|[/\\]+$/g, "");
              state.updateMap(map.id, {
                path: `maps/${folder ? `${folder}/` : ""}${map.name}.canvas`,
              });
            }}
          />
        </label>
      </nav>
      <div
        className={`canvas-wrap ${nativeDropActive ? "native-drop-active" : ""}`}
        ref={canvasRef}
        onPointerDownCapture={() => setNativeDropActive(false)}
      >
        <ReactFlow<MapFlowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(connection: Connection) => {
            const next = addEdge(
              {
                ...connection,
                id: createId("edge"),
                type: "default",
                markerEnd: { type: MarkerType.ArrowClosed },
              },
              edgesRef.current,
            );
            commitFlow(nodesRef.current, next);
          }}
          onConnectEnd={(event, connectionState) => {
            if (connectionState.toNode || !connectionState.fromNode) return;
            const pointer =
              "clientX" in event
                ? { x: event.clientX, y: event.clientY }
                : {
                    x: event.changedTouches[0]?.clientX ?? 0,
                    y: event.changedTouches[0]?.clientY ?? 0,
                  };
            const created = addNode("text", flowRef.current?.screenToFlowPosition(pointer));
            persist(
              [...map.nodes, created],
              [
                ...map.edges,
                {
                  id: createId("edge"),
                  fromNode: connectionState.fromNode.id,
                  toNode: created.id,
                  diorna: { routing: "bezier", arrowheads: "one-way" },
                },
              ],
            );
          }}
          onSelectionChange={({ nodes: selected, edges: chosenEdges }) => {
            const nodeIds = selected.map((node) => node.id);
            const edgeIds = chosenEdges.map((edge) => edge.id);
            setSelectedNodes((current) => (sameIds(current, nodeIds) ? current : nodeIds));
            setSelectedEdges((current) => (sameIds(current, edgeIds) ? current : edgeIds));
          }}
          onNodeDrag={(_, node) => {
            const others = nodesRef.current.filter((entry) => entry.id !== node.id);
            const centerX =
              node.position.x + Number(node.measured?.width ?? node.style?.width ?? 220) / 2;
            const centerY =
              node.position.y + Number(node.measured?.height ?? node.style?.height ?? 110) / 2;
            const alignedX = others.find(
              (entry) =>
                Math.abs(
                  entry.position.x +
                    Number(entry.measured?.width ?? entry.style?.width ?? 220) / 2 -
                    centerX,
                ) < 6,
            );
            const alignedY = others.find(
              (entry) =>
                Math.abs(
                  entry.position.y +
                    Number(entry.measured?.height ?? entry.style?.height ?? 110) / 2 -
                    centerY,
                ) < 6,
            );
            const rect = canvasRef.current?.getBoundingClientRect();
            const screen = flowRef.current?.flowToScreenPosition({
              x: alignedX ? centerX : 0,
              y: alignedY ? centerY : 0,
            });
            setGuides({
              ...(alignedX && screen && rect ? { x: screen.x - rect.left } : {}),
              ...(alignedY && screen && rect ? { y: screen.y - rect.top } : {}),
            });
          }}
          onNodeDragStop={(_, node) => {
            setGuides({});
            const original = map.nodes.find((entry) => entry.id === node.id);
            let next = nodesRef.current.map((entry) => (entry.id === node.id ? node : entry));
            if (original?.diorna?.nodeType === "group") {
              const dx = node.position.x - original.x;
              const dy = node.position.y - original.y;
              next = next.map((entry) => {
                const source = map.nodes.find((candidate) => candidate.id === entry.id);
                if (
                  !source ||
                  source.id === original.id ||
                  source.x < original.x ||
                  source.y < original.y ||
                  source.x + source.width > original.x + original.width ||
                  source.y + source.height > original.y + original.height
                )
                  return entry;
                return {
                  ...entry,
                  position: { x: entry.position.x + dx, y: entry.position.y + dy },
                };
              });
            }
            commitFlow(next, edgesRef.current);
          }}
          onNodesDelete={(removed) => {
            const ids = new Set(removed.map((node) => node.id));
            persist(
              map.nodes.filter((node) => !ids.has(node.id)),
              map.edges.filter((edge) => !ids.has(edge.fromNode) && !ids.has(edge.toNode)),
            );
          }}
          onEdgesDelete={(removed) => {
            const ids = new Set(removed.map((edge) => edge.id));
            persist(
              map.nodes,
              map.edges.filter((edge) => !ids.has(edge.id)),
            );
          }}
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).classList.contains("react-flow__pane"))
              addNode(
                "text",
                flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
              );
          }}
          onNodeDoubleClick={(event, flowNode) => {
            const node = map.nodes.find((entry) => entry.id === flowNode.id);
            if (node?.diorna?.nodeType === "submap") {
              const target = maps.find((entry) => entry.path === node.file);
              if (target) onSelectMap(target);
            } else if (node?.diorna?.nodeType === "note") {
              const note = notes.find((entry) => entry.path === node.file);
              if (note) {
                if (!event.ctrlKey && !state.rightPanelOpen) state.toggleRightPanel();
                state.openTab({ module: "notes", title: note.title, entityId: note.id });
              }
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const position = flowRef.current?.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });
            const files = [...event.dataTransfer.files];
            if (files.length) {
              void Promise.all(
                files.map((file) => importNativeAttachmentBytes(map.workspaceId, file)),
              ).then((attachments) => addAttachments(attachments, position));
              return;
            }
            const noteId = event.dataTransfer.getData("text/diorna-note");
            const note = notes.find((entry) => entry.id === noteId);
            if (note) addNode("note", position, { file: note.path, text: note.title });
          }}
          fitView
          minZoom={0.1}
          maxZoom={4}
          snapToGrid={snap}
          snapGrid={[gridSize, gridSize]}
          selectionOnDrag
          panOnScroll
          panOnDrag={[1, 2]}
          panActivationKeyCode="Space"
          zoomActivationKeyCode="Control"
          zoomOnScroll={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={gridSize} size={1} />
          {!presenting && <Controls position="bottom-left" showInteractive={false} />}
          {!presenting && showMiniMap && (
            <MiniMap
              position="bottom-right"
              nodeColor={(node) => String(node.style?.background ?? palette[2])}
              maskColor="rgba(20,22,29,.08)"
              pannable
              zoomable
            />
          )}
        </ReactFlow>
        {guides.x !== undefined && (
          <i className="alignment-guide vertical" style={{ left: guides.x }} />
        )}
        {guides.y !== undefined && (
          <i className="alignment-guide horizontal" style={{ top: guides.y }} />
        )}
        {!presenting && (
          <div className="canvas-status">
            <span>
              {map.nodes.length} nodes · {map.edges.length} edges
            </span>
            <span>Coordinates persist exactly · Obsidian Canvas compatible</span>
          </div>
        )}
        {!presenting &&
          inspectorHost &&
          inspectorActive &&
          (selectedNode || selectedEdge) &&
          createPortal(
            <MapInspector
              {...(selectedNode ? { node: selectedNode } : {})}
              {...(selectedEdge ? { edge: selectedEdge } : {})}
              notes={notes}
              linkPreviewEnabled={state.settings.linkPreviewEnabled}
              onUpdateNode={updateNode}
              onUpdateEdge={(id, changes) =>
                persist(
                  map.nodes,
                  map.edges.map((edge) =>
                    edge.id === id
                      ? {
                          ...edge,
                          ...changes,
                          ...(changes.diorna
                            ? { diorna: { ...edge.diorna, ...changes.diorna } }
                            : {}),
                        }
                      : edge,
                  ),
                )
              }
              onCreateSubmap={(node) => {
                const child = onCreateMap(map.id);
                updateNode(node.id, {
                  type: "file",
                  file: child.path,
                  text: child.name,
                  diorna: { nodeType: "submap" },
                });
              }}
              onExpandLinkedNotes={expandLinkedPages}
              onCopy={() => copySelection()}
              onBringToFront={bringSelectionToFront}
              onFit={() =>
                void flowRef.current?.fitView({
                  nodes: selectedNodes.map((id) => ({ id })),
                  padding: 0.35,
                  duration: 160,
                })
              }
              onDelete={removeSelection}
            />,
            inspectorHost,
          )}
        {!presenting && (selectedNode || selectedEdge) && !state.rightPanelOpen && (
          <button
            className="map-inspector-toggle"
            aria-label="Open node inspector"
            title="Open inspector"
            onClick={state.toggleRightPanel}
          >
            <SlidersHorizontal />
            <span>Inspector</span>
          </button>
        )}
        {!presenting && (
          <button className="canvas-add" onClick={() => addNode("text")}>
            <Plus /> Add node
          </button>
        )}
        {presenting && (
          <div className="presentation-controls">
            <span>
              {presentationIndex + 1} / {presentationNodes.length}
            </span>
            <button onClick={() => setPresentationIndex((value) => Math.max(0, value - 1))}>
              ←
            </button>
            <button
              onClick={() =>
                setPresentationIndex((value) => Math.min(presentationNodes.length - 1, value + 1))
              }
            >
              →
            </button>
            <button onClick={() => setPresenting(false)}>Exit</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MapInspector({
  node,
  edge,
  notes,
  linkPreviewEnabled,
  onUpdateNode,
  onUpdateEdge,
  onCreateSubmap,
  onExpandLinkedNotes,
  onCopy,
  onBringToFront,
  onFit,
  onDelete,
}: {
  node?: CanvasNode;
  edge?: CanvasEdge;
  notes: DiornaNote[];
  linkPreviewEnabled: boolean;
  onUpdateNode: (id: string, changes: Partial<CanvasNode>) => void;
  onUpdateEdge: (id: string, changes: Partial<CanvasEdge>) => void;
  onCreateSubmap: (node: CanvasNode) => void;
  onExpandLinkedNotes: (node: CanvasNode) => void;
  onCopy: () => void;
  onBringToFront: () => void;
  onFit: () => void;
  onDelete: () => void;
}) {
  if (edge && !node)
    return (
      <aside className="map-inspector edge-inspector" aria-label="Edge inspector">
        <strong>Edge</strong>
        <input
          aria-label="Edge label"
          placeholder="Label"
          value={edge.label ?? ""}
          onChange={(event) => onUpdateEdge(edge.id, { label: event.target.value })}
        />
        <input
          aria-label="Edge color"
          type="color"
          value={edge.color ?? "#7a8090"}
          onChange={(event) => onUpdateEdge(edge.id, { color: event.target.value })}
        />
        <input
          aria-label="Edge width"
          type="range"
          min="1"
          max="8"
          step="0.5"
          value={edge.diorna?.width ?? 1.5}
          onChange={(event) =>
            onUpdateEdge(edge.id, { diorna: { width: Number(event.target.value) } })
          }
        />
        <select
          aria-label="Edge line style"
          value={edge.diorna?.lineStyle ?? "solid"}
          onChange={(event) =>
            onUpdateEdge(edge.id, {
              diorna: {
                lineStyle: event.target.value as "solid" | "dashed" | "dotted",
              },
            })
          }
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
        <select
          aria-label="Edge routing"
          value={edge.diorna?.routing ?? "bezier"}
          onChange={(event) =>
            onUpdateEdge(edge.id, {
              diorna: {
                routing: event.target.value as "bezier" | "straight" | "orthogonal",
              },
            })
          }
        >
          <option value="bezier">Bezier</option>
          <option value="straight">Straight</option>
          <option value="orthogonal">Orthogonal</option>
        </select>
        <select
          aria-label="Edge arrowheads"
          value={edge.diorna?.arrowheads ?? "one-way"}
          onChange={(event) =>
            onUpdateEdge(edge.id, {
              diorna: {
                arrowheads: event.target.value as "none" | "one-way" | "bidirectional",
              },
            })
          }
        >
          <option value="none">None</option>
          <option value="one-way">One-way</option>
          <option value="bidirectional">Bidirectional</option>
        </select>
        <button className="icon-button" aria-label="Delete edge" onClick={onDelete}>
          <Minus />
        </button>
      </aside>
    );
  if (!node) return null;
  const nodeType = node.diorna?.nodeType ?? "text";
  return (
    <aside className="map-inspector" aria-label="Node inspector">
      <header>
        <strong>Node</strong>
        <div>
          <button title="Copy" onClick={onCopy}>
            <Copy />
          </button>
          <button title="Bring to front" onClick={onBringToFront}>
            <BringToFront />
          </button>
          <button title="Fit selection" onClick={onFit}>
            <Maximize />
          </button>
          <button title="Delete" onClick={onDelete}>
            <Minus />
          </button>
        </div>
      </header>
      <select
        aria-label="Node type"
        value={nodeType}
        onChange={(event) =>
          onUpdateNode(node.id, {
            diorna: {
              nodeType: event.target.value as Exclude<
                NonNullable<CanvasNode["diorna"]>["nodeType"],
                undefined
              >,
            },
          })
        }
      >
        <option value="text">Text card</option>
        <option value="note">Note</option>
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="audio">Audio</option>
        <option value="pdf">PDF</option>
        <option value="file">File attachment</option>
        <option value="link">Link</option>
        <option value="group">Group / frame</option>
        <option value="submap">Sub-map</option>
      </select>
      {nodeType === "note" ? (
        <>
          <select
            aria-label="Linked note"
            value={node.file ?? ""}
            onChange={(event) => {
              const note = notes.find((entry) => entry.path === event.target.value);
              onUpdateNode(node.id, {
                type: "file",
                file: event.target.value,
                ...(note ? { text: note.title } : {}),
              });
            }}
          >
            <option value="">Choose note</option>
            {notes.map((note) => (
              <option key={note.id} value={note.path}>
                {note.title}
              </option>
            ))}
          </select>
          {node.file && (
            <button
              className="button expand-linked-notes"
              onClick={() => onExpandLinkedNotes(node)}
            >
              <ChevronRight /> Expand all linked pages
            </button>
          )}
        </>
      ) : isMapMediaType(nodeType) ? (
        <input
          aria-label="Media source"
          placeholder="Attachment path or URL"
          value={node.url ?? node.file ?? ""}
          onChange={(event) => onUpdateNode(node.id, { url: event.target.value })}
        />
      ) : nodeType === "link" ? (
        <input
          aria-label="Link URL"
          placeholder="https://"
          value={node.url ?? ""}
          onChange={(event) =>
            onUpdateNode(node.id, {
              type: "link",
              url: event.target.value,
              diorna: {
                linkTitle: "",
                linkDescription: "",
                favicon: "",
                linkFetchedAt: "",
              },
            })
          }
          onBlur={(event) => {
            if (!linkPreviewEnabled || !event.target.value || node.diorna?.linkFetchedAt) return;
            void loadLinkPreview(event.target.value).then((preview) =>
              onUpdateNode(node.id, {
                diorna: { ...preview, linkFetchedAt: new Date().toISOString() },
              }),
            );
          }}
        />
      ) : (
        <textarea
          aria-label="Node text"
          value={node.text ?? node.label ?? ""}
          onChange={(event) => onUpdateNode(node.id, { text: event.target.value })}
        />
      )}
      {nodeType === "submap" && !node.file && (
        <button className="button" onClick={() => onCreateSubmap(node)}>
          Create linked sub-map
        </button>
      )}
      <label>
        Icon{" "}
        <input
          aria-label="Node icon"
          value={node.diorna?.icon ?? ""}
          onChange={(event) => onUpdateNode(node.id, { diorna: { icon: event.target.value } })}
        />
      </label>
      <div className="node-palette" aria-label="Node background color">
        {palette.map((color, index) => (
          <button
            aria-label={`Color ${index + 1}`}
            className={node.color === String(index + 1) ? "active" : ""}
            style={{ background: color }}
            key={color}
            onClick={() => onUpdateNode(node.id, { color: String(index + 1) })}
          />
        ))}
      </div>
      <label>
        Border{" "}
        <input
          aria-label="Node border color"
          type="color"
          value={node.diorna?.borderColor ?? "#b8bbc2"}
          onChange={(event) =>
            onUpdateNode(node.id, { diorna: { borderColor: event.target.value } })
          }
        />
        <input
          aria-label="Node border width"
          type="range"
          min="0"
          max="8"
          value={node.diorna?.borderWidth ?? 1}
          onChange={(event) =>
            onUpdateNode(node.id, { diorna: { borderWidth: Number(event.target.value) } })
          }
        />
      </label>
      <label>
        Presentation order{" "}
        <input
          aria-label="Presentation order"
          type="number"
          min="1"
          value={node.diorna?.presentationOrder ?? ""}
          onChange={(event) =>
            onUpdateNode(node.id, {
              diorna: {
                presentationOrder: event.target.value ? Number(event.target.value) : 0,
              },
            })
          }
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={Boolean(node.diorna?.collapsed)}
          onChange={(event) =>
            onUpdateNode(node.id, { diorna: { collapsed: event.target.checked } })
          }
        />{" "}
        Collapse to title
      </label>
      <label>
        <input
          type="checkbox"
          checked={Boolean(node.diorna?.locked)}
          onChange={(event) => onUpdateNode(node.id, { diorna: { locked: event.target.checked } })}
        />{" "}
        <Lock /> Lock position
      </label>
    </aside>
  );
}

function CanvasCardNode({ id, data, selected }: NodeProps<MapFlowNode>) {
  const node = data.node;
  const type = node.diorna?.nodeType ?? "text";
  const title = (
    (type === "note" ? data.note?.title : undefined) ??
    (type === "link" ? node.diorna?.linkTitle : undefined) ??
    node.text ??
    node.label ??
    node.file ??
    node.url ??
    "Untitled"
  ).split("\n")[0];
  const body =
    type === "link"
      ? (node.diorna?.linkDescription ?? "")
      : (node.text ?? "").split("\n").slice(1).join("\n").trim();
  const mediaSource = isMapMediaType(type) ? (node.url ?? node.file) : undefined;
  return (
    <>
      <NodeResizer
        isVisible={selected && !node.diorna?.locked}
        minWidth={120}
        minHeight={48}
        keepAspectRatio={type === "image"}
        onResizeEnd={(_event, params) =>
          window.dispatchEvent(
            new CustomEvent("diorna:resize-map-node", {
              detail: { id, width: params.width, height: params.height },
            }),
          )
        }
      />
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((position) => (
        <Handle
          key={`target-${position}`}
          type="target"
          position={position}
          id={`target-${position}`}
        />
      ))}
      <div
        className={`canvas-card type-${type} ${node.diorna?.collapsed ? "collapsed" : ""}`}
        data-media-name={isMapMediaType(type) ? title : undefined}
      >
        {type !== "image" && (
          <header>
            <span>
              {type === "link" && node.diorna?.favicon ? (
                <img className="canvas-favicon" src={node.diorna.favicon} alt="" />
              ) : (
                (node.diorna?.icon ?? nodeIcon(type))
              )}
            </span>
            <strong>{title}</strong>
          </header>
        )}
        {!node.diorna?.collapsed && type === "image" && mediaSource && (
          <img
            className="canvas-media"
            src={mediaSource}
            alt={title}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
          />
        )}
        {!node.diorna?.collapsed && type === "video" && mediaSource && (
          <video
            className="canvas-media nodrag nowheel"
            aria-label={title}
            controls
            src={mediaSource}
          />
        )}
        {!node.diorna?.collapsed && type === "audio" && mediaSource && (
          <div className="canvas-audio">
            <FileAudio />
            <audio className="nodrag nowheel" aria-label={title} controls src={mediaSource} />
          </div>
        )}
        {!node.diorna?.collapsed && type === "pdf" && mediaSource && (
          <iframe className="canvas-pdf nodrag nowheel" title={title} src={mediaSource} />
        )}
        {!node.diorna?.collapsed && type === "file" && mediaSource && (
          <a className="canvas-file nodrag" href={mediaSource} target="_blank" rel="noreferrer">
            <Paperclip />
            <span>{title}</span>
          </a>
        )}
        {!node.diorna?.collapsed && type === "note" && data.note && (
          <MapNotePreview note={data.note} />
        )}
        {!node.diorna?.collapsed && type === "note" && !data.note && (
          <p className="canvas-note-missing">Linked note unavailable</p>
        )}
        {!node.diorna?.collapsed &&
          body &&
          type !== "note" &&
          (type === "text" ? <MarkdownPreview value={body} /> : <p>{body}</p>)}
        {!node.diorna?.collapsed && type === "link" && node.url && (
          <small>{safeHost(node.url)}</small>
        )}
      </div>
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((position) => (
        <Handle
          key={`source-${position}`}
          type="source"
          position={position}
          id={`source-${position}`}
        />
      ))}
    </>
  );
}

function MapNotePreview({ note }: { note: LinkedNotePreview }) {
  const html = useMemo(() => mapNotePreviewHtml(note.body), [note.body]);
  return (
    <div
      className="canvas-note-preview nodrag nowheel"
      data-note-id={note.id}
      onDragStart={(event) => event.preventDefault()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MarkdownPreview({ value }: { value: string }) {
  return (
    <div className="canvas-markdown">
      {value.split("\n").map((line, index) => {
        const heading = line.match(/^(#{1,3})\s+(.+)/);
        const bullet = line.match(/^[-*]\s+(.+)/);
        if (heading)
          return (
            <strong className={`level-${heading[1]!.length}`} key={index}>
              {renderInlineMarkdown(heading[2]!)}
            </strong>
          );
        if (bullet)
          return (
            <span className="bullet" key={index}>
              {renderInlineMarkdown(bullet[1]!)}
            </span>
          );
        return <span key={index}>{renderInlineMarkdown(line)}</span>;
      })}
    </div>
  );
}

function renderInlineMarkdown(value: string) {
  return value
    .split(/(\*\*.+?\*\*|`.+?`)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") && part.endsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

function toFlowNode(node: CanvasNode, notes: DiornaNote[]): MapFlowNode {
  const note = notes.find((entry) => entry.path === node.file);
  return {
    id: node.id,
    type: "diorna",
    position: { x: node.x, y: node.y },
    data: { node, ...(note ? { note: linkedNotePreview(note) } : {}) },
    style: {
      width: node.width,
      height: node.diorna?.collapsed ? 44 : node.height,
      background: palette[Math.max(0, Number(node.color ?? "6") - 1)] ?? palette[5],
      border: `${node.diorna?.borderWidth ?? 1}px solid ${node.diorna?.borderColor ?? "rgba(40,45,60,.18)"}`,
      borderRadius: node.diorna?.nodeType === "group" ? 5 : 10,
      padding: 0,
      overflow: "visible",
      zIndex: node.diorna?.nodeType === "group" ? -1 : 0,
    },
    draggable: !node.diorna?.locked,
  };
}

function linkedNotePreview(note: DiornaNote): LinkedNotePreview {
  return { id: note.id, title: note.title, body: note.body, updatedAt: note.updatedAt };
}

function mapNotePreviewHtml(value: string): string {
  const document = new DOMParser().parseFromString(value, "text/html");
  for (const attachment of document.querySelectorAll<HTMLElement>(
    'figure[data-type="attachment"]',
  )) {
    const kind = attachment.getAttribute("kind") ?? "file";
    const source = attachment.getAttribute("src") ?? "";
    const title = attachment.getAttribute("title") ?? "Attachment";
    const caption = attachment.getAttribute("caption") ?? "";
    const width = Math.min(100, Math.max(20, Number(attachment.getAttribute("width")) || 100));
    const align = attachment.getAttribute("align") ?? "center";
    attachment.className = `canvas-note-attachment kind-${kind} align-${align}`;
    attachment.style.width = `${width}%`;
    attachment.replaceChildren();

    let media: HTMLElement;
    if (kind === "image") {
      const image = document.createElement("img");
      image.src = source;
      image.alt = caption || title;
      image.draggable = false;
      media = image;
    } else if (kind === "video") {
      const video = document.createElement("video");
      video.src = source;
      video.controls = true;
      media = video;
    } else if (kind === "audio") {
      const audio = document.createElement("audio");
      audio.src = source;
      audio.controls = true;
      media = audio;
    } else if (kind === "pdf") {
      const frame = document.createElement("iframe");
      frame.src = source;
      frame.title = title;
      frame.loading = "lazy";
      media = frame;
    } else {
      const file = document.createElement("span");
      file.className = "canvas-note-file";
      file.textContent = `📎 ${title}`;
      media = file;
    }
    attachment.append(media);
    if (caption) {
      const label = document.createElement("figcaption");
      label.textContent = caption;
      attachment.append(label);
    }
  }
  for (const image of document.querySelectorAll("img")) image.setAttribute("draggable", "false");
  return DOMPurify.sanitize(document.body.innerHTML, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["controls", "loading", "draggable"],
  });
}

function toFlowNodes(nodes: CanvasNode[], notes: DiornaNote[]): MapFlowNode[] {
  const collapsedGroups = nodes.filter(
    (node) => node.diorna?.nodeType === "group" && node.diorna.collapsed,
  );
  return nodes.map((node) => ({
    ...toFlowNode(node, notes),
    hidden: collapsedGroups.some(
      (group) =>
        group.id !== node.id &&
        node.x >= group.x &&
        node.y >= group.y &&
        node.x + node.width <= group.x + group.width &&
        node.y + node.height <= group.y + group.height,
    ),
  }));
}

function fromFlowNode(node: MapFlowNode, original?: CanvasNode): CanvasNode {
  return {
    ...(original ?? { id: node.id, type: "text" as const }),
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? Number(node.style?.width ?? 220),
    height: node.measured?.height ?? Number(node.style?.height ?? 110),
  };
}
function toFlowEdge(edge: CanvasEdge): Edge {
  const arrowheads = edge.diorna?.arrowheads ?? "one-way";
  return {
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    ...(edge.fromSide ? { sourceHandle: `source-${edge.fromSide}` } : {}),
    ...(edge.toSide ? { targetHandle: `target-${edge.toSide}` } : {}),
    ...(edge.label ? { label: edge.label } : {}),
    type:
      edge.diorna?.routing === "straight"
        ? "straight"
        : edge.diorna?.routing === "orthogonal"
          ? "step"
          : "default",
    ...(arrowheads === "bidirectional"
      ? {
          markerStart: {
            type: MarkerType.ArrowClosed,
            ...(edge.color ? { color: edge.color } : {}),
          },
        }
      : {}),
    ...(arrowheads !== "none"
      ? {
          markerEnd: {
            type: MarkerType.ArrowClosed,
            ...(edge.color ? { color: edge.color } : {}),
          },
        }
      : {}),
    style: {
      stroke: edge.color ?? "#7a8090",
      strokeWidth: edge.diorna?.width ?? 1.5,
      strokeDasharray:
        edge.diorna?.lineStyle === "dashed"
          ? "6 4"
          : edge.diorna?.lineStyle === "dotted"
            ? "2 3"
            : undefined,
    },
  };
}
function fromFlowEdge(edge: Edge, original?: CanvasEdge): CanvasEdge {
  return {
    ...(original ?? { id: edge.id, fromNode: edge.source, toNode: edge.target }),
    fromNode: edge.source,
    toNode: edge.target,
    ...(edge.sourceHandle
      ? {
          fromSide: edge.sourceHandle.replace("source-", "") as Exclude<
            CanvasEdge["fromSide"],
            undefined
          >,
        }
      : {}),
    ...(edge.targetHandle
      ? {
          toSide: edge.targetHandle.replace("target-", "") as Exclude<
            CanvasEdge["toSide"],
            undefined
          >,
        }
      : {}),
    ...(typeof edge.label === "string" ? { label: edge.label } : {}),
    diorna: {
      ...original?.diorna,
      routing:
        edge.type === "straight" ? "straight" : edge.type === "step" ? "orthogonal" : "bezier",
      arrowheads: original?.diorna?.arrowheads ?? "one-way",
    },
  };
}

function mapBreadcrumb(map: CanvasMap, maps: CanvasMap[]): CanvasMap[] {
  const result = [map];
  const seen = new Set([map.id]);
  let parentId = map.parentMapId;
  while (parentId && result.length < 6 && !seen.has(parentId)) {
    const parent = maps.find((entry) => entry.id === parentId);
    if (!parent) break;
    result.unshift(parent);
    seen.add(parent.id);
    parentId = parent.parentMapId;
  }
  return result;
}

function canvasToSvg(nodes: CanvasNode[], edges: CanvasEdge[], transparent: boolean): string {
  if (!nodes.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
  const minX = Math.min(...nodes.map((node) => node.x)) - 30;
  const minY = Math.min(...nodes.map((node) => node.y)) - 30;
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + 30;
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + 30;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = edges
    .flatMap((edge) => {
      const from = byId.get(edge.fromNode);
      const to = byId.get(edge.toNode);
      return from && to
        ? [
            `<line x1="${from.x + from.width / 2 - minX}" y1="${from.y + from.height / 2 - minY}" x2="${to.x + to.width / 2 - minX}" y2="${to.y + to.height / 2 - minY}" stroke="${escapeXml(edge.color ?? "#7a8090")}" stroke-width="${edge.diorna?.width ?? 1.5}"/>`,
          ]
        : [];
    })
    .join("");
  const cards = nodes
    .map(
      (node) =>
        `<g transform="translate(${node.x - minX} ${node.y - minY})"><rect width="${node.width}" height="${node.height}" rx="10" fill="${palette[Math.max(0, Number(node.color ?? "6") - 1)] ?? "#e3e7ee"}" stroke="${escapeXml(node.diorna?.borderColor ?? "#b8bbc2")}"/><text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="14" font-weight="600" fill="#24262b">${escapeXml((node.text ?? node.label ?? "Untitled").split("\n")[0]!)}</text><text x="14" y="51" font-family="Segoe UI, sans-serif" font-size="11" fill="#555a63">${escapeXml((node.text ?? "").split("\n").slice(1).join(" ").slice(0, 90))}</text></g>`,
    )
    .join("");
  const background = transparent ? "" : '<rect width="100%" height="100%" fill="white"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX - minX}" height="${maxY - minY}" viewBox="0 0 ${maxX - minX} ${maxY - minY}">${background}${lines}${cards}</svg>`;
}

function useStoredBoolean(key: string, fallback: boolean) {
  const [value, setValue] = useState(() =>
    localStorage.getItem(key) ? localStorage.getItem(key) === "true" : fallback,
  );
  const update = (next: boolean) => {
    setValue(next);
    localStorage.setItem(key, String(next));
  };
  return [value, update] as const;
}
function sameIds(current: string[], next: string[]) {
  return current.length === next.length && current.every((id, index) => id === next[index]);
}
function useStoredNumber(key: string, fallback: number) {
  const [value, setValue] = useState(() => Number(localStorage.getItem(key)) || fallback);
  const update = (next: number) => {
    setValue(next);
    localStorage.setItem(key, String(next));
  };
  return [value, update] as const;
}
function isMapMediaType(type: MapNodeType): type is MapMediaType {
  return ["image", "video", "audio", "pdf", "file"].includes(type);
}
function mapMediaType(name: string): MapMediaType {
  const extension = name.split(".").pop()?.toLocaleLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(extension ?? "")) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(extension ?? "")) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(extension ?? "")) return "audio";
  return extension === "pdf" ? "pdf" : "file";
}
function defaultMapNodeSize(type: MapNodeType): { width: number; height: number } {
  if (type === "group") return { width: 420, height: 260 };
  if (type === "image") return { width: 300, height: 220 };
  if (type === "video") return { width: 360, height: 250 };
  if (type === "pdf") return { width: 380, height: 360 };
  if (type === "audio") return { width: 320, height: 120 };
  if (type === "file") return { width: 260, height: 100 };
  return { width: 220, height: 110 };
}
function nodeIcon(type: MapNodeType) {
  if (type === "note") return "📝";
  if (type === "image") return "🖼️";
  if (type === "video") return "🎬";
  if (type === "audio") return "🎧";
  if (type === "pdf") return "PDF";
  if (type === "file") return "📎";
  if (type === "link") return "🔗";
  if (type === "group") return "▣";
  return type === "submap" ? "↳" : "◆";
}
function safeHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}
async function loadLinkPreview(url: string) {
  try {
    const response = await fetch(url, { headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error(String(response.status));
    const html = await response.text();
    const document = new DOMParser().parseFromString(html.slice(0, 500_000), "text/html");
    const title =
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") ??
      document.title;
    const description =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
      document.querySelector('meta[name="description"]')?.getAttribute("content") ??
      "";
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href;
    return {
      ...(title ? { linkTitle: title.slice(0, 160) } : {}),
      ...(description ? { linkDescription: description.slice(0, 400) } : {}),
      ...(icon ? { favicon: new URL(icon, url).href } : {}),
    };
  } catch {
    return { linkTitle: safeHost(url), linkDescription: url };
  }
}
function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
}
function downloadBlob(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
