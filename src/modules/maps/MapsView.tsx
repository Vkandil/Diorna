import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlignCenter,
  BringToFront,
  Download,
  Frame,
  Image,
  Lock,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Presentation,
  StickyNote,
  Type,
} from "lucide-react";
import { selectWorkspace, useDiornaStore } from "@/core/store";
import { createId } from "@/shared/id";
import type { CanvasEdge, CanvasNode } from "@/shared/models";
import html2canvas from "html2canvas";

const colors: Record<string, string> = {
  "1": "#b9d6ff",
  "2": "#ffd3a8",
  "3": "#d6c9ff",
  "4": "#bce7d7",
  "5": "#ffd0db",
  "6": "#e3e7ee",
};

export function MapsView() {
  const state = useDiornaStore();
  const maps = selectWorkspace(state.maps, state.activeWorkspaceId).filter((map) => !map.trashedAt);
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const [mapId, setMapId] = useState(activeTab?.entityId ?? maps[0]?.id);
  const map = maps.find((entry) => entry.id === mapId);
  const createMap = () => {
    const created = state.addMap();
    setMapId(created.id);
    state.openTab({
      module: "maps",
      title: created.name,
      entityId: created.id,
    });
  };
  return (
    <div className="map-module">
      <header className="module-toolbar">
        <div className="segmented mini">
          <button className="active">
            <MousePointer2 size={15} />
          </button>
          <button>
            <Type size={15} />
          </button>
          <button>
            <StickyNote size={15} />
          </button>
          <button>
            <Image size={15} />
          </button>
          <button>
            <Frame size={15} />
          </button>
        </div>
        <span className="toolbar-divider" />
        <select value={mapId ?? ""} onChange={(event) => setMapId(event.target.value)}>
          <option value="" disabled>
            Select a map
          </option>
          {maps.map((entry) => (
            <option value={entry.id} key={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <button className="icon-button" title="New map" onClick={createMap}>
          <Plus />
        </button>
        <span className="toolbar-spacer" />
        <button className="button icon-text">
          <AlignCenter /> Arrange selection
        </button>
        <button className="button icon-text">
          <Presentation /> Present
        </button>
        <button
          className="button icon-text"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("diorna:export-map", { detail: "png" }))
          }
        >
          <Download /> PNG
        </button>
        <button
          className="button icon-text"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("diorna:export-map", { detail: "svg" }))
          }
        >
          SVG
        </button>
      </header>
      {map ? (
        <CanvasEditor key={map.id} mapId={map.id} />
      ) : (
        <div className="empty-state">
          <StickyNote />
          <h2>Build ideas spatially</h2>
          <p>Create a free-form canvas. Every position is preserved exactly.</p>
          <button className="button primary" onClick={createMap}>
            New map
          </button>
        </div>
      )}
    </div>
  );
}

function CanvasEditor({ mapId }: { mapId: string }) {
  const state = useDiornaStore();
  const map = state.maps.find((entry) => entry.id === mapId)!;
  const [selected, setSelected] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(map.nodes.map(toFlowNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(map.edges.map(toFlowEdge));
  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    const next = selectedNodes.map((node) => node.id);
    setSelected((current) =>
      current.length === next.length && current.every((id, index) => id === next[index])
        ? current
        : next,
    );
  }, []);
  const onConnect = useCallback(
    (connection: Connection) => {
      const next = addEdge({ ...connection, id: createId("edge"), type: "smoothstep" }, edges);
      setEdges(next);
      state.updateMap(map.id, { edges: next.map(fromFlowEdge) });
    },
    [edges, map.id, setEdges, state],
  );
  const addNode = () => {
    const node: CanvasNode = {
      id: createId("node"),
      type: "text",
      x: 180 + map.nodes.length * 24,
      y: 120 + map.nodes.length * 24,
      width: 220,
      height: 110,
      text: "New idea",
      color: "3",
      diorna: { nodeType: "text" },
    };
    setNodes((current) => [...current, toFlowNode(node)]);
    state.updateMap(map.id, { nodes: [...map.nodes, node] });
  };
  useEffect(() => {
    const handler = (event: Event) => {
      const format = (event as CustomEvent<string>).detail;
      if (format === "svg") {
        const svg = canvasToSvg(map.nodes, map.edges);
        downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${map.name}.svg`);
      } else if (canvasRef.current) {
        void html2canvas(canvasRef.current, {
          backgroundColor: null,
          scale: 2,
          useCORS: false,
        }).then((canvas) =>
          canvas.toBlob((blob) => blob && downloadBlob(blob, `${map.name}.png`), "image/png"),
        );
      }
    };
    window.addEventListener("diorna:export-map", handler);
    return () => window.removeEventListener("diorna:export-map", handler);
  }, [map.edges, map.name, map.nodes]);
  return (
    <div className="canvas-wrap" ref={canvasRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onNodeDragStop={(_, node) => {
          state.updateMap(map.id, {
            nodes: map.nodes.map((original) =>
              original.id === node.id ? fromFlowNode(node, original) : original,
            ),
          });
        }}
        onNodesDelete={(removed) => {
          const removedIds = new Set(removed.map((node) => node.id));
          state.updateMap(map.id, {
            nodes: map.nodes.filter((node) => !removedIds.has(node.id)),
            edges: map.edges.filter(
              (edge) => !removedIds.has(edge.fromNode) && !removedIds.has(edge.toNode),
            ),
          });
        }}
        onEdgesDelete={(removed) => {
          const removedIds = new Set(removed.map((edge) => edge.id));
          state.updateMap(map.id, {
            edges: map.edges.filter((edge) => !removedIds.has(edge.id)),
          });
        }}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).classList.contains("react-flow__pane")) addNode();
        }}
        fitView
        minZoom={0.1}
        maxZoom={4}
        snapToGrid
        snapGrid={[16, 16]}
        selectionOnDrag
        panOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => String(node.style?.background ?? "#d6c9ff")}
          maskColor="rgba(20,22,29,.08)"
          pannable
          zoomable
        />
      </ReactFlow>
      <div className="canvas-status">
        <span>
          {map.nodes.length} nodes · {map.edges.length} edges
        </span>
        <span>Coordinates persist exactly · Obsidian Canvas compatible</span>
      </div>
      {selected.length > 0 && (
        <div className="floating-inspector">
          <strong>{selected.length} selected</strong>
          <button title="Lock">
            <Lock />
          </button>
          <button title="Bring to front">
            <BringToFront />
          </button>
          <button title="Fit selection">
            <Maximize />
          </button>
          <button title="Delete">
            <Minus />
          </button>
        </div>
      )}
      <button className="canvas-add" onClick={addNode}>
        <Plus /> Add node
      </button>
    </div>
  );
}

function toFlowNode(node: CanvasNode): Node {
  const title = (node.text ?? node.label ?? node.file ?? node.url ?? "Untitled").split("\n")[0];
  const body = (node.text ?? "").split("\n").slice(1).join("\n").trim();
  return {
    id: node.id,
    position: { x: node.x, y: node.y },
    data: {
      label: (
        <div className="canvas-card">
          <header>
            <span>{node.diorna?.icon ?? "◆"}</span>
            <strong>{title}</strong>
          </header>
          {!node.diorna?.collapsed && body && <p>{body}</p>}
        </div>
      ),
    },
    style: {
      width: node.width,
      height: node.height,
      background: colors[node.color ?? "6"],
      border: `${node.diorna?.borderWidth ?? 1}px solid ${node.diorna?.borderColor ?? "rgba(40,45,60,.18)"}`,
      borderRadius: 10,
      padding: 0,
      overflow: "hidden",
    },
    draggable: !node.diorna?.locked,
  };
}

function fromFlowNode(node: Node, original?: CanvasNode): CanvasNode {
  return {
    ...(original ?? { id: node.id, type: "text" as const }),
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? Number(node.style?.width ?? 220),
    height: node.measured?.height ?? Number(node.style?.height ?? 110),
  };
}
function toFlowEdge(edge: CanvasEdge): Edge {
  return {
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    label: edge.label,
    type:
      edge.diorna?.routing === "straight"
        ? "straight"
        : edge.diorna?.routing === "orthogonal"
          ? "step"
          : "default",
    animated: false,
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
function fromFlowEdge(edge: Edge): CanvasEdge {
  return {
    id: edge.id,
    fromNode: edge.source,
    toNode: edge.target,
    ...(typeof edge.label === "string" ? { label: edge.label } : {}),
    diorna: {
      routing:
        edge.type === "straight" ? "straight" : edge.type === "step" ? "orthogonal" : "bezier",
      arrowheads: "one-way",
    },
  };
}

function canvasToSvg(nodes: CanvasNode[], edges: CanvasEdge[]): string {
  if (!nodes.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
  const minX = Math.min(...nodes.map((node) => node.x)) - 30,
    minY = Math.min(...nodes.map((node) => node.y)) - 30,
    maxX = Math.max(...nodes.map((node) => node.x + node.width)) + 30,
    maxY = Math.max(...nodes.map((node) => node.y + node.height)) + 30;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = edges
    .flatMap((edge) => {
      const from = byId.get(edge.fromNode),
        to = byId.get(edge.toNode);
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
        `<g transform="translate(${node.x - minX} ${node.y - minY})"><rect width="${node.width}" height="${node.height}" rx="10" fill="${colors[node.color ?? "6"] ?? "#e3e7ee"}" stroke="${escapeXml(node.diorna?.borderColor ?? "#b8bbc2")}"/><text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="14" font-weight="600" fill="#24262b">${escapeXml((node.text ?? node.label ?? "Untitled").split("\n")[0]!)}</text><text x="14" y="51" font-family="Segoe UI, sans-serif" font-size="11" fill="#555a63">${escapeXml((node.text ?? "").split("\n").slice(1).join(" ").slice(0, 90))}</text></g>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX - minX}" height="${maxY - minY}" viewBox="0 0 ${maxX - minX} ${maxY - minY}"><rect width="100%" height="100%" fill="white" fill-opacity="0"/>${lines}${cards}</svg>`;
}
function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}
function downloadBlob(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
