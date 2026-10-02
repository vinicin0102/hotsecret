// Dados iniciais: administrador, personagem, tags, produto e um fluxo de exemplo publicado.
// Uso: npm run db:seed (idempotente)
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";

import { resolveDatabaseUrl } from "../src/lib/prisma";

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });

const T = (id: string, text: string, x: number, y: number, delayMs = 1600) => ({
  id,
  type: "text",
  content: { text, sender: "bot" },
  settings: { delayMode: "fixed", delayMs, showTyping: true },
  position: { x, y },
});
const B = (id: string, text: string, buttons: [string, string][], x: number, y: number) => ({
  id,
  type: "buttons",
  content: { text, buttons: buttons.map(([bid, label]) => ({ id: bid, label })) },
  settings: { delayMode: "fixed", delayMs: 1400, showTyping: true },
  position: { x, y },
});

async function main() {
  // no build da Vercel o seed só roda com SEED_DEMO=true
  if (process.argv.includes("--if-enabled") && process.env.SEED_DEMO !== "true") {
    console.log("• seed ignorado (SEED_DEMO != true)");
    return;
  }
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (email && password) {
    await prisma.user.upsert({
      where: { email },
      create: { email, name: "Administrador", passwordHash: await bcrypt.hash(password, 12), role: "OWNER" },
      update: {},
    });
    console.log(`✓ admin ${email}`);
  } else {
    console.log("• ADMIN_EMAIL/ADMIN_PASSWORD não definidos — crie o admin pela tela de login.");
  }

  for (const [name, color] of [
    ["NOVO", "#B9AAB3"],
    ["INTERESSADO", "#F29AB8"],
    ["RELACIONAMENTO", "#D94F7D"],
    ["CHECKOUT", "#D8A85C"],
    ["ABANDONO", "#C92F56"],
    ["COMPROU", "#D8A85C"],
  ]) {
    await prisma.tag.upsert({ where: { name }, create: { name, color }, update: {} });
  }
  const relTag = await prisma.tag.findUniqueOrThrow({ where: { name: "RELACIONAMENTO" } });
  const checkoutTag = await prisma.tag.findUniqueOrThrow({ where: { name: "CHECKOUT" } });
  if (!(await prisma.automation.findFirst({ where: { trigger: "checkout_started", tagId: checkoutTag.id } }))) {
    await prisma.automation.create({
      data: { name: "Iniciou checkout → CHECKOUT", trigger: "checkout_started", action: "add_tag", tagId: checkoutTag.id },
    });
  }

  let character = await prisma.character.findFirst({ where: { name: "Dra. Júlia" } });
  if (!character) {
    character = await prisma.character.create({
      data: {
        name: "Dra. Júlia",
        description: "Especialista em relacionamentos",
        status: "online",
        showOnline: true,
        initialMessages: ["Oi... posso te fazer uma pergunta que talvez você não esperava? 👀"],
      },
    });
  }

  let product = await prisma.product.findFirst({ where: { name: "Guia Hot Secret" } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: "Guia Hot Secret",
        description: "Descubra como reacender a conexão e entender o que a outra pessoa sente — passo a passo.",
        originalPrice: 2700,
        price: 990,
        deliveryUrl: "https://example.com/acesso/guia-hot-secret",
        active: true,
      },
    });
  }

  const slug = "quiz-relacionamento";
  if (await prisma.funnel.findUnique({ where: { slug } })) {
    console.log("• fluxo de exemplo já existe");
    return;
  }

  const funnel = await prisma.funnel.create({
    data: {
      name: "Quiz do Relacionamento",
      description: "Fluxo de exemplo: perguntas → oferta → checkout → entrega",
      slug,
      status: "PUBLISHED",
      characterId: character.id,
      initialMessage: "Oi... posso te fazer uma pergunta que talvez você não esperava? 👀",
      settings: {
        recovery: {
          enabled: true,
          delayMinutes: 10,
          message: "Ei... você estava quase lá 👀\n\nSeu acesso ainda está reservado.",
          buttonLabel: "CONTINUAR",
        },
      },
    },
  });

  const nodes = [
    { id: "start", type: "start", content: {}, settings: {}, position: { x: 260, y: 0 } },
    T("m1", "Oi... posso te fazer uma pergunta que talvez você não esperava? 👀", 220, 120, 1800),
    B("b1", "", [["pode", "Pode"], ["claro", "Claro ❤️"]], 220, 290),
    T("m2", "Você sente que alguma coisa mudou na sua relação?", 220, 450),
    B("b2", "", [["sim", "Sim"], ["nao", "Não"], ["naosei", "Não sei"]], 220, 610),
    T("s1", "Eu imaginei... 💭\nQuando algo muda, quase sempre existe um motivo que a pessoa não fala.", -160, 820),
    T("n1", "Que bom! Mas mesmo relações boas guardam segredos que ninguém conta. 🤫", 220, 820),
    T("ns1", "Essa dúvida é mais comum do que você imagina...\nE ela costuma dizer muita coisa.", 600, 820),
    { id: "tag1", type: "tag", content: { tagId: relTag.id }, settings: {}, position: { x: 220, y: 1010 } },
    T("m3", "Eu preparei um guia com tudo o que eu explico para as minhas pacientes. ❤️", 220, 1120, 2200),
    {
      id: "offer1",
      type: "offer",
      content: { productId: product.id, headline: "Guia Hot Secret", ctaLabel: "QUERO ACESSAR ❤️" },
      settings: { delayMode: "fixed", delayMs: 1500, showTyping: true },
      position: { x: 220, y: 1300 },
    },
    T("ok1", "Pronto! ❤️ Seu acesso foi liberado.", 20, 1560, 1200),
    {
      id: "del1",
      type: "delivery",
      content: { text: "Clique abaixo para acessar agora:", productId: product.id, buttonLabel: "ACESSAR MEU PRODUTO" },
      settings: { delayMode: "fixed", delayMs: 1200, showTyping: true },
      position: { x: 20, y: 1720 },
    },
    { id: "end1", type: "end", content: { text: "Qualquer coisa, estou por aqui. 💌" }, settings: { delayMs: 2000, showTyping: true }, position: { x: 20, y: 1900 } },
    T("fail1", "Hmm... parece que o pagamento não foi aprovado. 😕\nQuer tentar novamente? É só tocar no botão da oferta acima.", 440, 1560, 1200),
  ];
  const edges = [
    ["start", "m1", "default"],
    ["m1", "b1", "default"],
    ["b1", "m2", "btn:pode"],
    ["b1", "m2", "btn:claro"],
    ["m2", "b2", "default"],
    ["b2", "s1", "btn:sim"],
    ["b2", "n1", "btn:nao"],
    ["b2", "ns1", "btn:naosei"],
    ["s1", "tag1", "default"],
    ["n1", "tag1", "default"],
    ["ns1", "tag1", "default"],
    ["tag1", "m3", "default"],
    ["m3", "offer1", "default"],
    ["offer1", "ok1", "payment:approved"],
    ["offer1", "fail1", "payment:failed"],
    ["ok1", "del1", "default"],
    ["del1", "end1", "default"],
  ];

  await prisma.funnelNode.createMany({
    data: nodes.map((n) => ({
      funnelId: funnel.id,
      id: n.id,
      type: n.type,
      content: n.content as Prisma.InputJsonValue,
      settings: n.settings as Prisma.InputJsonValue,
      positionX: n.position.x,
      positionY: n.position.y,
    })),
  });
  await prisma.funnelEdge.createMany({
    data: edges.map(([s, t, c], i) => ({ funnelId: funnel.id, id: `e${i + 1}`, sourceNode: s, targetNode: t, condition: c })),
  });
  await prisma.offer.create({ data: { funnelId: funnel.id, nodeId: "offer1", productId: product.id, headline: "Guia Hot Secret", ctaLabel: "QUERO ACESSAR ❤️" } });
  console.log(`✓ fluxo de exemplo: /f/${slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
