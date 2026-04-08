# Modulo: Audit Log

## Resumo

Registro fire-and-forget de acoes do sistema (quem fez o que, quando, de onde).
Toda operacao critica (login, CRUD de credenciais, reenvio de webhooks, cleanups automaticos) gera um registro imutavel na tabela `audit_logs`.
Erros de gravacao sao capturados no console mas nunca propagados, garantindo que o fluxo principal do usuario jamais seja interrompido.

## Dependencias

- **Obrigatorias:** core (auth) -- precisa do modelo `User` para a relacao `actor`
- **Opcionais:** multi-tenant -- campo `companyId` vincula o log a uma empresa quando aplicavel
- **Servicos:** PostgreSQL (tabela `audit_logs` com coluna JSONB para `details`)

## Pacotes npm

Nenhum alem do core. Usa apenas o Prisma Client ja presente no projeto.

## Schema Prisma

```prisma
model AuditLog {
  id           String    @id @default(uuid()) @db.Uuid
  actorType    ActorType @map("actor_type")
  actorId      String?   @map("actor_id") @db.Uuid
  actorLabel   String    @map("actor_label")
  companyId    String?   @map("company_id") @db.Uuid
  action       String
  resourceType String    @map("resource_type")
  resourceId   String?   @map("resource_id") @db.Uuid
  details      Json      @db.JsonB
  ipAddress    String?   @map("ip_address")
  userAgent    String?   @map("user_agent")
  createdAt    DateTime  @default(now()) @map("created_at")

  actor        User?     @relation("AuditActor", fields: [actorId], references: [id], onDelete: Restrict)
  company      Company?  @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([companyId, createdAt(sort: Desc)], name: "idx_audit_company")
  @@map("audit_logs")
}

enum ActorType {
  user
  system
}
```

### Campos

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|-------------|-----------|
| `id` | UUID | Sim (auto) | Chave primaria |
| `actorType` | `ActorType` | Sim | `user` para acoes humanas, `system` para jobs automaticos |
| `actorId` | UUID | Nao | ID do usuario (nulo quando `actorType = system`) |
| `actorLabel` | String | Sim | Identificador legivel (email do usuario ou nome do job) |
| `companyId` | UUID | Nao | Empresa associada (nulo para acoes globais) |
| `action` | String | Sim | Acao padronizada no formato `dominio.verbo` (ex: `auth.login`) |
| `resourceType` | String | Sim | Tipo do recurso afetado (nome do modelo Prisma ou entidade) |
| `resourceId` | UUID | Nao | ID do recurso especifico afetado |
| `details` | JSONB | Sim | Dados adicionais da acao (formato livre, nunca contem segredos) |
| `ipAddress` | String | Nao | IP do requisitante (capturado em acoes HTTP) |
| `userAgent` | String | Nao | User-Agent do navegador (capturado em acoes HTTP) |
| `createdAt` | DateTime | Sim (auto) | Timestamp de criacao |

### Relacoes

- `actor` -> `User` (opcional, relacao nomeada `AuditActor`)
- `company` -> `Company` (opcional)

### Indices

- `idx_audit_company` em `(companyId, createdAt DESC)` -- consultas por empresa ordenadas por data

## Variaveis de ambiente

Nenhuma. O modulo usa a conexao PostgreSQL ja configurada pelo core (`DATABASE_URL`).

## Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/audit.ts` | Funcao `logAudit()`, tipo `ActorType`, interface `LogAuditParams` |
| `src/lib/__tests__/audit.test.ts` | Testes unitarios (mock do Prisma) |

## Server Actions

### `logAudit(params: LogAuditParams): Promise<void>`

**Arquivo:** `src/lib/audit.ts`

**Interface de parametros:**

```typescript
export type ActorType = "user" | "system";

export interface LogAuditParams {
  actorType: ActorType;
  actorId?: string;
  actorLabel: string;
  companyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
```

**Comportamento:**

1. Recebe os parametros via `LogAuditParams`
2. Chama `prisma.auditLog.create()` com os dados mapeados
3. Em caso de erro, loga no console com `console.error("[audit] Falha ao registrar audit log:", error)`
4. **Nunca propaga excecoes** -- o `try/catch` garante que o fluxo principal nao e afetado
5. Retorna `Promise<void>` (sem valor de retorno)

**Implementacao completa:**

```typescript
import { prisma } from "./prisma";

export type ActorType = "user" | "system";

export interface LogAuditParams {
  actorType: ActorType;
  actorId?: string;
  actorLabel: string;
  companyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        actorLabel: params.actorLabel,
        companyId: params.companyId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        details: params.details as object,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    console.error("[audit] Falha ao registrar audit log:", error);
  }
}
```

**Padrao de chamada (fire-and-forget):**

Quando nao e necessario aguardar a gravacao, chamar sem `await`:

```typescript
// Fire-and-forget (nao bloqueia o response)
logAudit({
  actorType: "user",
  actorId: user.id,
  actorLabel: user.email,
  action: "auth.login",
  resourceType: "User",
  resourceId: user.id,
  details: {},
  ipAddress: ipAddress,
});
```

Quando e importante garantir a gravacao antes de continuar (ex: cleanup jobs):

```typescript
// Aguarda gravacao
await logAudit({
  actorType: "system",
  actorLabel: "log-cleanup",
  action: "cleanup.logs",
  resourceType: "InboundWebhook",
  details: { deletedCount: 42 },
});
```

## Acoes padronizadas

### Acoes de usuario (`actorType: "user"`)

| Acao | resourceType | Onde e chamada | Descricao |
|------|-------------|----------------|-----------|
| `auth.login` | `User` | `src/lib/auth-helpers.ts` | Login bem-sucedido (inclui IP e User-Agent) |
| `credential.create` | `CompanyCredential` | `src/lib/actions/credential.ts` | Credencial WhatsApp criada |
| `credential.update` | `CompanyCredential` | `src/lib/actions/credential.ts` | Credencial WhatsApp atualizada |
| `delivery.resend` | `route_delivery` | `src/lib/actions/resend.ts` | Reenvio individual de webhook |
| `delivery.resend_batch` | `route_delivery` | `src/lib/actions/resend.ts` | Reenvio em lote de webhooks |

### Acoes de sistema (`actorType: "system"`)

| Acao | resourceType | Onde e chamada | Descricao |
|------|-------------|----------------|-----------|
| `auth.invalid_signature` | `InboundWebhook` | `src/app/api/webhook/[webhookKey]/route.ts` | Assinatura X-Hub-Signature-256 invalida |
| `cleanup.logs` | `InboundWebhook` | `src/worker/log-cleanup.ts` | Job de limpeza de logs antigos |
| `cleanup.notifications` | `Notification` | `src/worker/notification-cleanup.ts` | Job de limpeza de notificacoes |
| `delivery.orphan_recovery` | `RouteDelivery` | `src/worker/orphan-recovery.ts` | Recuperacao de deliveries orfas |

### Convencao de nomenclatura

- Formato: `dominio.verbo` (ex: `auth.login`, `credential.create`)
- Dominios existentes: `auth`, `credential`, `delivery`, `cleanup`
- Verbos comuns: `create`, `update`, `delete`, `login`, `logout`, `resend`, `resend_batch`
- Para novas plataformas: adaptar os dominios e verbos conforme a entidade (ex: `order.create`, `payment.refund`)

## Componentes UI

Nenhum. O Audit Log e exclusivamente backend.

**Possivel extensao futura:** pagina de visualizacao de audit logs para super admins, com filtros por empresa, usuario, acao e periodo. Nao implementada no Nexus atual.

## Integracao (o que muda em arquivos existentes)

| Arquivo | Mudanca |
|---------|---------|
| `prisma/schema.prisma` | Adicionar model `AuditLog` e enum `ActorType`. Adicionar relacao `auditLogs AuditLog[]` nos models `User` (nomeada `AuditActor`) e `Company` |
| `src/lib/auth-helpers.ts` | Importar `logAudit` e chamar fire-and-forget apos login bem-sucedido (`auth.login`) com IP e User-Agent |
| `src/lib/actions/credential.ts` | Importar `logAudit` e chamar fire-and-forget apos `credential.create` e `credential.update` |
| `src/lib/actions/resend.ts` | Importar `logAudit` e chamar fire-and-forget apos `delivery.resend` e `delivery.resend_batch` |
| `src/app/api/webhook/[webhookKey]/route.ts` | Importar `logAudit` e chamar com `await` quando assinatura e invalida (`auth.invalid_signature`) |
| `src/worker/log-cleanup.ts` | Importar `logAudit` e chamar com `await` ao final do job (`cleanup.logs`) |
| `src/worker/notification-cleanup.ts` | Importar `logAudit` e chamar com `await` ao final do job (`cleanup.notifications`) |
| `src/worker/orphan-recovery.ts` | Importar `logAudit` e chamar fire-and-forget quando ha recuperacoes (`delivery.orphan_recovery`) |

## Referencia no Nexus

| Recurso | Caminho |
|---------|---------|
| Funcao principal | `src/lib/audit.ts` |
| Testes unitarios | `src/lib/__tests__/audit.test.ts` |
| Schema Prisma | `prisma/schema.prisma` (model `AuditLog`, enum `ActorType`) |
| Chamada no login | `src/lib/auth-helpers.ts` (linha ~62) |
| Chamada em credenciais | `src/lib/actions/credential.ts` (linha ~201) |
| Chamada em reenvio | `src/lib/actions/resend.ts` (linhas ~78 e ~184) |
| Chamada em webhook ingest | `src/app/api/webhook/[webhookKey]/route.ts` (linha ~110) |
| Worker log-cleanup | `src/worker/log-cleanup.ts` (linha ~100) |
| Worker notification-cleanup | `src/worker/notification-cleanup.ts` (linha ~43) |
| Worker orphan-recovery | `src/worker/orphan-recovery.ts` (linha ~103) |

## Customizacoes por plataforma

| Aspecto | Padrao no Nexus | O que personalizar |
|---------|----------------|--------------------|
| Nomes de acoes | `auth.*`, `credential.*`, `delivery.*`, `cleanup.*` | Adaptar dominios para a entidade da plataforma (ex: `order.create`, `payment.refund`, `user.deactivate`) |
| Tipos de recurso | `User`, `CompanyCredential`, `InboundWebhook`, `RouteDelivery`, `Notification` | Usar os nomes dos models Prisma da plataforma |
| Retencao de logs | Sem limpeza automatica (cresce indefinidamente) | Criar job de cleanup similar ao `log-cleanup.ts` com politica de retencao (ex: 90 dias) |
| Campos `details` | Formato livre (`Record<string, unknown>`) | Definir schemas tipados por acao se necessario (ex: Zod schemas para validar o conteudo) |
| IP e User-Agent | Capturados apenas em acoes HTTP (login, webhook) | Estender captura para todas as Server Actions via `headers()` do Next.js |
| Relacao com empresa | Opcional (`companyId?`) | Tornar obrigatorio se toda acao e sempre vinculada a um tenant |

## Seguranca

- **Fire-and-forget:** a funcao `logAudit()` nunca bloqueia o fluxo do usuario, mesmo em caso de falha no banco de dados
- **Rastreamento de IP:** o campo `ipAddress` captura o IP do requisitante para acoes HTTP (login, webhook ingest)
- **User-Agent:** o campo `userAgent` registra o navegador/cliente usado na requisicao
- **Imutabilidade:** registros de audit nunca sao atualizados ou deletados pela aplicacao (append-only)
- **Sem segredos:** o campo `details` nunca deve conter senhas, tokens ou chaves de API. No Nexus, apenas o `metaAppId` e registrado (nunca `metaAppSecret` ou `accessToken`)
- **Restricao de exclusao:** as relacoes com `User` e `Company` usam `onDelete: Restrict`, impedindo exclusao acidental de usuarios/empresas que tenham audit logs vinculados
- **Console logging:** erros de gravacao sao logados via `console.error` para monitoramento, sem expor detalhes ao usuario final
