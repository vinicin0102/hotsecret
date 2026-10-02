// Construtor visual de fluxos.
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider, addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow, type Connection, type Edge, type EdgeChange, type NodeChange } from "@xyflow/react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { FlowCanvas, edgeStyle } from "@/components/flow/FlowCanvas";
import type { HsFlowNode } from "@/components/flow/FlowNode";
import { FlowSidebar, type SidebarProduct, type SidebarTag } from "@/components/flow/FlowSidebar";
import { NODE_META, PALETTE, makeNode } from "@/components/flow/nodeMeta";
import { FunnelSettingsModal, type FunnelMeta } from "@/components/flow/FunnelSettingsModal";
import { PreviewModal } from "@/components/flow/PreviewModal";
import { useToast } from "@/hooks/useToast";
import { api } from "@/lib/client";
import { withBase } from "@/lib/paths";
import { lockedNodeIds, shortId, validateGraph, type GraphIssue } from "@/features/chat-engine/engine";
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from "@/types/flow";

interface CharacterRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  status: string;
  showOnline: boolean;
}

function toRF(graph: FlowGraph): { nodes: HsFlowNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, type: "hs", position: n.position, data: { node: n } })),
    edges: graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.condition, ...edgeStyle(e.condition) })),
  };
}

function fromRF(nodes: HsFlowNode[], edges: Edge[]): FlowGraph {
  return {
    nodes: nodes.map((n) => ({ ...n.data.node, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
    edges: edges.map((e): FlowEdge => ({ id: e.id, source: e.source, target: e.target, condition: e.sourceHandle ?? "default" })),
  };
}

/** Remove conexões cujo botão/saída não existe mais no nó. */
function pruneEdges(nodes: HsFlowNode[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n.data.node]));
  return edges.filter((e) => {
    const src = byId.get(e.source);
    if (!src || !byId.has(e.target)) return false;
    const h = e.sourceHandle ?? "default";
    if (h.startsWith("btn:")) {
      const buttons = ((src.content as { buttons?: { id: string }[] }).buttons ?? []).map((b) => `btn:${b.id}`);
      return buttons.includes(h);
    }
    return true;
  });
}

function Builder() {
  const router = useRouter();
  const id = String(router.query.id ?? "");
  const toast = useToast();
  const rf = useReactFlow();

  const [meta, setMeta] = useState<FunnelMeta | null>(null);
  const [nodes, setNodes] = useState<HsFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [savedJson, setSavedJson] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [products, setProducts] = useState<(SidebarProduct & { description: string | null; imageUrl: string | null; originalPrice: number | null; checkoutUrl: string | null })[]>([]);
  const [tags, setTags] = useState<SidebarTag[]>([]);
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [issues, setIssues] = useState<GraphIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api<{ funnel: FunnelMeta; graph: FlowGraph }>(`/api/admin/funnels/${id}`),
      api<{ products: typeof products }>("/api/admin/products"),
      api<{ tags: SidebarTag[] }>("/api/admin/tags"),
      api<{ characters: CharacterRow[] }>("/api/admin/characters"),
    ])
      .then(([f, p, t, c]) => {
        setMeta(f.funnel);
        const g = toRF(f.graph);
        setNodes(g.nodes);
        setEdges(g.edges);
        setSavedJson(JSON.stringify(fromRF(g.nodes, g.edges)));
        setProducts(p.products);
        setTags(t.tags);
        setCharacters(c.characters);
        setIssues(validateGraph(f.graph));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Erro ao carregar"));
  }, [id]);

  const graph = useMemo(() => fromRF(nodes, edges), [nodes, edges]);
  const graphJson = useMemo(() => JSON.stringify(graph), [graph]);
  const dirty = !!savedJson && graphJson !== savedJson;

  useEffect(() => {
    const t = setTimeout(() => setIssues(validateGraph(graph)), 400);
    return () => clearTimeout(t);
  }, [graph]);

  // aviso ao sair com alterações não salvas
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const toggleMinimize = useCallback((nodeId: string) => {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, node: { ...n.data.node, settings: { ...n.data.node.settings, minimized: !n.data.node.settings?.minimized } } } } : n,
      ),
    );
  }, []);

  const errorNodes = useMemo(() => new Set(issues.filter((i) => i.level === "error" && i.nodeId).map((i) => i.nodeId!)), [issues]);
  const productNames = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);
  const tagNames = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t.name])), [tags]);
  const paidNodes = useMemo(() => lockedNodeIds(graph), [graph]);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const c = n.data.node.content as { productId?: string; tagId?: string };
        return {
          ...n,
          selected: n.id === selectedId,
          data: {
            ...n.data,
            hasError: errorNodes.has(n.id),
            paid: paidNodes.has(n.id),
            productName: c.productId ? productNames[c.productId] : undefined,
            tagName: c.tagId ? tagNames[c.tagId] : undefined,
            onToggleMinimize: toggleMinimize,
          },
        };
      }),
    [nodes, selectedId, errorNodes, paidNodes, productNames, tagNames, toggleMinimize],
  );

  const onNodesChange = useCallback((changes: NodeChange<HsFlowNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changes.some((c) => c.type === "remove")) setSelectedId(null);
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)), []);
  const onConnect = useCallback((c: Connection) => {
    const handle = c.sourceHandle ?? "default";
    setEdges((es) =>
      addEdge(
        { ...c, id: shortId("e"), sourceHandle: handle, ...edgeStyle(handle) },
        // cada saída aponta para apenas um nó
        es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "default") === handle)),
      ),
    );
  }, []);

  const updateNode = useCallback((node: FlowNode) => {
    setNodes((ns) => {
      const next = ns.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, node } } : n));
      setEdges((es) => pruneEdges(next, es));
      return next;
    });
  }, []);

  const addNode = (type: NodeType) => {
    const wrap = document.querySelector(".canvas-wrap")?.getBoundingClientRect();
    const center = wrap
      ? rf.screenToFlowPosition({ x: wrap.left + wrap.width / 2, y: wrap.top + wrap.height / 2 })
      : { x: 0, y: 0 };
    const selected = nodes.find((n) => n.id === selectedId);
    // abaixo do nó selecionado; sem seleção, abaixo do nó mais baixo (evita sobreposição)
    const lowest = nodes.reduce<HsFlowNode | null>((acc, n) => (!acc || n.position.y > acc.position.y ? n : acc), null);
    const position = selected
      ? { x: selected.position.x + (edges.some((e) => e.source === selected.id) ? 300 : 0), y: selected.position.y + 200 }
      : lowest
        ? { x: lowest.position.x, y: lowest.position.y + 220 }
        : { x: center.x - 125, y: center.y - 60 };
    const node = makeNode(type, position);
    setNodes((ns) => [...ns, { id: node.id, type: "hs", position, data: { node } }]);
    // conecta automaticamente ao nó selecionado quando ele tem saída livre
    if (selected) {
      const t = selected.data.node.type;
      const c = selected.data.node.content as { mode?: string };
      const hasDefault = !["end", "offer", "buttons"].includes(t) && !(t === "question" && c.mode === "buttons");
      if (hasDefault && !edges.some((e) => e.source === selected.id && (e.sourceHandle ?? "default") === "default")) {
        setEdges((es) => [...es, { id: shortId("e"), source: selected.id, target: node.id, sourceHandle: "default" }]);
      }
    }
    setSelectedId(node.id);
    setTimeout(() => rf.setCenter(position.x + 125, position.y + 60, { zoom: rf.getZoom(), duration: 300 }), 50);
  };

  const duplicateNode = () => {
    const src = nodes.find((n) => n.id === selectedId);
    if (!src) return;
    const node: FlowNode = { ...structuredClone(src.data.node), id: shortId("n"), position: { x: src.position.x + 40, y: src.position.y + 60 } };
    setNodes((ns) => [...ns, { id: node.id, type: "hs", position: node.position, data: { node } }]);
    setSelectedId(node.id);
  };

  const deleteNode = () => {
    if (!selectedId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedId || n.data.node.type === "start"));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await api<{ issues: GraphIssue[] }>(`/api/admin/funnels/${id}/graph`, { method: "PUT", body: graph });
      setSavedJson(JSON.stringify(graph));
      setIssues(r.issues);
      toast("Fluxo salvo ✓");
      return r.issues;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar", true);
      return null;
    } finally {
      setSaving(false);
    }
  }, [graph, id, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const saveMeta = async (next: FunnelMeta) => {
    const r = await api<{ funnel: FunnelMeta }>(`/api/admin/funnels/${id}`, {
      method: "PUT",
      body: {
        name: next.name,
        description: next.description,
        slug: next.slug,
        characterId: next.characterId,
        initialMessage: next.initialMessage,
        status: next.status,
        settings: next.settings,
      },
    });
    setMeta({ ...next, ...r.funnel });
    return r.funnel;
  };

  const publish = async () => {
    if (!meta) return;
    const result = await save();
    if (!result) return;
    const errors = result.filter((i) => i.level === "error");
    if (errors.length) {
      toast(`Corrija ${errors.length} erro(s) antes de publicar`, true);
      return;
    }
    try {
      await saveMeta({ ...meta, status: meta.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" });
      toast(meta.status === "PUBLISHED" ? "Fluxo despublicado" : "Fluxo publicado ✓");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", true);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedId)?.data.node;
  const character = characters.find((c) => c.id === meta?.characterId);

  if (loadError) {
    return (
      <AdminLayout title="Fluxo">
        <div className="error-text">{loadError}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={meta?.name ?? "Fluxo"} bare>
      <div className="builder">
        <div className="builder-bar">
          <Link href="/admin/fluxos" className="btn btn-ghost btn-sm">
            ← Fluxos
          </Link>
          <span className="title">{meta?.name}</span>
          {meta && <span className={`pill status-${meta.status}`}>{meta.status === "PUBLISHED" ? "Publicado" : meta.status === "DRAFT" ? "Rascunho" : "Arquivado"}</span>}
          {dirty && (
            <span className="hint row" style={{ gap: 6 }}>
              <span className="dirty-dot" /> não salvo
            </span>
          )}
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => setShowSettings(true)}>
            ⚙ Configurar
          </button>
          <button className="btn btn-sm" onClick={() => setShowPreview(true)}>
            ▶ Preview
          </button>
          {meta && (
            <a className="btn btn-sm" href={withBase(`/f/${meta.slug}`)} target="_blank" rel="noreferrer">
              ↗ Abrir fluxo
            </a>
          )}
          {id && (
            <Link className="btn btn-sm" href={`/admin/fluxos/${id}/analytics`}>
              Analytics
            </Link>
          )}
          <button className="btn btn-sm" onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={publish} disabled={saving || !meta}>
            {meta?.status === "PUBLISHED" ? "Despublicar" : "Publicar"}
          </button>
        </div>
        <div className="builder-body">
          <div className="canvas-wrap">
            <div className="palette">
              <div className="label">Adicionar bloco</div>
              {PALETTE.map((t) => (
                <button key={t} onClick={() => addNode(t)} title={NODE_META[t].hint}>
                  <span className="pi" style={{ color: NODE_META[t].color }}>
                    {NODE_META[t].icon}
                  </span>
                  {NODE_META[t].label}
                </button>
              ))}
            </div>
            <FlowCanvas
              nodes={displayNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelect={setSelectedId}
            />
            {issues.length > 0 && (
              <div className="issues">
                <b>Verificação do fluxo</b>
                <ul style={{ paddingLeft: 16, margin: "6px 0 0" }}>
                  {issues.slice(0, 12).map((i, k) => (
                    <li key={k} className={i.level} onClick={() => i.nodeId && setSelectedId(i.nodeId)}>
                      {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {selectedNode && (
            <FlowSidebar
              key={selectedNode.id}
              node={selectedNode}
              products={products}
              tags={tags}
              onChange={updateNode}
              onDelete={deleteNode}
              onDuplicate={duplicateNode}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>

      {showSettings && meta && (
        <FunnelSettingsModal
          meta={meta}
          characters={characters}
          onClose={() => setShowSettings(false)}
          onSave={async (m) => {
            await saveMeta(m);
            toast("Configurações salvas ✓");
            setShowSettings(false);
          }}
        />
      )}
      {showPreview && meta && (
        <PreviewModal
          onClose={() => setShowPreview(false)}
          funnel={{
            id: meta.id,
            name: meta.name,
            slug: meta.slug,
            initialMessage: meta.initialMessage,
            character: {
              name: character?.name ?? "Hot Secret",
              avatarUrl: character?.avatarUrl ?? null,
              description: character?.description ?? null,
              status: character?.status ?? "online",
              showOnline: character?.showOnline ?? true,
            },
            graph,
            products: Object.fromEntries(
              products.map((p) => [
                p.id,
                { id: p.id, name: p.name, description: p.description, imageUrl: p.imageUrl, originalPrice: p.originalPrice, price: p.price, externalCheckoutUrl: null },
              ]),
            ),
          }}
        />
      )}
    </AdminLayout>
  );
}

export default function BuilderPage() {
  return (
    <ReactFlowProvider>
      <Builder />
    </ReactFlowProvider>
  );
}
