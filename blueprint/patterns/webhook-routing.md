# Pattern: Roteamento de Webhooks

## Resumo

Pipeline completo para receber webhooks de APIs externas, verificar autenticidade via assinatura HMAC, normalizar o payload em eventos individuais, deduplicar eventos repetidos, rotear para destinos configurados e enfileirar entregas assincronas. O pattern garante seguranca (verificacao de assinatura + protecao SSRF), confiabilidade (deduplicacao + at-least-once delivery) e flexibilidade (rotas configuraveis por evento).

## Quando Usar

- Plataformas que recebem dados de APIs externas via webhook (Meta, Stripe, GitHub, Twilio, etc.)
- Cenarios onde um webhook precisa ser distribuido para multiplos destinos
- Integracao com provedores que enviam callbacks com assinatura criptografica
- Sistemas que precisam normalizar payloads complexos (um POST com N eventos) em unidades atomicas

## Arquitetura

```
                    Meta WhatsApp Cloud API
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  POST /api/webhook/[webhookKey]                      │
│                                                      │
│  1. Lookup empresa pelo webhookKey                   │
│  2. Ler raw body (preservar bytes originais)         │
│  3. Verificar assinatura X-Hub-Signature-256         │
│     └─ Invalida? → HTTP 401 + AuditLog              │
│  4. Parse JSON + normalizar em N eventos             │
│  5. Para cada evento:                                │
│     ├─ Calcular dedupe_key (SHA-256 versionado)      │
│     ├─ Verificar duplicata (janela 24h)              │
│     ├─ Transacao PostgreSQL:                         │
│     │   ├─ Persistir InboundWebhook                  │
│     │   └─ Materializar RouteDeliveries              │
│     └─ Enqueue pos-commit (best-effort)              │
│  6. Retornar HTTP 200 (ACK para a Meta)              │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
                   Redis Queue (BullMQ)
                           │
                           ▼
                   Worker de Entrega
                   (ver pattern queue.md)
```

### Componentes

1. **API Route** -- endpoint dinamico que recebe webhooks e orquestra todo o pipeline
2. **Verificacao de assinatura** -- valida HMAC-SHA256 do body contra app secret
3. **Normalizador** -- transforma um callback multi-evento em N eventos atomicos
4. **Deduplicador** -- calcula chave unica versionada e verifica duplicatas na janela de 24h
5. **Rotas de webhook** -- modelo configuravel com filtro por tipo de evento, headers custom, timeout
6. **Queue de entrega** -- BullMQ para processamento assincrono (detalhado em `queue.md`)

## Implementacao no Nexus

### Endpoint de Verificacao (GET)

**Arquivo:** `src/app/api/webhook/[webhookKey]/route.ts`

A Meta envia um GET com challenge/response para verificar o endpoint ao cadastrar o webhook:

```typescript
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { webhookKey } = await params;

  const mode = searchParams.get("hub.mode");       // "subscribe"
  const token = searchParams.get("hub.verify_token"); // token configurado
  const challenge = searchParams.get("hub.challenge"); // string aleatoria

  // Buscar empresa pelo webhook_key
  const company = await prisma.company.findUnique({
    where: { webhookKey },
    include: { credential: true },
  });

  // Descriptografar verify_token e comparar
  const decryptedVerifyToken = decrypt(company.credential.verifyToken);
  if (token !== decryptedVerifyToken) {
    return NextResponse.json({ error: "Invalid verify token" }, { status: 403 });
  }

  // Retorna o challenge como plain text
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
```

### Endpoint de Recebimento (POST)

**Arquivo:** `src/app/api/webhook/[webhookKey]/route.ts`

O fluxo completo do POST segue 6 passos:

**Passo 1 -- Lookup da empresa:**

```typescript
const company = await prisma.company.findUnique({
  where: { webhookKey },
  include: { credential: true },
});

if (!company || !company.isActive || !company.credential) {
  return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
}
```

O `webhookKey` eh um parametro dinamico da URL (`/api/webhook/abc123`), permitindo que cada empresa tenha seu proprio endpoint.

**Passo 2 -- Leitura do raw body:**

```typescript
const rawBody = await request.text();
```

Critico: o body deve ser lido como texto bruto (nao como JSON) para preservar os bytes exatos usados no calculo da assinatura.

**Passo 3 -- Verificacao de assinatura:**

```typescript
const signatureHeader = request.headers.get("x-hub-signature-256") ?? "";
const appSecret = decrypt(company.credential.metaAppSecret);

if (!verifySignature(rawBody, signatureHeader, appSecret)) {
  await logAudit({
    actorType: "system",
    action: "auth.invalid_signature",
    // ...
  });
  return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
}
```

**Passo 4 -- Normalizacao:**

```typescript
const payload = JSON.parse(rawBody);
const normalizedEvents = normalizeWebhookPayload(payload);
```

**Passo 5 -- Processamento por evento:**

Para cada evento normalizado: deduplica, persiste em transacao, enfileira.

**Passo 6 -- ACK:**

```typescript
return NextResponse.json({
  status: "ok",
  events: eventsProcessed,
  deduplicated: eventsDeduplicated,
});
```

Retorna HTTP 200 somente apos todos os COMMITs no banco. A Meta interpreta qualquer coisa diferente de 2xx como falha e reenvia.

### Verificacao de Assinatura

**Arquivo:** `src/lib/webhook/signature.ts`

HMAC-SHA256 com comparacao timing-safe para prevenir timing attacks:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

export function verifySignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string
): boolean {
  if (!signatureHeader.startsWith("sha256=")) return false;

  const receivedHex = signatureHeader.slice("sha256=".length);

  const hmac = createHmac("sha256", appSecret);
  hmac.update(rawBody, "utf8");
  const expectedHex = hmac.digest("hex");

  if (receivedHex.length !== expectedHex.length) return false;

  const receivedBuf = Buffer.from(receivedHex, "hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  return timingSafeEqual(receivedBuf, expectedBuf);
}
```

**Decisoes de design:**
- `timingSafeEqual` previne timing attacks (comparacao em tempo constante)
- Verificacao de comprimento antes do `timingSafeEqual` evita excecao do Node.js
- `rawBody` como string (nao objeto reserializado) garante fidelidade ao calculo original da Meta

### Normalizador Multi-Evento

**Arquivo:** `src/lib/webhook/normalizer.ts`

A Meta envia callbacks complexos que podem conter multiplos eventos logicos em um unico POST. O normalizador divide o callback em eventos atomicos:

```typescript
export interface NormalizedEvent {
  eventType: string;  // "messages.text", "statuses.delivered", "account_update"
  wabaId: string;     // WABA ID (entry.id)
  payload: Record<string, unknown>;  // Payload isolado do evento
}

export function normalizeWebhookPayload(payload: MetaWebhookPayload): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field === "messages") {
        // Cada mensagem vira um evento separado
        for (const message of change.value.messages ?? []) {
          events.push({
            eventType: `messages.${message.type}`,  // messages.text, messages.image
            wabaId: entry.id,
            payload: { messaging_product, metadata, message },
          });
        }
        // Cada status vira um evento separado
        for (const status of change.value.statuses ?? []) {
          events.push({
            eventType: `statuses.${status.status}`,  // statuses.delivered, statuses.read
            wabaId: entry.id,
            payload: { messaging_product, metadata, status },
          });
        }
      } else {
        // account_update, flows, etc.
        events.push({
          eventType: change.field,
          wabaId: entry.id,
          payload: { value: change.value },
        });
      }
    }
  }

  return events;
}
```

**Resultado:** Um POST da Meta com 3 mensagens e 2 statuses gera 5 `NormalizedEvent`, cada um processado independentemente.

### Deduplicador

**Arquivo:** `src/lib/webhook/deduplicator.ts`

Algoritmo versionado (v1) que calcula uma chave unica SHA-256 para cada evento:

```
dedupe_key = SHA-256("v1:" + wabaId + "|" + eventType + "|" + identifier)
```

Onde `identifier` depende do tipo de evento:

| Tipo | Identifier | Exemplo |
|------|-----------|---------|
| messages.* | `message.id` (wamid) | `wamid.abc123` |
| statuses.* | `status.id` + ":" + `status.status` | `wamid.abc123:delivered` |
| calls.* | `call.id` | `call.xyz789` |
| outros | SHA-256 do JSON (sorted keys) | hash do payload |

```typescript
export function computeDedupeKey(params: DedupeParams): string {
  let identifier: string;

  if (params.messageId) {
    identifier = params.messageId;
  } else if (params.statusId && params.statusValue) {
    identifier = `${params.statusId}:${params.statusValue}`;
  } else if (params.callId) {
    identifier = params.callId;
  } else if (params.fallbackContent) {
    identifier = hashContent(params.fallbackContent);
  }

  const preimage = `${ALGORITHM_VERSION}:${params.wabaId}|${params.eventType}|${identifier}`;
  return sha256(preimage);
}
```

**Extracao automatica de parametros:**

```typescript
export function extractDedupeParams(event: NormalizedEvent): DedupeParams {
  const params: DedupeParams = { wabaId: event.wabaId, eventType: event.eventType };

  if (event.eventType.startsWith("messages.") && event.payload.message) {
    params.messageId = (event.payload.message as any).id;
  } else if (event.eventType.startsWith("statuses.") && event.payload.status) {
    const status = event.payload.status as any;
    params.statusId = status.id;
    params.statusValue = status.status;
  }
  // ...

  return params;
}
```

**Verificacao de duplicata no banco:**

```typescript
// Janela de 24 horas
const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const existing = await prisma.inboundWebhook.findFirst({
  where: {
    dedupeKey,
    createdAt: { gt: twentyFourHoursAgo },
  },
});

if (existing) {
  eventsDeduplicated++;
  continue; // Pula este evento
}
```

**Decisoes de design:**
- Versionamento (`v1:`) permite migrar o algoritmo sem invalidar chaves antigas
- `statusId:statusValue` distingue `sent`, `delivered` e `read` do mesmo wamid
- Sorted keys no fallback garante determinismo independente da ordem das propriedades
- Janela de 24h eh um compromisso entre protecao contra duplicatas e custo de armazenamento

### Roteamento para Destinos

O roteamento acontece em duas etapas:

**1. Buscar rotas ativas da empresa:**

```typescript
const activeRoutes = await prisma.webhookRoute.findMany({
  where: { companyId: company.id, isActive: true },
});
```

**2. Filtrar rotas que aceitam o tipo de evento:**

```typescript
const matchingRoutes = activeRoutes.filter((route) => {
  const events = route.events as string[];
  return events.includes(event.eventType) || events.includes("*");
});
```

Cada rota pode ter uma lista de tipos de evento aceitos ou `"*"` (wildcard) para aceitar todos.

### Transacao e Enqueue

**Arquivo:** `src/app/api/webhook/[webhookKey]/route.ts`

Persistencia em transacao PostgreSQL:

```typescript
const result = await prisma.$transaction(async (tx) => {
  // 1. Persistir InboundWebhook (registro do evento recebido)
  const inboundWebhook = await tx.inboundWebhook.create({
    data: {
      companyId: company.id,
      receivedAt: now,
      rawBody,
      rawPayload: payload,
      eventType: event.eventType,
      dedupeKey,
      processingStatus: matchingRoutes.length > 0 ? "received" : "no_routes",
    },
  });

  // 2. Materializar RouteDeliveries (uma por rota compativel)
  const deliveries: string[] = [];
  for (const route of matchingRoutes) {
    const delivery = await tx.routeDelivery.create({
      data: {
        inboundWebhookId: inboundWebhook.id,
        routeId: route.id,
        companyId: company.id,
        status: "pending",
      },
    });
    deliveries.push(delivery.id);
  }

  return { inboundWebhookId: inboundWebhook.id, deliveryIds: deliveries };
});
```

**Enqueue pos-commit (best-effort):**

```typescript
const enqueuePromises = result.deliveryIds.map((deliveryId) =>
  webhookDeliveryQueue.add(
    "deliver",
    { routeDeliveryId: deliveryId, inboundWebhookId: result.inboundWebhookId, companyId: company.id },
    { jobId: `delivery-${deliveryId}`, attempts: 1 }
  )
);

await Promise.all(enqueuePromises);
```

**Decisao critica:** O enqueue acontece FORA da transacao. Se o Redis estiver fora do ar, as RouteDeliveries ja estao persistidas no banco com `status: pending`. O orphan recovery (ver `queue.md`) detecta e reenfileira automaticamente. Isso garante at-least-once delivery sem acoplar a transacao ao Redis.

### Protecao SSRF

**Arquivo:** `src/lib/webhook/ssrf.ts`

Antes de enviar uma entrega, o worker valida a URL de destino:

```typescript
export function validateUrl(url: string): void {
  const parsed = new URL(url);

  // Apenas HTTPS
  if (parsed.protocol !== "https:") {
    throw new SsrfError(`Apenas HTTPS eh permitido`);
  }

  // Bloquear localhost
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new SsrfError(`Hostname bloqueado: ${hostname}`);
  }

  // Bloquear IPs privados (RFC 1918, RFC 6890, RFC 3927)
  if (isPrivateIpv4(hostname)) throw new SsrfError(`IP privado bloqueado`);
  if (isPrivateIpv6(hostname)) throw new SsrfError(`IPv6 privado bloqueado`);
}
```

Ranges bloqueados: `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16` (cloud metadata), `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fe80::/10`, `fc00::/7`.

### CRUD de Rotas

**Arquivo:** `src/lib/actions/webhook-routes.ts`

Server Actions para gerenciar rotas de webhook com:

- **Controle de acesso:** `viewer` nao pode mutar, `manager`/`admin`/`super_admin` podem
- **Tenant isolation:** `assertCompanyAccess` garante que o usuario pertence a empresa
- **Validacao:** Zod schema, unicidade de nome e URL por empresa
- **Criptografia:** `secretKey` criptografada com `encrypt()` antes de persistir
- **Seguranca:** `secretKey` nunca retornada em listagens (exibe `****` na UI)

Operacoes disponiveis:
- `createWebhookRoute` -- criar nova rota com validacao de duplicidade
- `updateWebhookRoute` -- editar rota existente (PATCH semantics)
- `hardDeleteWebhookRoute` -- excluir rota (bloqueado se tem deliveries vinculadas)
- `toggleWebhookRouteActive` -- ativar/desativar rota
- `listWebhookRoutes` -- listar rotas da empresa (sem secretKey)
- `getWebhookRoute` -- buscar rota individual para edicao (sem secretKey)

## Como Adaptar para Outro Projeto

### 1. Implementar Verificacao de Assinatura para seu Provedor

Cada provedor tem seu proprio esquema de assinatura:

| Provedor | Header | Algoritmo |
|----------|--------|-----------|
| Meta (WhatsApp/Instagram) | `X-Hub-Signature-256` | HMAC-SHA256 do body com app_secret |
| Stripe | `Stripe-Signature` | HMAC-SHA256 com timestamp + payload |
| GitHub | `X-Hub-Signature-256` | HMAC-SHA256 do body com webhook secret |
| Twilio | `X-Twilio-Signature` | HMAC-SHA1 da URL + params com auth token |

```typescript
// Exemplo: Stripe
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  endpointSecret: string
): boolean {
  const parts = signatureHeader.split(",");
  const timestamp = parts.find(p => p.startsWith("t="))?.slice(2);
  const signature = parts.find(p => p.startsWith("v1="))?.slice(3);

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", endpointSecret)
    .update(signedPayload)
    .digest("hex");

  return timingSafeEqual(
    Buffer.from(signature!, "hex"),
    Buffer.from(expected, "hex")
  );
}
```

### 2. Implementar Normalizador para seu Provedor

Analise a estrutura do payload do seu provedor e divida em eventos atomicos:

```typescript
// Exemplo: GitHub (cada webhook ja eh um evento unico)
export function normalizeGithubPayload(
  eventHeader: string,  // X-GitHub-Event
  payload: Record<string, unknown>
): NormalizedEvent[] {
  return [{
    eventType: eventHeader,  // "push", "pull_request", "issues"
    sourceId: payload.repository?.id as string,
    payload,
  }];
}
```

### 3. Implementar Deduplicador

Identifique o campo unico do seu provedor:

```typescript
// Exemplo: Stripe (usa event.id)
export function computeStripeDedupeKey(eventId: string): string {
  return sha256(`v1:stripe|${eventId}`);
}

// Exemplo: GitHub (usa X-GitHub-Delivery header)
export function computeGithubDedupeKey(deliveryId: string): string {
  return sha256(`v1:github|${deliveryId}`);
}
```

### 4. Definir Modelo de Rota

Adapte o modelo de rota para seu caso de uso:

```prisma
model WebhookRoute {
  id        String   @id @default(uuid())
  tenantId  String   // Multi-tenant isolation
  name      String
  url       String   // Destino HTTPS
  secretKey String?  // Para assinatura outbound (criptografado)
  events    Json     // ["push", "pull_request"] ou ["*"]
  headers   Json?    // Headers custom
  timeoutMs Int      @default(5000)
  isActive  Boolean  @default(true)
}
```

### 5. Reutilizar o Pattern de Queue

O pipeline de entrega (enqueue, worker, retry, DLQ, orphan recovery) eh generico e pode ser reutilizado integralmente. Consulte `blueprint/patterns/queue.md` para detalhes.

### 6. Adicionar Protecao SSRF

Copie `src/lib/webhook/ssrf.ts` e ajuste conforme necessidade. A validacao de URLs de destino eh essencial para evitar que usuarios configurem rotas apontando para servicos internos.

## Arquivos de Referencia

| Arquivo | Descricao |
|---------|-----------|
| `src/app/api/webhook/[webhookKey]/route.ts` | API Route: GET (challenge) + POST (ingest completo) |
| `src/lib/webhook/signature.ts` | Verificacao HMAC-SHA256 (Meta X-Hub-Signature-256) |
| `src/lib/webhook/normalizer.ts` | Normalizacao multi-evento (callback Meta → N eventos atomicos) |
| `src/lib/webhook/deduplicator.ts` | Deduplicacao versionada SHA-256 (v1) com janela 24h |
| `src/lib/webhook/ssrf.ts` | Validacao SSRF de URLs de destino (HTTPS only, IPs privados bloqueados) |
| `src/lib/actions/webhook-routes.ts` | CRUD de rotas: create, update, delete, toggle, list |
| `src/lib/schemas/webhook-route.ts` | Schemas Zod para validacao de input de rotas |
| `src/lib/queue.ts` | Definicao das queues BullMQ (webhook-delivery + webhook-dlq) |
| `src/lib/encryption.ts` | Encrypt/decrypt para secretKey e credentials |
| `src/lib/audit.ts` | Registro de audit log (assinatura invalida, etc.) |
| `src/worker/delivery.ts` | Worker de entrega (processamento pos-enqueue) |
| `src/worker/orphan-recovery.ts` | Recovery de entregas orfas (compensacao Redis down) |
| `src/app/api/webhook/__tests__/webhook-ingest.test.ts` | Testes do endpoint de ingest |
| `src/lib/webhook/__tests__/signature.test.ts` | Testes da verificacao de assinatura |
| `src/lib/webhook/__tests__/normalizer.test.ts` | Testes do normalizador multi-evento |
| `src/lib/webhook/__tests__/deduplicator.test.ts` | Testes do deduplicador |
| `src/lib/webhook/__tests__/ssrf.test.ts` | Testes da validacao SSRF |
