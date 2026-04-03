# Nexus Roteador Webhook — Design Spec

**Data:** 2026-04-03
**Status:** Aprovado (v7 — versão final)
**Domínio:** roteadorwebhook.nexusai360.com

---

## 1. Visão Geral

Plataforma interna para roteamento inteligente de webhooks da Meta (WhatsApp Cloud API). Recebe webhooks de apps da Meta e os distribui para múltiplas URLs de destino configuráveis por empresa, com controle granular de eventos, monitoramento em tempo real e sistema de notificações.

### Problema
A Meta permite apenas uma URL de webhook por aplicativo. Isso limita o uso dos eventos do WhatsApp Cloud API a um único destino.

### Solução
Um roteador intermediário que recebe o webhook da Meta e o replica para N destinos cadastrados, filtrando por tipo de evento, com retry automático, logs detalhados e dashboard de monitoramento.

### Regras de Negócio Fundamentais
- Cada empresa corresponde a **uma integração Meta** (1 App ID, 1 App Secret, 1 Verify Token). Se o cliente tiver múltiplos apps, cadastra-se como empresas separadas.
- Entrega é **at-least-once**: o sistema garante que todo webhook válido será entregue pelo menos uma vez a cada rota ativa que aceita aquele evento.
- O webhook inbound é **persistido antes do ACK** para a Meta. Se a persistência falhar, retorna erro e a Meta reenvia.
- Plataforma de uso **exclusivamente interno** — sem auto-cadastro de usuários.

---

## 2. Arquitetura

```
Internet (Meta Webhook)
        │
        ▼
   Cloudflare (DNS + SSL)
        │
        ▼
   Traefik (Reverse Proxy)
        │
        ▼
┌─────────────────────────────────────────┐
│  Docker Stack (Portainer)               │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Next.js App (Container 1)      │    │
│  │  ├─ Frontend (React/SSR)        │    │
│  │  ├─ API Routes (admin)          │    │
│  │  ├─ Webhook Receiver (ingest)   │    │
│  │  └─ Socket.io Server            │    │
│  └─────────┬──────┬────────────────┘    │
│            │      │                     │
│  ┌─────────┴──────┴────────────────┐    │
│  │  Worker BullMQ (Container 2)    │    │
│  │  ├─ webhook-delivery            │    │
│  │  ├─ webhook-retry               │    │
│  │  ├─ notification-dispatcher     │    │
│  │  ├─ log-cleanup                 │    │
│  │  ├─ health-check               │    │
│  │  └─ orphan-recovery            │    │
│  └─────────┬──────┬────────────────┘    │
│            │      │                     │
│     ┌──────┘      └──────┐              │
│     ▼                    ▼              │
│  ┌──────────┐    ┌───────────┐          │
│  │ PostgreSQL│    │   Redis   │          │
│  │(Container │    │(Container │          │
│  │    3)     │    │    4)     │          │
│  └──────────┘    └───────────┘          │
└─────────────────────────────────────────┘
```

**Separação de responsabilidades:**
- **Container 1 (app):** Frontend SSR, APIs administrativas, webhook receiver (ingest) e Socket.io. **Caminho crítico do ingest (síncrono):** receber, validar, persistir e materializar RouteDeliveries no banco. **Pós-commit (assíncrono, best-effort):** enfileirar jobs no BullMQ. Não processa entregas.
- **Container 2 (worker):** Processo independente BullMQ. Consome filas, entrega webhooks, processa retries, envia notificações, faz health checks e cleanup. Pode escalar horizontalmente sem impactar o app.
- **Container 3 (db):** PostgreSQL 16.
- **Container 4 (redis):** Redis 7 (filas BullMQ + cache de dados frequentes). **Não armazena sessões** — autenticação usa JWT stateless via NextAuth.

### Fluxo do Webhook (detalhado)

1. Meta envia POST para `roteadorwebhook.nexusai360.com/api/webhook/{webhook_key}`
2. App busca empresa pelo `webhook_key` (identificador opaco, não o UUID interno)
3. Valida assinatura X-Hub-Signature-256 com App Secret da empresa
4. **Armazena o raw body original como TEXT** (ver `InboundWebhook.raw_body`) para preservar o byte stream exato recebido. O payload também é parseado e armazenado como JSONB (`raw_payload`) para queries
5. **Normalização multi-evento:** um callback da Meta pode conter múltiplos itens lógicos (ex: 3 mensagens no mesmo POST, ou 2 statuses). O ingest **itera e divide** o callback em N eventos normalizados internos:
   ```
   Para cada entry em payload.entry:
     Para cada change em entry.changes:
       Se change.field == "messages":
         Para cada message em change.value.messages (se existir):
           → 1 InboundWebhook com event_type normalizado
         Para cada status em change.value.statuses (se existir):
           → 1 InboundWebhook com event_type normalizado
       Senão (account_update, flows, etc.):
         → 1 InboundWebhook com event_type = change.field
   ```
   Cada InboundWebhook gerado tem sua própria `dedupe_key`, `event_type` e RouteDeliveries. Isso garante que cada evento lógico é roteado, deduplicado e rastreado independentemente
6. Calcula `dedupe_key` para cada evento normalizado, com algoritmo determinístico:
   ```
   Passo 1: Extrair campos do evento:
     a = entry.id                         (WABA ID)
     b = event_type normalizado           (ex: "statuses.delivered")
     c = identifiers específicos por tipo:
         messages: message.id             (wamid único)
         statuses: status.id + ":" + status.status  (wamid + sent/delivered/read/failed)
         calls:    call.id
         outros:   SHA-256 do JSON do trecho change.value (hash do conteúdo relevante)
   
   Passo 2: dedupe_key = SHA-256("v1:" + a + "|" + b + "|" + c)
   ```
   **Colisão resolvida para statuses:** `status.id + ":" + status.status` distingue sent/delivered/read do mesmo wamid. Para eventos sem ID (account_update, etc.), o hash do trecho relevante evita falsos duplicados entre eventos legítimos diferentes
7. Verifica deduplicação: busca `dedupe_key` no `InboundWebhook` com `created_at > NOW() - 24h`. Implementado via índice composto `(dedupe_key, created_at DESC)` com query filtrada por janela temporal (não partial index — é índice composto regular com WHERE na query). Se duplicado, pula este evento (os demais do mesmo callback continuam sendo processados)
8. **Transação no banco (PostgreSQL) — por evento normalizado:**
   - Persiste `InboundWebhook` com `processing_status = received`
   - Materializa um `RouteDelivery` com `status = pending` para cada rota ativa que aceita o `event_type`
   - COMMIT da transação
   - **Invariante:** `RouteDelivery.company_id` deve ser igual ao `company_id` da rota referenciada. Validado na materialização para prevenir mismatch entre rota e empresa
9. **Enfileiramento pós-commit (Redis/BullMQ):**
   - Para cada `RouteDelivery` criada, enfileira job no BullMQ
   - Se todos os enqueues tiverem sucesso, atualiza `InboundWebhook.processing_status` para `queued` (UPDATE separado, fora da transação original)
   - **Se o enqueue falhar** (Redis down, crash, deploy): as RouteDeliveries já estão persistidas no banco com `status = pending`. O job `orphan-recovery` detecta e reenfileira automaticamente (consistência eventual compensada)
10. Retorna HTTP 200 para a Meta (ACK) — **após todos os COMMITs do passo 8**, não após o enqueue. Isso garante persist-before-ACK mesmo que o Redis falhe
11. Worker processa cada job:
    - Atualiza `RouteDelivery.status` para `delivering`
    - Valida URL de destino (proteção SSRF)
    - **Monta o payload de entrega:** cada RouteDelivery envia o **evento normalizado individual** (não o callback original inteiro). O corpo enviado é o JSON do evento isolado, serializado de forma canônica pelo sistema. A assinatura `X-Nexus-Signature-256` é calculada sobre esse corpo serializado (não sobre o `raw_body` original do callback). Isso garante que: (a) cada destino recebe exatamente o evento que lhe interessa; (b) a assinatura corresponde ao corpo efetivamente entregue
    - Cria `DeliveryAttempt` com resultado
    - Atualiza `RouteDelivery.status` para `delivered` ou `retrying`/`failed`
12. Se falhou com status retriable, agenda retry conforme configuração global
13. Se atingiu limite de retries ou falhou com status não-retriable, marca como `failed` e dispara notificação
14. Dashboard atualiza em tempo real via Socket.io

### Job de Recuperação (orphan-recovery) — Core de Confiabilidade
Este job é o **mecanismo compensatório** que garante consistência eventual entre PostgreSQL e Redis. Como banco e fila não compartilham transação ACID, o orphan-recovery é o que fecha o contrato de at-least-once delivery.
- Roda a cada 5 minutos (**valor inicial**, não definitivo — validar em produção conforme volume real. Se a carga exigir entrega mais rápida de órfãos, reduzir para 1-2 minutos. Trade-off: intervalos menores = mais queries no banco)
- Busca `RouteDelivery` com:
  - status `pending` ou `delivering` há mais de 2 minutos, OU
  - status `retrying` com `next_retry_at <= NOW()` há mais de 2 minutos (retry agendado mas job perdido)
- Verifica se existe job correspondente na fila BullMQ
- Se não existe, reenfileira
- Cobre os cenários: crash do worker, falha no enqueue pós-commit, restart/deploy, Redis restart, **retry agendado mas job perdido no BullMQ**
- **Classificação: Fase 1 (core)** — nasce junto com o ingest e o worker, não é funcionalidade operacional opcional

---

## 3. Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 14+ (App Router, Server Components, Server Actions) |
| Linguagem | TypeScript |
| UI | Tailwind CSS + shadcn/ui + Framer Motion |
| Ícones | Lucide React |
| Autenticação | NextAuth.js v5 (Auth.js) |
| ORM | Prisma |
| Banco de dados | PostgreSQL 16 |
| Cache/Filas | Redis 7 + BullMQ |
| Tempo real | Socket.io |
| E-mail | Resend + react-email |
| Criptografia | crypto (Node.js nativo, AES-256-GCM) |
| Validação | Zod |
| HTTP client | axios |

---

## 4. Modelo de Dados

### User
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| name | String | |
| email | String (unique) | |
| password | String | bcrypt hash (12 salt rounds) |
| is_super_admin | Boolean | default: false. Único flag global. `true` = acesso total sem membership |
| avatar_url | String (nullable) | |
| theme | Enum | dark, light, system |
| is_active | Boolean | default: true |
| invited_by | UUID (FK → User, nullable) | |
| created_at | DateTime | |
| updated_at | DateTime | |

**Nota:** Não existe `role` no User. `is_super_admin = true` dá acesso total. Todos os outros papéis (company_admin, manager, viewer) são definidos por empresa via `UserCompanyMembership`. Um usuário sem membership ativa e sem `is_super_admin` não acessa nada.

### UserCompanyMembership
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK → User) | |
| company_id | UUID (FK → Company) | |
| role | Enum | company_admin, manager, viewer |
| is_active | Boolean | default: true |
| created_at | DateTime | |
| updated_at | DateTime | |

**Constraint:** UNIQUE(user_id, company_id)

**Regras de tenant scoping:**
- `is_super_admin = true` acessa todas as empresas sem membership
- Demais usuários só acessam empresas onde possuem membership ativa
- Toda query que retorna dados de empresa DEVE filtrar por membership (exceto super_admin)
- Audit log sempre inclui `company_id` quando aplicável

### Company
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| name | String | |
| slug | String (unique) | URL-friendly, para uso na UI |
| webhook_key | String (unique) | Identificador opaco para URL pública. Gerado automaticamente (nanoid 21 chars) |
| logo_url | String (nullable) | |
| is_active | Boolean | default: true |
| created_at | DateTime | |
| updated_at | DateTime | |

**Nota:** A URL pública do webhook usa `webhook_key`, não o `id` nem o `slug`. Exemplo: `/api/webhook/V1StGXR8_Z5jdHi6B-myT`

### CompanyCredential
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| company_id | UUID (FK → Company, unique) | **1:1 com Company** |
| meta_app_id | String | encrypted (AES-256-GCM) |
| meta_app_secret | String | encrypted |
| verify_token | String | encrypted |
| phone_number_id | String (nullable) | |
| waba_id | String (nullable) | |
| access_token | String | encrypted |
| created_at | DateTime | |
| updated_at | DateTime | |

**Cardinalidade:** 1 empresa = 1 credential (1:1). Se o cliente tem múltiplos apps Meta, cadastra empresas separadas. Constraint UNIQUE em `company_id`.

### Política de Exclusão (todas as entidades)

**Regra geral: soft delete via `is_active = false` para entidades com histórico. Hard delete proibido.**

| Entidade | Estratégia | FK constraint | Motivo |
|----------|-----------|--------------|--------|
| Company | Soft delete (`is_active = false`) | ON DELETE RESTRICT | Possui InboundWebhooks, RouteDeliveries, AuditLogs |
| User | Soft delete (`is_active = false`) | ON DELETE RESTRICT | Possui AuditLogs, Notifications, pode ser `invited_by` de outros |
| WebhookRoute | Soft delete (`is_active = false`) | ON DELETE RESTRICT | Possui RouteDeliveries históricas |
| UserCompanyMembership | Soft delete (`is_active = false`) | ON DELETE RESTRICT | Histórico de acesso |
| CompanyCredential | Permanece com a empresa desativada | ON DELETE RESTRICT | Mudanças de credenciais são **UPDATE no mesmo registro** (auditado). Quando a Company é desativada (`is_active = false`), a credencial permanece no banco — não há hard delete automático. Dados sensíveis podem ser zerados manualmente pelo super_admin se necessário |
| InboundWebhook | Hard delete pelo job de retenção | N/A | Controlado pela política de retenção |
| RouteDelivery | Hard delete pelo job de retenção | N/A | Controlado pela política de retenção |
| DeliveryAttempt | Hard delete pelo job de retenção | N/A | Controlado pela política de retenção |
| AuditLog | Hard delete pelo job de retenção (365 dias) | N/A | Não configurável |
| Notification | Hard delete: lidas há mais de 30 dias, não-lidas há mais de 90 dias | N/A | Executado pelo job `notification-cleanup` |

**Na UI:** "remover" empresa/usuário/rota significa `is_active = false`. O registro permanece no banco para preservar integridade de logs e audit trail. A UI filtra por `is_active = true` por padrão, com opção de "mostrar inativos".

### WebhookRoute
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| company_id | UUID (FK → Company) | |
| name | String | |
| icon | String | nome do ícone Lucide |
| url | String | Apenas HTTPS permitido |
| secret_key | String (nullable) | encrypted. Usado para gerar X-Nexus-Signature-256 |
| events | JSONB | array de eventos selecionados |
| is_active | Boolean | default: true |
| headers | JSONB (nullable) | headers customizados key-value. Whitelist aplicada |
| timeout_ms | Int | default: 30000 (30s). Timeout por rota |
| created_at | DateTime | |
| updated_at | DateTime | |

### InboundWebhook
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| company_id | UUID (FK → Company) | |
| received_at | DateTime | timestamp de recebimento |
| raw_body | TEXT (**nullable**) | corpo bruto original do callback recebido, preservado sem reserialização. Usado para: fallback de dedupe, verificação de assinatura inbound (X-Hub-Signature-256), debug/auditoria. **Não usado para assinatura outbound** (outbound assina o evento normalizado). Setado null pelo job de retenção após `log_full_retention_days` |
| raw_payload | JSONB (**nullable**) | payload parseado para queries. Pode ser reserializado diferente do original — **não usar para cálculo de assinaturas**. Setado null junto com raw_body pelo job de retenção |
| event_type | String | tipo normalizado do evento (ex: messages.text, statuses.delivered) |
| dedupe_key | String | Chave de deduplicação (ver seção 2, passo 6). Não é UNIQUE constraint — dedup via índice composto regular + filtro temporal na query |
| processing_status | Enum | received, queued, processed, no_routes. **Campo auxiliar, não fonte de verdade.** Ver nota abaixo |
| created_at | DateTime | particionamento |

**`processing_status` — regras de atualização:**
- `received`: persistido no banco, RouteDeliveries criadas, enqueue ainda não confirmado
- `queued`: todos os enqueues do BullMQ confirmados (atualizado pós-commit, best-effort)
- `processed`: **derivado** — significa que TODAS as RouteDeliveries associadas atingiram estado terminal (`delivered` ou `failed`). Atualizado pelo worker ao finalizar a última entrega
- `no_routes`: webhook válido recebido, mas nenhuma rota ativa aceitava o evento (0 RouteDeliveries criadas). Estado terminal, não é erro

**Assinaturas inválidas NÃO geram InboundWebhook.** Webhooks com assinatura inválida são rejeitados com HTTP 401 antes da persistência e registrados apenas no `AuditLog` (action: `webhook.signature_invalid`, com IP, timestamp e company_id). Isso mantém o InboundWebhook limpo como tabela de eventos válidos aceitos pelo sistema.

**Fonte de verdade:** o estado real de processamento de um InboundWebhook é a agregação dos status das suas RouteDeliveries, não o `processing_status`. Este campo existe para otimizar queries de dashboard e evitar JOINs pesados. Em caso de divergência, o estado derivado das RouteDeliveries prevalece.

### RouteDelivery
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| inbound_webhook_id | UUID (FK → InboundWebhook) | |
| route_id | UUID (FK → WebhookRoute) | |
| company_id | UUID (FK → Company) | desnormalizado para queries |
| status | Enum | pending, delivering, delivered, retrying, failed |
| first_attempt_at | DateTime (nullable) | |
| last_attempt_at | DateTime (nullable) | |
| delivered_at | DateTime (nullable) | |
| final_http_status | Int (nullable) | |
| total_attempts | Int | default: 0 |
| next_retry_at | DateTime (nullable) | |
| created_at | DateTime | |

### DeliveryAttempt
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| route_delivery_id | UUID (FK → RouteDelivery) | |
| attempt_number | Int | |
| started_at | DateTime | |
| finished_at | DateTime | |
| duration_ms | Int | |
| http_status | Int (nullable) | |
| response_body | Text (nullable) | truncado em 4KB |
| error_message | Text (nullable) | |
| created_at | DateTime | |

### GlobalSettings
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| key | String (unique) | |
| value | JSONB | validado por Zod no código |
| updated_by | UUID (FK → User) | |
| updated_at | DateTime | |

Chaves previstas:
- `retry_max_retries` (default: 3) — **número de retries ALÉM da tentativa inicial.** Total de tentativas = 1 (inicial) + retry_max_retries. Com default 3, são 4 tentativas no total
- `retry_intervals_seconds` (default: [10, 30, 90]) — intervalo antes de cada retry (deve ter exatamente `retry_max_retries` elementos)
- `retry_strategy` (exponential | fixed)
- `retry_jitter_enabled` (default: true)
- `log_full_retention_days` (default: 90)
- `log_summary_retention_days` (default: 180)
- `notify_platform_enabled` (default: true)
- `notify_email_enabled` (default: true)
- `notify_whatsapp_enabled` (default: true)
- `notify_failure_threshold` (default: 5) — falhas consecutivas na mesma rota antes de disparar alerta. **Regras de contagem:** (a) um `delivered` com sucesso zera o contador da rota; (b) reenvio manual com sucesso também zera; (c) tanto falha retriable final quanto falha não-retriable incrementam o contador igualmente; (d) após disparar alerta, o contador continua contando — dispara novo alerta a cada N falhas adicionais (não silencia)
- `notify_recipients` (default: "admins") — quem recebe notificações de falha. Valores: `"all"` (todos com acesso à empresa), `"admins"` (super_admin + company_admins da empresa afetada), `"super_admin_only"`
- `notify_whatsapp_number` — número de telefone destino para notificações WhatsApp (formato internacional, ex: "5511999999999")
- `notify_email_recipients` (default: []) — lista de e-mails adicionais além dos destinatários por role. Se vazio, usa apenas os e-mails dos usuários conforme `notify_recipients`
- `whatsapp_provider` (cloud_api | custom)
- `whatsapp_cloud_api_config` (JSON)
- `whatsapp_custom_config` (JSON: url, token)

### Notification
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK → User, nullable) | |
| company_id | UUID (FK → Company, nullable) | |
| type | Enum | error, warning, info |
| title | String | |
| message | String | |
| link | String | deep link na plataforma |
| channels_sent | JSONB | ["platform", "email", "whatsapp"] |
| is_read | Boolean | default: false |
| created_at | DateTime | |

### AuditLog
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| actor_type | Enum | `user` ou `system` |
| actor_id | UUID (FK → User, **nullable**) | preenchido quando `actor_type = user`. Null para ações de sistema |
| actor_label | String | nome do ator para exibição. Para `user`: nome do usuário. Para `system`: nome do job/processo (ex: "orphan-recovery", "log-cleanup", "webhook-receiver") |
| company_id | UUID (FK → Company, nullable) | sempre preenchido quando ação é no contexto de empresa |
| action | String | ex: user.login, credential.update, webhook.signature_invalid, system.log_cleanup |
| resource_type | String | ex: company, user, route, inbound_webhook |
| resource_id | UUID (nullable) | |
| details | JSONB | dados da ação |
| ip_address | String (nullable) | preenchido para ações de usuário e webhooks. Null para jobs internos |
| user_agent | String (nullable) | |
| created_at | DateTime | |

### Índices Obrigatórios

```
-- InboundWebhook
CREATE INDEX idx_inbound_company_created ON inbound_webhook (company_id, created_at DESC);
CREATE INDEX idx_inbound_dedupe ON inbound_webhook (dedupe_key, created_at DESC);
-- ^ índice composto regular (NÃO partial index). A deduplicação é feita na query:
-- SELECT 1 FROM inbound_webhook WHERE dedupe_key = ? AND created_at > NOW() - INTERVAL '24h' LIMIT 1
-- Permite mesma dedupe_key em partições/meses diferentes sem conflito
CREATE INDEX idx_inbound_event_type ON inbound_webhook (event_type, created_at DESC);
CREATE INDEX idx_inbound_processing ON inbound_webhook (processing_status) WHERE processing_status != 'processed';

-- RouteDelivery
CREATE INDEX idx_delivery_company_created ON route_delivery (company_id, created_at DESC);
CREATE INDEX idx_delivery_route_created ON route_delivery (route_id, created_at DESC);
CREATE INDEX idx_delivery_status ON route_delivery (status, next_retry_at, created_at) WHERE status IN ('pending', 'delivering', 'retrying');
-- ^ cobre TODAS as queries do orphan-recovery:
--   pending/delivering há mais de 2min (por created_at)
--   retrying com next_retry_at <= NOW() há mais de 2min (por next_retry_at)
CREATE INDEX idx_delivery_inbound ON route_delivery (inbound_webhook_id);

-- DeliveryAttempt
CREATE INDEX idx_attempt_delivery ON delivery_attempt (route_delivery_id, attempt_number);

-- AuditLog
CREATE INDEX idx_audit_actor ON audit_log (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_company ON audit_log (company_id, created_at DESC);

-- Notification
CREATE INDEX idx_notification_user_read ON notification (user_id, is_read, created_at DESC);
```

### Particionamento

- `InboundWebhook`: particionamento por range em `created_at` (mensal)
- `RouteDelivery`: particionamento por range em `created_at` (mensal)
- `DeliveryAttempt`: particionamento por range em `created_at` (mensal)
- Partições antigas são dropadas conforme política de retenção

### Estratégia de Retenção

| Dado | Retenção padrão | Configurável |
|------|----------------|-------------|
| InboundWebhook (raw_payload) | 90 dias | Sim (log_full_retention_days) |
| InboundWebhook (metadados) | 180 dias | Sim (log_summary_retention_days) |
| RouteDelivery | 180 dias | Sim |
| DeliveryAttempt | 90 dias | Sim |
| AuditLog | 365 dias | Não |

O job `log-cleanup`:
1. Remove `raw_payload` e `raw_body` (seta null) de InboundWebhooks mais antigos que `log_full_retention_days`
2. Remove registros completos mais antigos que `log_summary_retention_days`
3. Remove DeliveryAttempts mais antigos que `log_full_retention_days`
4. Dropa partições mensais expiradas

---

## 5. Eventos do WhatsApp Cloud API

### Mensagens Recebidas (messages)
- `messages.text` — Mensagem de texto
- `messages.image` — Imagem
- `messages.audio` — Áudio/voz
- `messages.video` — Vídeo
- `messages.document` — Documento
- `messages.sticker` — Figurinha
- `messages.location` — Localização
- `messages.contacts` — Cartão de contato
- `messages.reaction` — Reação a mensagem
- `messages.interactive` — Resposta de botão/lista interativa
- `messages.button` — Clique em botão de template
- `messages.order` — Pedido de produto (catálogo)
- `messages.referral` — Mensagem vinda de anúncio
- `messages.system` — Mensagem de sistema
- `messages.request_welcome` — Usuário abre conversa pela primeira vez
- `messages.nfm_reply` — Resposta de WhatsApp Flow
- `messages.unknown` — Tipo não suportado

### Status de Mensagens (statuses)
- `statuses.sent` — Enviada
- `statuses.delivered` — Entregue
- `statuses.read` — Lida
- `statuses.failed` — Falha

### Chamadas (calls)
- `calls.inbound` — Chamada recebida
- `calls.outbound` — Chamada realizada

### Conta e Telefone
- `account_update` — Mudanças no status da conta
- `account_alerts` — Alertas da conta
- `account_review_update` — Status de revisão da conta
- `phone_number_name_update` — Nome do número aprovado/rejeitado
- `phone_number_quality_update` — Qualidade do número

### Templates
- `message_template_status_update` — Status do template
- `message_template_quality_update` — Qualidade do template
- `message_template_components_update` — Componentes do template
- `template_category_update` — Categoria do template

### Negócio
- `business_capability_update` — Limites e capacidades

### Segurança
- `security` — Alertas de segurança

### Flows
- `flows.flow_status_change` — Status do flow
- `flows.client_error_rate` — Taxa de erro no cliente
- `flows.endpoint_error_rate` — Taxa de erro no endpoint
- `flows.endpoint_latency` — Latência do endpoint
- `flows.endpoint_availability` — Disponibilidade do endpoint
- `flows.flow_version_freeze_warning` — Versão prestes a expirar

### SMB
- `smb_message_echoes` — Mensagens enviadas pelo app nativo

**Normalização:** Os eventos acima são os `event_type` normalizados armazenados no sistema. O mapeamento do payload bruto da Meta para esses tipos normalizados é feito pelo ingest no momento do recebimento. O prefixo (ex: `messages.`, `statuses.`, `calls.`, `flows.`) garante namespace sem ambiguidade.

---

## 6. Telas e Navegação

### Sidebar Esquerda (fixa)
- Logo Nexus no topo
- Menu: Dashboard, Empresas, Usuários, Configurações Globais
- Toggle de tema (dark/light/system) como atalho
- Rodapé: avatar do usuário, nome, papel na empresa atual (via membership) ou "Super Admin", botão logout

### Telas

**Login** (`/login`)
- Full-screen, split layout (branding esquerda, formulário direita)
- E-mail, senha (toggle visibilidade), link "Esqueci minha senha"
- Animações de entrada (Framer Motion), efeitos de hover

**Esqueci Senha** (`/forgot-password`)
- Campo e-mail, botão enviar, feedback visual

**Redefinir Senha** (`/reset-password/:token`)
- Nova senha, confirmar, validação de força em tempo real

**Dashboard** (`/dashboard`)
- Cards: total webhooks hoje, entregues, falhas, taxa de sucesso
- Gráfico de linha: webhooks/hora (24h)
- Top 5 erros mais frequentes
- Live feed de webhooks recentes (Socket.io)
- Filtro por período
- Tudo tempo real

**Empresas** (`/companies`)
- Cards com: logo, nome, status, contadores (rotas ativas, webhooks hoje, taxa sucesso)
- Busca, filtros, botão "Nova Empresa"

**Página da Empresa** (`/companies/:id`)
- Header: logo, nome, status, webhook URL copiável
- Abas: Visão Geral, Credenciais, Rotas de Webhook, Logs

**Aba Credenciais**
- Campos Meta: App ID, App Secret, Verify Token, Access Token, Phone Number ID, WABA ID
- Máscara mostrar/ocultar em campos sensíveis

**Aba Rotas de Webhook**
- Lista: ícone Lucide, nome, URL (mascarada), status, health indicator (verde/vermelho/cinza), badge de eventos
- Botão "Nova Rota"

**Cadastro/Edição de Rota** (modal ou página)
- Nome, seletor de ícone Lucide (grid com busca), URL destino (apenas HTTPS)
- Secret key (opcional), headers customizados (key-value, whitelist aplicada)
- Timeout customizado (opcional, default 30s)
- Checklist de eventos agrupados por 9 categorias, colapsáveis
- Botão "Selecionar todos", badge de contagem
- Botão "Enviar teste" para validar URL

**Aba Logs**
- Tabela: timestamp, evento, rota, status (tag colorida), duração, tentativa
- Expandir: payload, response, erro, todas as tentativas
- Filtros: status, evento, rota, período
- Reenvio individual e em lote
- Exportação CSV

**Usuários** (`/users`)
- Tabela: avatar, nome, e-mail, empresas vinculadas, status, criação
- Botão "Convidar Usuário" (modal: nome, e-mail, selecionar empresas + role por empresa)
- Ações: editar role/empresas, ativar/desativar, remover

**Perfil** (`/profile`)
- Upload de foto com preview
- Nome, e-mail editáveis
- Redefinir senha
- Seleção de tema

**Configurações Globais** (`/settings`) — Apenas super_admin
- **Retry:** tentativas, intervalos, estratégia (exponential/fixed), jitter on/off, timeout default
- **Retenção:** dias payload completo (default 90), dias resumo (default 180)
- **Notificações:** toggles (plataforma, e-mail, WhatsApp) com regra e-mail OU WhatsApp sempre ativo. Threshold de falhas
- **WhatsApp:** provedor (Cloud API / Custom), campos de config, número destino
- **Audit Log:** visualização de ações sensíveis com filtros

**Notificações** (dropdown sino)
- Badge com contagem, lista com título/mensagem/horário/tipo
- Deep link para tela do problema
- Marcar como lida

---

## 7. Segurança

### 7.1 Criptografia em Trânsito
- HTTPS/TLS obrigatório em todo tráfego via Cloudflare + Traefik
- Entrega para rotas de destino **somente via HTTPS** — HTTP rejeitado
- TLS inválido no destino: rejeitar sempre (não ignorar certificados)

### 7.2 Criptografia em Repouso
- AES-256-GCM para: credenciais Meta, secret keys de rotas, tokens
- Chave em variável de ambiente (`ENCRYPTION_KEY`), nunca no código
- Rotação de `ENCRYPTION_KEY`: não suportada no V1. Se precisar rotacionar, re-encrypt manual via script de migração
- Senhas com bcrypt (12 salt rounds)

### 7.3 Validação de Webhooks (entrada)
- Todo webhook recebido validado por X-Hub-Signature-256 com App Secret da empresa
- **Assinatura inválida = HTTP 401 + registro no AuditLog** (action: `webhook.signature_invalid`, com IP, headers e company_id). Não persiste InboundWebhook — o evento é rejeitado antes de entrar no domínio
- Verify Token único por empresa (endpoint GET para challenge/response)
- Deduplicação por chave semântica do payload (fallback: SHA-256 do body), janela 24h via índice composto regular + filtro temporal na query (ver seção 2, passo 6 para algoritmo completo)

### 7.4 Segurança de Saída (proteção SSRF)

**Validações obrigatórias antes de cada entrega:**
- Bloquear destinos: `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (link-local), `::1`, `fc00::/7`
- Bloquear metadata endpoints: `169.254.169.254` (AWS/GCP/Azure metadata)
- Revalidar DNS no momento do envio (prevenir DNS rebinding)
- Apenas esquema `https://` permitido
- Timeout por rota (default 30s, configurável por rota)
- **Redirects HTTP: não seguir.** Configurar axios com `maxRedirects: 0`. Se o destino retornar 301/302/307/308, tratar como erro não-retriable e registrar no log. Motivo: seguir redirects abre vetor de SSRF onde o destino inicial é válido mas redireciona para IP interno. O destino cadastrado deve ser o destino final

**Assinatura outbound padronizada:**
- Toda entrega inclui header `X-Nexus-Signature-256`: HMAC-SHA256 do **corpo serializado do evento normalizado** (o mesmo JSON que é enviado ao destino) usando `secret_key` da rota (quando configurada). A assinatura corresponde exatamente ao body entregue, não ao callback original da Meta
- Headers adicionais incluídos em toda entrega:
  - `X-Nexus-Delivery-Id`: UUID da RouteDelivery
  - `X-Nexus-Attempt`: número da tentativa
  - `X-Nexus-Event-Type`: tipo normalizado do evento
  - `X-Nexus-Timestamp`: ISO 8601 do momento do envio

**Headers customizados:**
- Whitelist de headers permitidos (bloquear `Host`, `Authorization` com credentials internas, etc.)
- Headers sensíveis armazenados criptografados

### 7.5 Autenticação

| Requisito | Valor |
|-----------|-------|
| Sessão expira após inatividade | 30 minutos |
| Token de reset de senha expira em | 15 minutos |
| Bloqueio de conta após tentativas falhas | 5 tentativas em 1 minuto → bloqueio 15 minutos. **Chave de bloqueio: e-mail + IP combinados.** Bloqueio por e-mail sozinho permitiria DoS contra contas alheias; por IP sozinho perde eficácia atrás de NAT. A combinação protege contra brute force sem permitir lock-out externo |
| IP e user agent registrados | Em todo login (sucesso e falha) |
| JWT | Criptografado (JWE) via NextAuth.js. Stateless — **não usa Redis para sessões** |

### 7.6 Autorização (RBAC)

**Papéis:**
- `super_admin`: `is_super_admin = true` no User. Acesso total sem membership.
- `company_admin`: por empresa, via UserCompanyMembership. Gerencia empresa, credenciais, usuários da empresa.
- `manager`: por empresa. Configura rotas, vê logs, reenvia webhooks.
- `viewer`: por empresa. Apenas visualiza dashboards e logs.

**Matriz de permissões:**

| Recurso | super_admin | company_admin | manager | viewer |
|---------|:-----------:|:-------------:|:-------:|:------:|
| Dashboard global | ✅ | ❌ (vê só suas empresas) | ❌ (vê só suas empresas) | ❌ (vê só suas empresas) |
| Ver empresas | ✅ todas | ✅ suas | ✅ suas | ✅ suas |
| Criar empresa | ✅ | ❌ | ❌ | ❌ |
| Editar empresa | ✅ | ✅ sua | ❌ | ❌ |
| Gerenciar credenciais | ✅ | ✅ sua | ❌ | ❌ |
| Criar/editar rotas | ✅ | ✅ sua | ✅ sua | ❌ |
| Ver logs | ✅ | ✅ sua | ✅ sua | ✅ sua |
| Reenviar webhooks | ✅ | ✅ sua | ✅ sua | ❌ |
| Convidar usuários | ✅ | ✅ para sua empresa | ❌ | ❌ |
| Gerenciar usuários globais | ✅ | ❌ | ❌ | ❌ |
| Configurações globais | ✅ | ❌ | ❌ | ❌ |
| Alterar roles | ✅ | ✅ (dentro da empresa, não pode criar super_admin) | ❌ | ❌ |
| Audit log global | ✅ | ❌ | ❌ | ❌ |
| Audit log da empresa | ✅ | ✅ sua | ❌ | ❌ |

**Tenant scoping obrigatório:**
- Toda query que retorna dados de empresa filtra por `UserCompanyMembership` (exceto super_admin)
- Queries globais (cross-company) proibidas fora do contexto super_admin
- Middleware de autorização valida membership + role antes de toda operação

### 7.7 Proteções Adicionais
- CSRF protection nativo do NextAuth.js
- Helmet.js para headers de segurança (XSS, clickjacking, sniffing)
- Sanitização de inputs com Zod (validação de tipos + constraints)
- Credenciais nunca retornam em texto puro na API — sempre mascaradas (ex: `sk_****...abc3`)
- Rate limiting global: 100 req/min por IP nas APIs administrativas
- Rate limiting webhook: 1000 req/min por `webhook_key` (proteção contra flood). Acima disso, retorna HTTP 429 — a Meta retenta automaticamente, o que reduz overload mas **não garante zero perda** em burst extremo. Defesa complementar: requests com assinatura inválida consomem cota dobrada no **mesmo bucket** do `webhook_key` (penalização que reduz a cota legítima restante, incentivando a Meta a usar credenciais válidas)

---

## 8. Confiabilidade

### Garantias
- **At-least-once delivery**: todo webhook válido será entregue pelo menos uma vez a cada rota elegível
- **Persist-before-ACK**: webhook é persistido no banco antes de retornar 200 para a Meta. O ACK é dado após COMMIT no PostgreSQL, não após enqueue no Redis
- **Materialização transacional**: RouteDeliveries são criadas na mesma transação PostgreSQL que o InboundWebhook
- **Consistência eventual compensada**: o enqueue no BullMQ acontece pós-commit (fora da transação). Se falhar, o `orphan-recovery` detecta e reenfileira. Não existe transação ACID entre banco e fila — a compensação é feita via recovery

### Deduplicação
- **Algoritmo**: determinístico e versionado (ver seção 2, passo 6). Extrai identificadores semânticos do payload (WABA ID + phone + message/status ID) na ordem definida. Fallback para SHA-256 do raw body quando campos não estão presentes
- **Janela**: 24 horas. **Decisão operacional explícita** — não derivada da política de retry da Meta (que pode reenviar por até 7 dias). Justificativa: 24h cobre a imensa maioria dos reenvios da Meta (que concentra retries nas primeiras horas); janelas maiores aumentam custo de storage do índice e risco de colisão falsa entre eventos legítimos separados por dias. Se necessário, o valor pode ser ajustado
- **Implementação**: query com índice composto regular `(dedupe_key, created_at DESC)` e filtro temporal na query (`WHERE dedupe_key = ? AND created_at > NOW() - INTERVAL '24h' LIMIT 1`). Não é constraint UNIQUE — permite mesma dedupe_key em partições/meses diferentes
- **Comportamento**: se duplicado dentro da janela, retorna 200 (ACK) sem reprocessar nem criar RouteDeliveries. Eventos deduplicados **não aparecem nos logs da UI** mas são contabilizados em métrica interna (counter `webhooks_deduplicated_total` por empresa) para visibilidade operacional no dashboard

### Política de Retry

**Status HTTP retriable (faz retry):**
- `408` Request Timeout
- `409` Conflict
- `425` Too Early
- `429` Too Many Requests
- `500` Internal Server Error
- `502` Bad Gateway
- `503` Service Unavailable
- `504` Gateway Timeout
- Timeout de conexão / erro de rede

**Status HTTP não-retriable (marca como failed imediatamente):**
- `400` Bad Request
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `405` Method Not Allowed
- `422` Unprocessable Entity
- Qualquer outro 4xx

**Estratégia:**
- Backoff exponencial com jitter (configurável para fixo)
- Intervalos default: [10s, 30s, 90s]
- Max retries default: 3 (+ 1 tentativa inicial = **4 tentativas total**)
- Jitter: ±20% do intervalo para evitar rajada sincronizada
- Tudo configurável na tela de Configurações Globais

### Dead Letter Queue (DLQ)
- Jobs que exauriram todas as tentativas vão para a fila `webhook-dlq` no Redis
- Ficam lá por 7 dias
- Acessíveis para reenvio manual via painel (botão de reenvio individual/lote)
- Após 7 dias, são removidos da fila (mas o RouteDelivery permanece no banco com status `failed`)

### Recovery (orphan-recovery job) — Mecanismo Compensatório Core
Este job é o que fecha o contrato de confiabilidade. Sem ele, a separação entre transação no banco e enqueue no Redis deixaria entregas vulneráveis a perda.
- Roda a cada 5 minutos (valor inicial configurável)
- Busca RouteDeliveries com:
  - status `pending` ou `delivering` há mais de 2 minutos, OU
  - status `retrying` com `next_retry_at <= NOW()` há mais de 2 minutos
- Todos cobertos pelo índice `idx_delivery_status`
- Verifica se existe job correspondente na fila BullMQ
- Se não existe, reenfileira o job
- **Cenários cobertos:** falha no enqueue pós-commit, crash do worker durante `delivering`, restart/deploy do worker, Redis restart, **retry agendado mas job perdido**
- **Classificação:** Fase 1 — nasce junto com ingest e worker

---

## 9. Dados e Privacidade (LGPD)

### Dados Pessoais Armazenados
A plataforma armazena payloads de webhooks do WhatsApp que podem conter:
- Números de telefone
- Nomes de contatos
- Conteúdo de mensagens (texto, mídia, localização)
- Eventos de leitura/entrega
- Metadata de conversas

### Medidas de Proteção

**Minimização:**
- Payloads completos são retidos apenas pelo período configurado (default 90 dias)
- Após o período, payload é removido e só metadados ficam (evento, status, horário)
- Response body das tentativas truncado em 4KB

**Acesso restrito:**
- Payloads brutos só são visíveis para roles com permissão de "Ver logs"
- Na UI, payloads são exibidos em modo colapsado (não abrem automaticamente)
- Acesso a payloads registrado no AuditLog

**Exportação CSV:**
- CSV exporta apenas metadados operacionais: timestamp, event_type, rota destino (URL mascarada), status, http_status, duration_ms, error_message
- **Payload bruto e response body NÃO são incluídos** na exportação CSV — contêm dados pessoais (telefones, nomes, conteúdo de mensagens)
- Se o usuário precisar do payload completo, deve acessar individualmente na UI (ação registrada no AuditLog)

**Exclusão:**
- Job automático de cleanup garante exclusão no prazo configurado
- Super admin pode forçar exclusão manual de dados de uma empresa

**Trilha de acesso:**
- AuditLog registra quem acessou payloads de webhook
- AuditLog retido por 365 dias (não configurável)

---

## 10. Jobs Automáticos

| Job | Função | Frequência |
|-----|--------|-----------|
| webhook-delivery | Entrega webhooks para rotas | Contínuo (evento) |
| webhook-retry | Reprocessa falhas retriable conforme config | Contínuo (evento) |
| log-cleanup | Remove payloads antigos e resumos expirados, dropa partições | Diário (meia-noite) |
| notification-dispatcher | Envia alertas (plataforma, e-mail, WhatsApp) no threshold | Contínuo (evento) |
| notification-cleanup | Remove notificações lidas há mais de 30 dias e não-lidas há mais de 90 dias | Diário (meia-noite) |
| health-check | Verifica disponibilidade das URLs das rotas ativas. Tenta HEAD; se responder 405/404, faz fallback para GET. **Aplica mesmas regras do outbound real:** SSRF check, HTTPS, TLS válido, maxRedirects: 0, timeout da rota. **Nota:** mede disponibilidade do host, não compatibilidade completa com entrega POST | A cada 5 minutos |
| orphan-recovery | Reenfileira RouteDeliveries pendentes sem job na fila | A cada 5 minutos |

---

## 11. Funcionalidades Extras

1. **Health Check por Rota** — Ping periódico nas URLs, indicador visual (verde/vermelho/cinza)
2. **Endpoint de Status** — `/api/health` retorna status app, banco e Redis
3. **Exportação de Logs** — CSV com filtros aplicados
4. **Modo de Teste por Rota** — Botão "Enviar teste" com payload de exemplo
5. **Reenvio manual** — Cria uma **nova RouteDelivery** derivada (não reutiliza a original). A nova RouteDelivery referencia o mesmo `inbound_webhook_id` e `route_id`, mas tem `id`, timestamps e attempts próprios. A RouteDelivery original mantém seu status `failed` inalterado. Isso preserva histórico completo e separa métricas de entrega automática vs manual
6. **Busca Global** — `Ctrl+K` para busca rápida em toda plataforma
7. **Seeding Super Admin** — Criação automática via variáveis de ambiente na primeira execução
8. **Audit Log** — Registro de ações sensíveis e de sistema, acessível pelo super_admin (global) e company_admin (empresa)
9. **Verificação Meta** — Endpoint GET `/api/webhook/:webhook_key` para challenge/response

---

## 12. Requisitos Não-Funcionais (NFRs)

| Métrica | Alvo | Notas |
|---------|------|-------|
| Tempo de ACK para Meta | < 500ms (p95) | Apenas persist + commit. Enqueue é pós-commit e não impacta ACK. **Nota:** alvo vale para o volume esperado (~1-3 eventos por callback). Callbacks excepcionalmente agregados (>10 eventos no mesmo POST) podem ultrapassar este alvo |
| Latência de entrega assíncrona | < 5s (p95) **em operação nominal** | Da persistência ao envio para a URL de destino. **Não se aplica** quando o fluxo depende do orphan-recovery (falha no enqueue), onde a latência pode chegar ao intervalo do recovery (5min default) |
| Volume inicial esperado | ~100 webhooks/min total, ~20/min por empresa | Valores iniciais para dimensionamento. Ajustar conforme carga real |
| Concorrência do worker | 10 jobs simultâneos (inicial) | Configurável via BullMQ `concurrency`. Aumentar conforme volume |
| Comportamento sob burst | Rate limit 1000 req/min por `webhook_key`. Acima disso, HTTP 429 | Reduz overload. Meta retenta automaticamente, o que absorve a maioria dos excessos temporários. **Não garante zero perda** em burst extremo ou prolongado |
| Disponibilidade do ingest | 99.5% (alvo) | Prioridade máxima. Downtime = perda de webhooks até Meta reenviar |
| Tempo máximo de retry | Soma dos `retry_intervals_seconds`. Default: 10+30+90 = 130s (~2min10s) após 3 retries + 1 tentativa inicial = 4 tentativas total | Após exaustão, vai para DLQ. Reenvio manual disponível |

**Observabilidade:**
- `/api/health` retorna status de app, PostgreSQL e Redis com latência de cada um
- Logs estruturados (JSON) para facilitar parsing por ferramentas externas
- Métricas de filas BullMQ (jobs ativos, aguardando, falhos) expostas via API admin

---

## 13. Deploy

### Docker Swarm Stack (Portainer)
- **Container 1 (app):** Next.js (frontend + API + ingest + Socket.io)
- **Container 2 (worker):** BullMQ Worker (processo independente, mesma imagem Docker com entrypoint diferente)
- **Container 3 (db):** PostgreSQL 16 Alpine
- **Container 4 (redis):** Redis 7 Alpine
- **Rede:** traefik-public (externa) + internal (overlay)
- **Volumes:** postgres_data, redis_data

### Stack YAML (Swarm mode)

```yaml
version: "3.8"

services:
  app:
    image: ghcr.io/jvzanini/nexus-roteador-webhook:latest
    command: ["node", "server.js"]
    environment:
      - DATABASE_URL=postgresql://nexus:${DB_PASSWORD}@db:5432/nexus
      - REDIS_URL=redis://redis:6379
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=https://roteadorwebhook.nexusai360.com
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - RESEND_API_KEY=${RESEND_API_KEY}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    networks:
      - traefik-public
      - internal
    deploy:
      labels:
        - traefik.enable=true
        - traefik.http.routers.nexus.rule=Host(`roteadorwebhook.nexusai360.com`)
        - traefik.http.routers.nexus.entrypoints=websecure
        - traefik.http.services.nexus.loadbalancer.server.port=3000

  worker:
    image: ghcr.io/jvzanini/nexus-roteador-webhook:latest
    command: ["node", "worker.js"]
    environment:
      - DATABASE_URL=postgresql://nexus:${DB_PASSWORD}@db:5432/nexus
      - REDIS_URL=redis://redis:6379
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - RESEND_API_KEY=${RESEND_API_KEY}
    networks:
      - internal

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=nexus
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=nexus
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - internal

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - internal

volumes:
  postgres_data:
  redis_data:

networks:
  traefik-public:
    external: true
  internal:
    driver: overlay
```

### CI/CD
- GitHub Actions: build Docker a cada push na main
- Push para GitHub Container Registry (ghcr.io)
- Atualização via re-deploy no Portainer

### Variáveis de Ambiente
- `DATABASE_URL` — Conexão PostgreSQL
- `REDIS_URL` — Conexão Redis
- `NEXTAUTH_SECRET` — Secret do NextAuth (mín. 32 chars, gerado com openssl rand)
- `NEXTAUTH_URL` — `https://roteadorwebhook.nexusai360.com`
- `ENCRYPTION_KEY` — Chave AES-256 (32 bytes hex, gerado com openssl rand -hex 32)
- `RESEND_API_KEY` — API key do Resend
- `ADMIN_EMAIL` — E-mail do super admin (seeding)
- `ADMIN_PASSWORD` — Senha do super admin (seeding, mín. 12 chars)
- `DB_PASSWORD` — Senha do PostgreSQL

---

## 14. Faseamento de Implementação

### Fase 1 — Core (prioridade máxima)
O sistema precisa funcionar de ponta a ponta antes de polir UX.
- Setup do projeto (Next.js, Prisma, Docker, CI/CD)
- Modelo de dados completo (migrations + particionamento), incluindo `UserCompanyMembership`
- Autenticação (login, logout, sessões, seeding super_admin)
- **Tenant scoping mínimo**: middleware de autorização que filtra dados por membership. Não precisa da UI completa de gestão de usuários/roles, mas toda query já nasce com isolamento por empresa. Super_admin bypassa; demais usuários só veem empresas com membership ativa
- CRUD de empresas e credenciais
- Webhook receiver (ingest + validação + deduplicação + persistência)
- Worker de entrega (fan-out + retry + DLQ)
- **Orphan-recovery job** (mecanismo compensatório core — nasce com o worker)
- **Log cleanup job** (retenção de dados é requisito de LGPD desde o dia 1)
- CRUD de rotas com checklist de eventos
- Logs básicos (tabela com filtros)
- **Audit log mínimo operacional** — tabela + registro automático de: login/logout, assinatura inválida, CRUD de credenciais, ações de sistema (cleanup, recovery). UI de consulta completa fica para Fase 3

### Fase 2 — Operação
- Dashboard com métricas e gráficos
- Socket.io (tempo real)
- Reenvio individual e em lote
- Notificações (plataforma + e-mail)
- Configurações globais (retry, retenção, notificações)
- Health check por rota

### Fase 3 — Completude
- Gestão completa de usuários (convite por e-mail, atribuição de roles por empresa, UI de gerenciamento)
- Perfil do usuário (foto, tema, senha)
- UI completa de audit log (filtros, busca, visualização por empresa)
- Notificações por WhatsApp (Cloud API + custom)
- Busca global (Ctrl+K)
- Exportação CSV
- Modo de teste por rota
- Esqueci senha / redefinir senha via e-mail

**Nota:** Todas as fases serão implementadas. O faseamento define prioridade, não corte de escopo.
