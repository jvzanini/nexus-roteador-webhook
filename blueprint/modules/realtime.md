# Modulo: Realtime

## Resumo

Comunicacao em tempo real entre servidor e clientes via Server-Sent Events (SSE) sobre Redis Pub/Sub.
O backend publica eventos no canal Redis `nexus:realtime` usando `publishRealtimeEvent()`. Clientes browser conectam no endpoint SSE `/api/events`, que cria um subscriber Redis dedicado e faz streaming dos eventos. O hook React `useRealtime()` gerencia a conexao EventSource com auto-reconnect de 5 segundos.

A abordagem e best-effort: falhas na publicacao ou na conexao SSE nunca interrompem o fluxo principal. O sistema complementa o polling existente, nao o substitui.

## Dependencias

- **Obrigatorias:** Redis 7 -- Pub/Sub para broadcast de eventos entre processos (worker -> API -> browser)
- **Opcionais:** nenhuma

## Pacotes npm

| Pacote | Versao | Uso |
|--------|--------|-----|
| `ioredis` | ^5.x | Cliente Redis para publicacao e subscricao no canal Pub/Sub |

## Schema Prisma

Nenhum. O modulo realtime nao persiste dados -- eventos sao transientes e entregues apenas a clientes conectados no momento da publicacao.

## Variaveis de ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `REDIS_URL` | Sim | URL de conexao Redis (ex: `redis://redis:6379`). Quando ausente em build time, o client e criado com `lazyConnect: true`. O endpoint SSE retorna 503 se nao configurada. |

## Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/redis.ts` | Singleton do cliente Redis com cache no `globalThis` (dev hot-reload safe) |
| `src/lib/realtime.ts` | Funcao `publishRealtimeEvent()`, tipo `RealtimeEvent`, constante `CHANNEL` |
| `src/hooks/use-realtime.ts` | Hook React `useRealtime(onEvent)` com EventSource e auto-reconnect |
| `src/app/api/events/route.ts` | Endpoint SSE que cria subscriber Redis dedicado e faz streaming dos eventos |

## Server Actions / Functions

### `createRedisClient(): IORedis`

**Arquivo:** `src/lib/redis.ts`

**Comportamento:**

1. Le `REDIS_URL` de `process.env`
2. Se ausente (build time), retorna client com `lazyConnect: true`
3. Se presente, cria client com `maxRetriesPerRequest: null` (necessario para BullMQ e subscriptions de longa duracao)
4. O client e cacheado em `globalThis` em dev para sobreviver a hot-reload

**Implementacao completa:**

```typescript
import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

function createRedisClient(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) {
    // Build time: REDIS_URL nao existe, retorna client com lazyConnect
    return new IORedis({ lazyConnect: true });
  }
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
```

---

### `publishRealtimeEvent(event: RealtimeEvent): Promise<void>`

**Arquivo:** `src/lib/realtime.ts`

**Tipo `RealtimeEvent` (union completa):**

```typescript
export type RealtimeEvent =
  | { type: "delivery:completed"; companyId: string }
  | { type: "delivery:failed"; companyId: string }
  | { type: "notification:new"; userId: string }
  | { type: "webhook:received"; companyId: string };
```

| Variante | Payload | Publicado por | Descricao |
|----------|---------|---------------|-----------|
| `delivery:completed` | `companyId` | `src/worker/delivery.ts` | Entrega de webhook concluida com sucesso |
| `delivery:failed` | `companyId` | `src/worker/delivery.ts` | Entrega de webhook falhou apos todas as tentativas |
| `notification:new` | `userId` | `src/lib/notifications.ts` | Nova notificacao criada para um usuario (super admin) |
| `webhook:received` | `companyId` | `src/app/api/webhook/[webhookKey]/route.ts` | Webhook recebido da Meta e processado |

**Comportamento:**

1. Serializa o evento com `JSON.stringify()`
2. Publica no canal Redis `nexus:realtime` via `redis.publish()`
3. Em caso de erro, loga no console com `console.error("[realtime] Falha ao publicar evento:", ...)`
4. **Nunca propaga excecoes** -- o `try/catch` garante que o fluxo principal nao e afetado

**Implementacao completa:**

```typescript
import { redis } from "./redis";

// Canal unico para eventos real-time
const CHANNEL = "nexus:realtime";

export type RealtimeEvent =
  | { type: "delivery:completed"; companyId: string }
  | { type: "delivery:failed"; companyId: string }
  | { type: "notification:new"; userId: string }
  | { type: "webhook:received"; companyId: string };

export async function publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
  try {
    await redis.publish(CHANNEL, JSON.stringify(event));
  } catch (err) {
    // Best-effort -- nunca deve falhar operacoes principais
    console.error("[realtime] Falha ao publicar evento:", (err as Error).message);
  }
}

export { CHANNEL };
```

**Padrao de chamada (sempre com await):**

```typescript
// No worker de delivery, apos sucesso
await publishRealtimeEvent({ type: "delivery:completed", companyId: result.companyId });

// No worker de delivery, apos falha definitiva
await publishRealtimeEvent({ type: "delivery:failed", companyId: result.companyId });

// No helper de notificacoes, apos criar notificacao para cada super admin
for (const admin of superAdmins) {
  await publishRealtimeEvent({ type: "notification:new", userId: admin.id });
}
```

---

### `GET /api/events` (SSE endpoint)

**Arquivo:** `src/app/api/events/route.ts`

**Configuracao de rota:**

```typescript
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
```

**Comportamento:**

1. Verifica se `REDIS_URL` esta configurada. Se nao, retorna `503 Service Unavailable`
2. Cria um subscriber Redis **dedicado** (Redis exige conexao separada para `SUBSCRIBE`)
3. Abre um `ReadableStream` com encoding `text/event-stream`
4. Configura heartbeat a cada 30 segundos (comentario SSE `: heartbeat\n\n`) para manter a conexao viva
5. Faz subscribe no canal `nexus:realtime` e encaminha mensagens como `data: ${message}\n\n`
6. Quando o cliente desconecta (signal `abort`), faz cleanup: unsubscribe + quit do subscriber

**Implementacao completa:**

```typescript
import { NextRequest } from "next/server";
import IORedis from "ioredis";
import { CHANNEL } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = process.env.REDIS_URL;
  if (!url) {
    return new Response("Redis not configured", { status: 503 });
  }

  // Criar subscriber dedicado (Redis requer conexao separada para subscribe)
  const subscriber = new IORedis(url, { maxRetriesPerRequest: null });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Heartbeat para manter conexao viva
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Stream ja fechada
        }
      }, 30000);

      subscriber.subscribe(CHANNEL).then(() => {
        subscriber.on("message", (_channel: string, message: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          } catch {
            // Stream ja fechada
          }
        });
      });

      // Cleanup quando cliente desconecta
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        subscriber.unsubscribe(CHANNEL).catch(() => {});
        subscriber.quit().catch(() => {});
      });
    },
    cancel() {
      closed = true;
      subscriber.unsubscribe(CHANNEL).catch(() => {});
      subscriber.quit().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

**Headers de resposta:**

| Header | Valor | Motivo |
|--------|-------|--------|
| `Content-Type` | `text/event-stream` | Protocolo SSE padrao |
| `Cache-Control` | `no-cache, no-transform` | Impede cache/proxy de bufferizar o stream |
| `Connection` | `keep-alive` | Mantem conexao TCP aberta |

## Componentes UI

### `useRealtime(onEvent: EventHandler): void`

**Arquivo:** `src/hooks/use-realtime.ts`

Hook React que gerencia a conexao EventSource com o endpoint SSE `/api/events`.

**Interface:**

```typescript
type EventHandler = (event: RealtimeEvent) => void;

export function useRealtime(onEvent: EventHandler): void;
```

**Comportamento:**

1. Armazena o handler em `useRef` para evitar reconexoes quando o callback muda
2. Abre `EventSource` para `/api/events` na montagem do componente
3. Ao receber mensagem, faz `JSON.parse()` e chama o handler. Mensagens malformadas sao ignoradas silenciosamente
4. Em caso de erro na conexao (`onerror`), fecha o EventSource e agenda reconexao em 5 segundos
5. No cleanup (unmount), fecha o EventSource e cancela qualquer timer de reconexao

**Implementacao completa:**

```typescript
"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "@/lib/realtime";

type EventHandler = (event: RealtimeEvent) => void;

export function useRealtime(onEvent: EventHandler) {
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      eventSource = new EventSource("/api/events");

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as RealtimeEvent;
          handlerRef.current(event);
        } catch {
          // Ignorar mensagens malformadas
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);
}
```

**Padrao de uso nos componentes:**

```typescript
// NotificationBell: atualiza contagem ao receber notificacao nova
useRealtime(useCallback((event) => {
  if (event.type === "notification:new") {
    getUnreadCount().then(setUnreadCount);
    if (isOpen) {
      getNotifications().then((result) => {
        setNotifications(result.items);
        setUnreadCount(result.unreadCount);
      });
    }
  }
}, [isOpen]));

// DashboardContent: atualiza metricas ao receber eventos de delivery/webhook
useRealtime(useCallback((event) => {
  if (
    event.type === "delivery:completed" ||
    event.type === "delivery:failed" ||
    event.type === "webhook:received"
  ) {
    fetchData();
  }
}, [fetchData]));
```

## Integracao (o que muda em arquivos existentes)

| Arquivo | Mudanca |
|---------|---------|
| `src/worker/delivery.ts` | Importar `publishRealtimeEvent` e chamar com `await` apos delivery concluida (`delivery:completed`) e apos falha definitiva (`delivery:failed`) |
| `src/lib/notifications.ts` | Importar `publishRealtimeEvent` e chamar com `await` apos criar notificacao para cada super admin (`notification:new` com `userId`) |
| `src/app/api/webhook/[webhookKey]/route.ts` | Importar `publishRealtimeEvent` e chamar apos processar webhook recebido (`webhook:received` com `companyId`) |
| `src/components/layout/notification-bell.tsx` | Importar `useRealtime` e escutar `notification:new` para atualizar contagem e lista de notificacoes |
| `src/components/dashboard/dashboard-content.tsx` | Importar `useRealtime` e escutar `delivery:completed`, `delivery:failed` e `webhook:received` para atualizar metricas do dashboard |

## Referencia no Nexus

| Recurso | Caminho |
|---------|---------|
| Cliente Redis singleton | `src/lib/redis.ts` |
| Funcao principal + tipos | `src/lib/realtime.ts` |
| Endpoint SSE | `src/app/api/events/route.ts` |
| Hook React | `src/hooks/use-realtime.ts` |
| Publicacao em delivery | `src/worker/delivery.ts` (linhas ~312 e ~401) |
| Publicacao em notificacoes | `src/lib/notifications.ts` (linha ~61) |
| Consumo no sino | `src/components/layout/notification-bell.tsx` (linha ~66) |
| Consumo no dashboard | `src/components/dashboard/dashboard-content.tsx` (linha ~69) |

## Customizacoes por plataforma

| Aspecto | Padrao no Nexus | O que personalizar |
|---------|----------------|--------------------|
| Nome do canal | `nexus:realtime` (canal unico) | Alterar a constante `CHANNEL` em `src/lib/realtime.ts`. Para multiplos canais, criar canais por empresa (`nexus:realtime:${companyId}`) |
| Tipos de evento | `delivery:completed`, `delivery:failed`, `notification:new`, `webhook:received` | Adicionar novas variantes ao union type `RealtimeEvent` conforme necessidade da plataforma (ex: `order:created`, `payment:received`) |
| Intervalo de heartbeat | 30 segundos | Alterar o valor do `setInterval` no endpoint SSE |
| Intervalo de reconexao | 5 segundos | Alterar o timeout no `onerror` do hook `useRealtime` |
| Filtragem client-side | Cada componente filtra por `event.type` no handler | Para filtragem server-side, criar canais separados por tipo ou por empresa |
| Autenticacao SSE | Nenhuma (endpoint publico) | Adicionar verificacao de sessao no endpoint SSE via `auth()` do NextAuth antes de abrir o stream |

## Seguranca

- **Best-effort:** a funcao `publishRealtimeEvent()` nunca bloqueia nem falha o fluxo principal. Erros sao logados via `console.error` e engolidos
- **Auto-reconnect:** o hook `useRealtime` reconecta automaticamente em 5 segundos apos perda de conexao, sem intervencao do usuario
- **Subscriber isolado:** o endpoint SSE cria uma conexao Redis dedicada por cliente, evitando conflito com o client principal usado por BullMQ e outras operacoes
- **Cleanup garantido:** tanto o hook (no unmount) quanto o endpoint (no abort/cancel) fazem cleanup completo de recursos (EventSource, timers, subscriber Redis)
- **Heartbeat:** comentarios SSE a cada 30 segundos mantem a conexao viva e evitam timeout por proxies/load balancers
- **Mensagens malformadas:** o hook ignora silenciosamente mensagens que nao sao JSON valido, sem quebrar o componente
- **Sem autenticacao no endpoint SSE:** o endpoint `/api/events` e publico. Eventos nao contem dados sensiveis (apenas `type`, `companyId` ou `userId`). Para plataformas com requisitos de seguranca mais rigorosos, adicionar verificacao de sessao
- **Canal unico broadcast:** todos os eventos sao publicados no mesmo canal. A filtragem acontece no client-side (cada componente verifica `event.type` e campos como `companyId`/`userId`). Para escala com muitos clientes, considerar canais por empresa
