# Modulo: Notifications

## Resumo

Feed de notificacoes in-app com badge no header, contagem de nao lidas, marcacao individual e em massa como lida, paginacao cursor-based e integracao real-time via SSE. Notificacoes sao criadas pelo backend (helpers) quando eventos relevantes ocorrem (ex: falha permanente de delivery) e entregues ao usuario via dropdown no header do dashboard.

## Dependencias

- **Obrigatorias:** core (auth — `getCurrentUser` para identificar usuario logado)
- **Opcionais:** realtime (push notifications via SSE — `publishRealtimeEvent`, hook `useRealtime`), multi-tenant (notificacoes scoped por empresa via `companyId`)
- **Servicos:** PostgreSQL (tabela `notifications`)

## Pacotes npm

Nenhum alem do core. Utiliza:
- `framer-motion` (animacao do dropdown — ja no core)
- `lucide-react` (icones Bell, XCircle, AlertTriangle, Info, CheckCheck — ja no core)

## Schema Prisma

```prisma
model Notification {
  id           String           @id @default(uuid()) @db.Uuid
  userId       String?          @map("user_id") @db.Uuid
  companyId    String?          @map("company_id") @db.Uuid
  type         NotificationType
  title        String
  message      String
  link         String
  channelsSent Json             @map("channels_sent") @db.JsonB
  isRead       Boolean          @default(false) @map("is_read")
  createdAt    DateTime         @default(now()) @map("created_at")

  user         User?            @relation(fields: [userId], references: [id], onDelete: Restrict)
  company      Company?         @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([userId, isRead, createdAt(sort: Desc)], name: "idx_notification_user_read")
  @@map("notifications")
}

enum NotificationType {
  error
  warning
  info
}
```

**Notas sobre o schema:**
- `userId` e `companyId` sao opcionais (nullable) para suportar notificacoes globais sem usuario ou empresa especifica.
- `channelsSent` armazena array JSON dos canais por onde a notificacao foi enviada (ex: `["platform"]`). Preparado para futuros canais (email, SMS, push).
- O indice composto `idx_notification_user_read` otimiza a query principal: buscar notificacoes de um usuario ordenadas por data, filtrando por status de leitura.

## Variaveis de ambiente

Nenhuma variavel de ambiente especifica para este modulo.

## Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/actions/notifications.ts` | Server Actions: listar, contar nao lidas, marcar como lida |
| `src/lib/notifications.ts` | Helpers de criacao de notificacoes (usado pelo backend) |
| `src/components/layout/notification-bell.tsx` | Componente UI: sino com badge + dropdown |
| `src/hooks/use-realtime.ts` | Hook SSE para atualizacao real-time (compartilhado com outros modulos) |
| `prisma/schema.prisma` | Modelo `Notification` e enum `NotificationType` (adicionar ao schema existente) |

## Server Actions

### `getNotifications(cursor?: string)`

**Arquivo:** `src/lib/actions/notifications.ts`

```typescript
export async function getNotifications(cursor?: string): Promise<{
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}>
```

**Comportamento:**
- Requer autenticacao via `getCurrentUser()`. Retorna dados vazios se nao autenticado.
- Paginacao cursor-based com tamanho de pagina fixo de 20 itens.
- Ordena por `createdAt` descendente (mais recentes primeiro).
- Retorna `unreadCount` junto com os itens (uma unica chamada para ambos).
- Inclui nome da empresa via relation (`company.name`).
- `nextCursor` e `null` quando nao ha mais paginas.

**Interface de retorno:**
```typescript
export interface NotificationItem {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: Date;
  companyName: string | null;
}
```

---

### `getUnreadCount()`

**Arquivo:** `src/lib/actions/notifications.ts`

```typescript
export async function getUnreadCount(): Promise<number>
```

**Comportamento:**
- Requer autenticacao. Retorna 0 se nao autenticado.
- Conta notificacoes com `isRead: false` para o usuario logado.
- Usada pelo polling de 30 segundos no componente bell.

---

### `markAsRead(notificationId: string)`

**Arquivo:** `src/lib/actions/notifications.ts`

```typescript
export async function markAsRead(notificationId: string): Promise<void>
```

**Comportamento:**
- Requer autenticacao. Nao faz nada se nao autenticado.
- Usa `updateMany` com filtro `userId` para garantir que o usuario so marca suas proprias notificacoes.
- Nao lanca erro se a notificacao nao existir ou ja estiver lida.

---

### `markAllAsRead()`

**Arquivo:** `src/lib/actions/notifications.ts`

```typescript
export async function markAllAsRead(): Promise<void>
```

**Comportamento:**
- Requer autenticacao. Nao faz nada se nao autenticado.
- Atualiza todas as notificacoes nao lidas do usuario logado para `isRead: true`.
- Operacao em massa via `updateMany`.

## Helpers de criacao (backend)

### `createNotification(input)`

**Arquivo:** `src/lib/notifications.ts`

```typescript
interface CreateNotificationInput {
  userId?: string;
  companyId?: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
}

export async function createNotification(input: CreateNotificationInput): Promise<void>
```

**Comportamento:**
- Cria uma notificacao no banco com `channelsSent: ["platform"]`.
- `userId` e `companyId` sao opcionais (defaults para `null`).
- Nao publica evento real-time (a funcao chamadora decide se quer fazer isso).

---

### `notifyDeliveryFailed(params)`

**Arquivo:** `src/lib/notifications.ts`

```typescript
export async function notifyDeliveryFailed(params: {
  companyId: string;
  routeName: string;
  routeDeliveryId: string;
  errorMessage: string;
  attemptCount: number;
}): Promise<void>
```

**Comportamento:**
- Busca todos os super admins (`isSuperAdmin: true`).
- Cria uma notificacao do tipo `error` para cada super admin via `createMany`.
- Titulo: `"Entrega falhou: {routeName}"`.
- Mensagem: `"Falha apos {N} tentativa(s). {errorMessage}"`.
- Link: `/companies/{companyId}`.
- Publica evento `notification:new` via SSE para cada super admin (real-time).

## Componentes UI

### `NotificationBell`

**Arquivo:** `src/components/layout/notification-bell.tsx`

**Tipo:** Client Component (`"use client"`)

**Descricao:** Botao de sino com badge de contagem no header do dashboard. Ao clicar, abre um dropdown animado com a lista de notificacoes.

**Funcionalidades:**
- **Badge:** Mostra contagem de nao lidas (maximo exibido: "9+"). Vermelho (`bg-red-500`).
- **Polling:** Busca contagem de nao lidas a cada 30 segundos via `getUnreadCount()`.
- **Real-time:** Escuta eventos `notification:new` via `useRealtime` hook. Atualiza contagem e lista instantaneamente.
- **Dropdown animado:** Framer Motion com `AnimatePresence`. Variantes: hidden/visible/exit com scale + opacity + translate.
- **Lista:** `ScrollArea` com altura maxima de 320px (`max-h-80`).
- **Marcar como lida:** Clique no item marca como lida e navega para `notification.link`.
- **Marcar todas como lidas:** Botao no header do dropdown (so aparece quando ha nao lidas).
- **Estado vazio:** Icone Bell + "Nenhuma notificacao".
- **Loading:** Spinner animado enquanto carrega.
- **Click outside:** Fecha o dropdown ao clicar fora (`mousedown` event listener).

**Icones por tipo:**
| Tipo | Icone | Cor |
|------|-------|-----|
| `error` | `XCircle` | `text-red-400` |
| `warning` | `AlertTriangle` | `text-amber-400` |
| `info` | `Info` | `text-violet-400` |

**Indicador de nao lida:** Borda esquerda violeta (`border-l-violet-500`) + fundo semitransparente (`bg-accent/20`).

**Helper interno `timeAgo(date)`:** Formata data relativa em portugues — "agora", "X min", "Xh", "Xd".

## Integracao (o que muda em arquivos existentes)

| Arquivo | Mudanca |
|---------|---------|
| `src/components/dashboard/dashboard-content.tsx` | Importa e renderiza `<NotificationBell />` no header do dashboard (ao lado do titulo) |
| `prisma/schema.prisma` | Adicionar model `Notification`, enum `NotificationType`, e relations em `User` e `Company` |
| `src/lib/realtime.ts` | Deve exportar `publishRealtimeEvent` e tipo `RealtimeEvent` (usado pelo helper `notifyDeliveryFailed`) |
| `src/hooks/use-realtime.ts` | Hook SSE compartilhado — conecta em `/api/events`, reconecta automaticamente a cada 5s em caso de erro |
| Worker/processor de deliveries | Chamar `notifyDeliveryFailed()` quando uma entrega falha permanentemente |

## Referencia no Nexus

| Arquivo | Caminho |
|---------|---------|
| Server Actions | `src/lib/actions/notifications.ts` |
| Helpers de criacao | `src/lib/notifications.ts` |
| Componente bell | `src/components/layout/notification-bell.tsx` |
| Hook real-time | `src/hooks/use-realtime.ts` |
| Schema Prisma | `prisma/schema.prisma` (model Notification, enum NotificationType) |
| Uso no dashboard | `src/components/dashboard/dashboard-content.tsx` |

## Customizacoes por plataforma

| Aspecto | Valor padrao | Customizavel |
|---------|-------------|--------------|
| **Tipos de notificacao** | `error`, `warning`, `info` | Sim — estender enum `NotificationType` no schema |
| **Canais de entrega** | `["platform"]` (in-app apenas) | Sim — campo `channelsSent` preparado para `email`, `sms`, `push` |
| **Tamanho da pagina** | 20 itens | Sim — constante `pageSize` em `getNotifications` |
| **Intervalo de polling** | 30 segundos | Sim — constante no `useEffect` do `NotificationBell` |
| **Reconexao SSE** | 5 segundos | Sim — timeout no `onerror` do `useRealtime` |
| **Retencao** | Sem limite (sem limpeza automatica) | Recomendado: implementar job de limpeza (ex: remover notificacoes lidas com mais de 90 dias) |
| **Badge maximo** | "9+" | Sim — logica `badgeText` no componente |

## Seguranca

- **Isolamento por usuario:** Todas as queries filtram por `userId` do usuario autenticado. Um usuario nunca ve notificacoes de outro.
- **Validacao de propriedade no markAsRead:** Usa `updateMany` com `where: { id, userId }` — impede que um usuario marque notificacoes de outro como lidas.
- **Autenticacao obrigatoria:** Todas as Server Actions verificam `getCurrentUser()` e retornam dados vazios/nulos se nao autenticado. Nao lancam erro (fail silently).
- **Criacao apenas server-side:** As funcoes `createNotification` e `notifyDeliveryFailed` nao sao Server Actions (nao tem `"use server"`) — so podem ser chamadas pelo backend (workers, API routes).
- **onDelete Restrict:** Relations com `User` e `Company` usam `Restrict` — nao e possivel deletar um usuario ou empresa que tenha notificacoes associadas sem trata-las antes.
- **Sem endpoint de criacao publico:** Nao existe Server Action ou API route para criar notificacoes. A criacao e exclusivamente interna (backend).
