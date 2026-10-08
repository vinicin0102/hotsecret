# 🔥 HOT SECRET — Chat Funnel Builder

> *Conversas que guardam segredos.*

Plataforma de **funis de venda em formato de chat**. O visitante entra em uma conversa privada
premium; o administrador monta todo o fluxo visualmente (nós + conexões), acompanha leads,
conversas, pagamentos e a conversão de cada etapa.

- **Chat público:** `/hot-secret/f/<slug-do-fluxo>`
- **Painel:** `/hot-secret/admin`

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| App | Next.js 15 (Pages Router) + React 19 + TypeScript |
| Banco | PostgreSQL + Prisma (`database/schema.prisma`) |
| Editor visual | React Flow (`@xyflow/react`) |
| Gráficos | Recharts |
| Validação | Zod |
| Auth | JWT HS256 em cookie `httpOnly` (jose) + bcrypt |
| Pagamentos | Mercado Pago (PIX + Checkout Pro) via API e webhooks · provedor *sandbox* para testes |

## Como rodar localmente

```bash
cp .env.example .env          # preencha DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD
npm install
npx prisma migrate deploy     # cria as tabelas
npm run db:seed               # admin + personagem "Dra. Júlia" + produto + fluxo de exemplo publicado
npm run dev
```

Abra `http://localhost:3000/hot-secret/admin` (ou `http://localhost:3000/hot-secret/f/quiz-relacionamento`
para o chat de exemplo). Sem `ADMIN_EMAIL`, a tela de login oferece criar o primeiro administrador.

Testes: `npm test` · Tipos: `npm run typecheck`

### Pagamentos em teste

Com `PAYMENT_PROVIDER=sandbox` (padrão em desenvolvimento) o checkout gera um PIX fictício e mostra
botões **“Simular aprovação / recusa”**. A simulação passa pelo **mesmo caminho de produção**: um
webhook assinado (HMAC) é validado, registrado em `webhook_logs` e aplicado ao pagamento.
O sandbox é **bloqueado em produção**, a não ser que `ALLOW_SANDBOX_PAYMENTS=true`.

### ZuckPay (produção)

1. `PAYMENT_PROVIDER=zuckpay`, `ZUCKPAY_CLIENT_ID` e `ZUCKPAY_CLIENT_SECRET` (painel ZuckPay → Desenvolvedores → Credenciais API).
2. A API exige nome, CPF, e-mail e telefone do pagador. Como o visitante não preenche nada, configure
   `CHECKOUT_PAYER_CPF` e `CHECKOUT_PAYER_PHONE` (dados do titular) — nome/e-mail usam `CHECKOUT_PAYER_*`.
3. Gere o **Webhook Secret** no painel da ZuckPay e salve em `ZUCKPAY_WEBHOOK_SECRET`. O endereço
   `https://SEU_DOMINIO/hot-secret/api/webhooks/payments/zuckpay` é enviado automaticamente em cada
   cobrança (`urlnoty`) — `APP_URL` precisa ser o domínio público com https.
4. Mesmo sem webhook, o chat consulta `GET /v3/pix/status` a cada ~8s enquanto o PIX está pendente.
5. Algumas adquirentes da ZuckPay exigem valor mínimo de R$ 10,00.

### Mercado Pago (produção)

1. `PAYMENT_PROVIDER=mercadopago` e `MERCADOPAGO_ACCESS_TOKEN=<token de produção>`.
2. Em *Suas integrações → Webhooks*, cadastre `https://SEU_DOMINIO/hot-secret/api/webhooks/payments/mercadopago`
   (evento **Pagamentos**) e copie a assinatura secreta para `MERCADOPAGO_WEBHOOK_SECRET`.
3. PIX é exibido dentro do chat (QR Code + copia e cola), sem pedir dados ao visitante.
4. Um pagamento **só é aprovado** quando o webhook tem assinatura válida **e** a consulta à API do
   Mercado Pago confirma o status — chegar à tela final nunca aprova nada.

### Zenith Payments API (México e Argentina)

Produtos em **MXN** ou **ARS** cobram pelo gateway da moeda (`PAYMENT_PROVIDER_MXN`, `PAYMENT_PROVIDER_ARS`);
o PIX do Brasil continua em `PAYMENT_PROVIDER`.

1. `ZENITH_PUBLIC_KEY` e `ZENITH_SECRET_KEY` — só no servidor (variáveis de ambiente da Vercel, marcadas
   como *Sensitive*). Nunca vão para o navegador, URL, payload ou log.
2. `ZENITH_ENVIRONMENT=sandbox` (padrão). Cobrança real só com `ZENITH_ENVIRONMENT=production`.
3. `PAYMENT_PROVIDER_MXN=zenith` (e/ou `PAYMENT_PROVIDER_ARS=zenith`) liga a Zenith para a moeda.
4. Os métodos vêm de `GET /integrations/payment-methods` em tempo real; o formulário do chat pede
   exatamente os `customerFields`/`fields` do método e o payload segue `requiredPayloadFields`.
   Métodos de cartão (`secureCard`) ficam de fora: exigem os campos hospedados do Zenith Elements.
5. Cada compra tem uma `Idempotency-Key` (UUID) persistida com o corpo exato; timeout/5xx deixam a
   intenção como incerta e o próximo toque reenvia **a mesma chave e o mesmo corpo**.
6. Pagamento só é aprovado pelo webhook assinado em `https://SEU_DOMINIO/hot-secret/api/webhooks/payments/zenith`:
   `X-Zenith-Timestamp` (±300 s) e `X-Zenith-Signature` = HMAC-SHA256 hex de `"<timestamp>." + corpo bruto`
   com `ZENITH_WEBHOOK_SECRET`. O evento `payment.captured` aprova o pedido do `referenceId` uma única vez
   (id do evento único) e só se `amount` e `currency` baterem com o pedido. Sem o segredo, todo webhook é recusado.

## Deploy na Vercel

1. Importe o repositório e crie um banco Postgres (Neon / Vercel Postgres / Supabase).
2. Configure as variáveis do `.env.example` (incluindo `APP_URL` com o domínio final e `CRON_SECRET`).
3. O `vercel.json` já usa `npm run vercel-build` (gera o client, aplica migrations, roda o seed se
   `SEED_DEMO=true` e compila) e agenda `/hot-secret/api/cron/recovery` uma vez por dia (limite do plano
   Hobby). No plano Pro, troque o `schedule` para `*/5 * * * *`. O chat aberto também verifica a
   recuperação a cada consulta, então visitantes ativos não dependem do cron.
4. Uploads: defina `BLOB_READ_WRITE_TOKEN` (Vercel Blob). Sem ele, arquivos vão para `public/uploads`,
   o que só funciona em servidores com disco persistente (VPS, Railway, Render...).
5. Rode `npm run db:seed` uma vez apontando para o banco de produção (opcional).

---

## Arquitetura

```
database/            schema Prisma, migrations e seed
src/
  pages/             rotas (Pages Router)
    f/[slug].tsx     chat público (SSR do fluxo + A/B)
    admin/           painel (dashboard, conversas, leads, fluxos, personagens, produtos, pagamentos, analytics, configurações)
    api/public/      sessão do visitante, eventos, checkout, estado, entrega
    api/admin/       CRUD e relatórios (exigem sessão e papel)
    api/webhooks/    webhooks de pagamento (corpo bruto + assinatura)
    api/cron/        recuperação de checkout
  features/chat-engine/  Flow Engine (engine.ts puro, useChatEngine, transportes live/preview)
  components/chat/   ChatWindow, ChatHeader, MessageBubble, TypingIndicator, OptionButtons,
                     Image/Video/AudioMessage, OfferCard, CheckoutCard, PaymentStatus, DeliveryCard
  components/flow/   FlowCanvas, FlowNode, FlowSidebar, PreviewModal, FunnelSettingsModal
  components/admin/  AdminLayout, LeadTable, ConversationViewer, AnalyticsCard, FunnelSteps...
  services/          regras de negócio (funis, tracking, tags, analytics, recuperação, pagamentos)
  lib/               auth, api helpers, rate limit, validação, sanitização, formatação
  hooks/ types/ styles/
tests/               testes do engine, validação, CPF, assinatura de webhook
```

### Flow Engine

Cada fluxo é um grafo persistido em `funnel_nodes` (`id, funnel_id, type, content, settings, position_x, position_y`)
e `funnel_edges` (`source_node, target_node, condition`). Condições:

| condição | quando |
| --- | --- |
| `default` | próximo passo normal |
| `btn:<id>` | botão clicado (cada botão → um nó) |
| `payment:approved` / `payment:failed` | evento de pagamento confirmado pelo servidor |

O navegador executa os nós em sequência (delay fixo ou aleatório, “digitando...”), para nos pontos de
espera (botões, pergunta aberta, oferta) e registra cada passo em `/api/public/events`. O servidor
grava a mensagem **a partir do nó no banco** (nunca do texto enviado pelo navegador), atualiza etapa
do lead, aplica tags e automações.

**Tipos de bloco:** Mensagem (texto, remetente), Imagem, Vídeo (thumbnail, autoplay), Áudio,
Pergunta (aberta → salva em nome/e-mail/telefone/variável, ou botões), Botões, Oferta (card de
produto + checkout no chat), Entrega (link liberado só com pagamento aprovado), Link, Tag e Fim.

### Respostas digitadas

No bloco **Resposta** (e na Pergunta em modo de opções) o lead **digita o que quiser**. Cada caminho
tem um nome e palavras-chave; a resposta é comparada sem acentos/maiúsculas (a palavra-chave mais
específica vence) e, se nada bater, o fluxo segue pela saída **“Qualquer outra resposta”** (ou pelo
1º caminho). Também dá para usar “Digitando ou clicando” ou “Só botões”. Tudo que o lead digita fica
salvo na conversa.

### Checkout sem cadastro + conteúdo entregue no chat

- O visitante **não preenche nenhum dado**: toca em “QUERO ACESSAR”, confirma o produto/preço e recebe
  a **chave PIX** (QR Code + copia e cola) dentro do chat.
- Os dados que o gateway exige do pagador são do próprio SaaS (`CHECKOUT_PAYER_NAME`,
  `CHECKOUT_PAYER_EMAIL`; sem eles, um e-mail técnico é gerado por pagamento).
- **O produto é o próprio conteúdo do fluxo**: tudo que vem depois da saída “Pagamento aprovado” da
  oferta (marcado 🔒 no construtor) é **removido da página pública** e só é enviado ao navegador pela
  rota `/api/public/unlock` quando existe pagamento aprovado. O servidor também ignora eventos de nós
  pagos de quem não pagou, então o conteúdo não vaza nem pelo histórico da conversa.

### Pagamentos

`payment_created → payment_pending → payment_approved | payment_failed → payment_refunded`.
Transições são idempotentes (update condicional), cada uma vira evento, mensagem na conversa e,
quando aprovada, a tag `COMPROU`. O chat consulta `/api/public/state` enquanto há pagamento pendente
e, ao ver `APPROVED`, segue a conexão `payment:approved` do nó de oferta.

### Recuperação de checkout

Configurada por fluxo (⚙ Configurar → *Recuperação de checkout*): se o CTA da oferta foi clicado e
não há pagamento aprovado após N minutos, uma mensagem com botão **CONTINUAR** (reabre o checkout)
é inserida na conversa, o lead vira *Abandonou* e recebe a tag `ABANDONO`.

### Eventos e UTM

`page_view, chat_started, node_entered, message_viewed, button_clicked, question_answered,
image_viewed, video_started, audio_played, offer_viewed, offer_clicked, checkout_started,
payment_created, payment_pending, payment_approved, payment_failed, payment_refunded,
checkout_recovery_sent, delivery_viewed, link_clicked, chat_completed` — todos ligados ao lead.
UTMs (`utm_source/medium/campaign/content/term`), referrer, landing page, dispositivo, navegador,
SO e país (header da Vercel/Cloudflare) são capturados na primeira visita.

### Pixels (Meta, TikTok, Google)

Em **Configurações → Pixels e rastreamento** (padrão) ou **⚙ Configurar** do fluxo (sobrescreve):
PageView ao abrir o chat, InitiateCheckout ao clicar na oferta e Purchase quando o gateway confirma o
pagamento (com valor). A **API de Conversões da Meta** (token salvo só no servidor) envia o Purchase
pelo servidor no momento da aprovação — com IP, user agent, `fbp`/`fbc` (capturado do `fbclid`) — e usa
o id do pagamento como `event_id`, o mesmo do pixel do navegador, para a Meta deduplicar.

### A/B test

Em *Analytics → Testes A/B*: um slug próprio distribui visitantes entre fluxos publicados por peso
(variante fixa por cookie). O relatório compara início de conversa (CTR), checkout, vendas,
conversão e faturamento por variante.

### Segurança

- Sessão admin em cookie `httpOnly` + `SameSite=Lax`, middleware nas páginas e checagem em toda rota `/api/admin`
- Papéis: `OWNER` (gerencia equipe), `ADMIN` (edita), `VIEWER` (somente leitura)
- Bloqueio de origem cruzada em mutações (CSRF), rate limiting em login, sessão, eventos, checkout e webhooks
- Zod em todas as entradas; textos sanitizados; URLs `javascript:`/`data:` removidas; React escapa HTML
- Token assinado por visitante (lead + conversa + fluxo) — impossível escrever na conversa de outra pessoa
- Webhooks com assinatura HMAC verificada em tempo constante + confirmação via API do gateway
- Link de entrega nunca vai ao navegador antes do pagamento aprovado
- Uploads validados por tipo **e** assinatura binária, limite de 25 MB
- Segredos (`AUTH_SECRET`, `MERCADOPAGO_*`, `CRON_SECRET`) apenas no servidor

> O rate limiting é em memória (por instância). Em produção com várias instâncias, troque
> `src/lib/rate-limit.ts` por Redis/Upstash mantendo a mesma interface.
