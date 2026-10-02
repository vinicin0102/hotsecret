import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  FlowEdge,
  FlowGraph,
  FlowNode,
  FunnelSettings,
  PublicFunnel,
  PublicProduct,
} from "@/types/flow";
import { DEFAULT_RECOVERY } from "@/types/flow";

type NodeRow = { id: string; type: string; content: unknown; settings: unknown; positionX: number; positionY: number };
type EdgeRow = { id: string; sourceNode: string; targetNode: string; condition: string };

export function rowsToGraph(nodes: NodeRow[], edges: EdgeRow[]): FlowGraph {
  return {
    nodes: nodes.map(
      (n) =>
        ({
          id: n.id,
          type: n.type,
          content: (n.content ?? {}) as FlowNode["content"],
          settings: (n.settings ?? {}) as FlowNode["settings"],
          position: { x: n.positionX, y: n.positionY },
        }) as FlowNode,
    ),
    edges: edges.map((e) => ({ id: e.id, source: e.sourceNode, target: e.targetNode, condition: e.condition })),
  };
}

export async function loadGraph(funnelId: string): Promise<FlowGraph> {
  const [nodes, edges] = await Promise.all([
    prisma.funnelNode.findMany({ where: { funnelId }, orderBy: { createdAt: "asc" } }),
    prisma.funnelEdge.findMany({ where: { funnelId } }),
  ]);
  return rowsToGraph(nodes, edges);
}

/** Persiste o grafo inteiro em uma transação (substitui nós e conexões) e sincroniza ofertas. */
export async function saveGraph(funnelId: string, graph: FlowGraph) {
  const offerNodes = graph.nodes.filter((n) => n.type === "offer" && (n.content as { productId?: string }).productId);
  const productIds = [...new Set(offerNodes.map((n) => (n.content as { productId: string }).productId))];
  const existingProducts = new Set(
    (await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } })).map((p) => p.id),
  );

  await prisma.$transaction([
    prisma.funnelEdge.deleteMany({ where: { funnelId } }),
    prisma.funnelNode.deleteMany({ where: { funnelId } }),
    prisma.funnelNode.createMany({
      data: graph.nodes.map((n) => ({
        funnelId,
        id: n.id,
        type: n.type,
        content: n.content as Prisma.InputJsonValue,
        settings: n.settings as Prisma.InputJsonValue,
        positionX: n.position.x,
        positionY: n.position.y,
      })),
    }),
    prisma.funnelEdge.createMany({
      data: graph.edges.map((e: FlowEdge) => ({
        funnelId,
        id: e.id,
        sourceNode: e.source,
        targetNode: e.target,
        condition: e.condition || "default",
      })),
    }),
    prisma.offer.deleteMany({ where: { funnelId } }),
    prisma.offer.createMany({
      data: offerNodes
        .filter((n) => existingProducts.has((n.content as { productId: string }).productId))
        .map((n) => {
          const c = n.content as { productId: string; headline?: string; ctaLabel?: string };
          return { funnelId, nodeId: n.id, productId: c.productId, headline: c.headline, ctaLabel: c.ctaLabel };
        }),
    }),
    prisma.funnel.update({ where: { id: funnelId }, data: { updatedAt: new Date() } }),
  ]);
}

export function getFunnelSettings(raw: unknown): Required<FunnelSettings> {
  const s = (raw ?? {}) as FunnelSettings;
  return {
    defaultDelayMs: s.defaultDelayMs ?? 1200,
    recovery: { ...DEFAULT_RECOVERY, ...(s.recovery ?? {}) },
  };
}

/** Grafo inicial de um fluxo novo: INÍCIO → mensagem → botões. */
export function starterGraph(initialMessage?: string | null): FlowGraph {
  return {
    nodes: [
      { id: "start", type: "start", content: {} as never, settings: {}, position: { x: 0, y: 0 } },
      {
        id: "n_msg1",
        type: "text",
        content: { text: initialMessage || "Oi... posso te fazer uma pergunta que talvez você não esperava? 👀" },
        settings: { delayMs: 1500, showTyping: true },
        position: { x: 0, y: 140 },
      },
      {
        id: "n_btn1",
        type: "buttons",
        content: { buttons: [{ id: "b1", label: "Pode" }, { id: "b2", label: "Claro ❤️" }] },
        settings: { delayMs: 800, showTyping: false },
        position: { x: 0, y: 320 },
      },
    ],
    edges: [
      { id: "e_1", source: "start", target: "n_msg1", condition: "default" },
      { id: "e_2", source: "n_msg1", target: "n_btn1", condition: "default" },
    ],
  };
}

export async function duplicateFunnel(funnelId: string) {
  const original = await prisma.funnel.findUniqueOrThrow({ where: { id: funnelId } });
  const graph = await loadGraph(funnelId);
  let slug = `${original.slug}-copia`;
  for (let i = 2; await prisma.funnel.findUnique({ where: { slug } }); i++) slug = `${original.slug}-copia-${i}`;
  const copy = await prisma.funnel.create({
    data: {
      name: `${original.name} (cópia)`,
      description: original.description,
      slug,
      status: "DRAFT",
      characterId: original.characterId,
      initialMessage: original.initialMessage,
      settings: original.settings as Prisma.InputJsonValue,
    },
  });
  await saveGraph(copy.id, graph);
  return copy;
}

/** Fluxo publicado + personagem + produtos públicos. Nunca expõe deliveryUrl. */
export async function getPublicFunnelBySlug(slug: string, opts: { allowDraft?: boolean } = {}): Promise<PublicFunnel | null> {
  const funnel = await prisma.funnel.findUnique({ where: { slug }, include: { character: true } });
  if (!funnel) return null;
  if (funnel.status !== "PUBLISHED" && !opts.allowDraft) return null;
  return buildPublicFunnel(funnel);
}

export async function getPublicFunnelById(id: string): Promise<PublicFunnel | null> {
  const funnel = await prisma.funnel.findUnique({ where: { id }, include: { character: true } });
  if (!funnel) return null;
  return buildPublicFunnel(funnel);
}

async function buildPublicFunnel(
  funnel: Prisma.FunnelGetPayload<{ include: { character: true } }>,
): Promise<PublicFunnel> {
  const graph = await loadGraph(funnel.id);
  const productIds = graph.nodes
    .filter((n) => n.type === "offer")
    .map((n) => (n.content as { productId?: string }).productId)
    .filter((v): v is string => !!v);
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, active: true } });
  const publicProducts: Record<string, PublicProduct> = {};
  for (const p of products) {
    publicProducts[p.id] = {
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      originalPrice: p.originalPrice,
      price: p.price,
      externalCheckoutUrl: p.checkoutUrl ?? null,
    };
  }
  const c = funnel.character;
  return {
    id: funnel.id,
    name: funnel.name,
    slug: funnel.slug,
    initialMessage: funnel.initialMessage,
    character: {
      name: c?.name ?? "Hot Secret",
      avatarUrl: c?.avatarUrl ?? null,
      description: c?.description ?? null,
      status: c?.status ?? "online",
      showOnline: c?.showOnline ?? true,
    },
    graph,
    products: publicProducts,
  };
}

/**
 * A/B test: se o slug pertence a um experimento ativo, sorteia a variante por peso.
 * `stickyVariantId` mantém o visitante na mesma variante (cookie).
 */
export async function resolveExperiment(slug: string, stickyVariantId?: string | null, rng = Math.random) {
  const exp = await prisma.experiment.findUnique({
    where: { slug },
    include: { variants: { include: { funnel: { select: { status: true } } } } },
  });
  if (!exp || !exp.active) return null;
  const variants = exp.variants.filter((v) => v.funnel.status === "PUBLISHED" && v.weight > 0);
  if (variants.length === 0) return null;
  const sticky = variants.find((v) => v.id === stickyVariantId);
  if (sticky) return { experimentId: exp.id, variant: sticky };
  const total = variants.reduce((s, v) => s + v.weight, 0);
  let r = rng() * total;
  for (const v of variants) {
    r -= v.weight;
    if (r < 0) return { experimentId: exp.id, variant: v };
  }
  return { experimentId: exp.id, variant: variants[variants.length - 1] };
}
