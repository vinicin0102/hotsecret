import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnBeforeDelete,
} from "@xyflow/react";
import { FlowNodeComponent, type HsFlowNode } from "./FlowNode";

const nodeTypes = { hs: FlowNodeComponent };

export function edgeStyle(condition: string): Partial<Edge> {
  if (condition === "payment:approved") return { style: { stroke: "#3DDC84" }, label: "aprovado" };
  if (condition === "payment:failed") return { style: { stroke: "#C92F56" }, label: "recusado" };
  return {};
}

interface Props {
  nodes: HsFlowNode[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<HsFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  onSelect: (id: string | null) => void;
}

/** Canvas infinito com zoom, arrastar, conectar, minimapa e controles. */
export function FlowCanvas({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onSelect }: Props) {
  const beforeDelete: OnBeforeDelete<HsFlowNode> = async ({ nodes: ns, edges: es }) => ({
    nodes: ns.filter((n) => n.data.node.type !== "start"),
    edges: es,
  });
  return (
    <ReactFlow<HsFlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onBeforeDelete={beforeDelete}
      onNodeClick={(_, n) => onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
      isValidConnection={(c) => c.source !== c.target}
      deleteKeyCode={["Backspace", "Delete"]}
      defaultEdgeOptions={{ type: "smoothstep" }}
      fitView
      fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
      minZoom={0.15}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(255,255,255,0.09)" />
      <Controls position="bottom-left" />
      <MiniMap position="top-right" pannable zoomable nodeColor={() => "#6E173C"} maskColor="rgba(13,7,16,0.7)" />
    </ReactFlow>
  );
}
