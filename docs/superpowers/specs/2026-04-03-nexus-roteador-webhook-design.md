# Nexus Roteador Webhook — Design Spec

**Data:** 2026-04-03
**Status:** Aprovado (v2 — revisado após code review externo)
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
- **Container 1 (app):** Frontend SSR, APIs administrativas, webhook receiver (ingest) e Socket.io. Responsável por receber, validar, persistir e enfileirar. Não processa entregas.
- **Container 2 (worker):** Processo independente BullMQ. Consome filas, entrega webhooks, processa retries, envia notificações, faz health checks e cleanup. Pode escalar horizontalmente sem impactar o app.
- **Container 3 (db):** PostgreSQL 16.
- **Container 4 (redis):** Redis 7 (filas + cache + sessões).

### Fluxo do Webhook (detalhado)

1. Meta envia POST para `roteadorwebhook.nexusai360.com/api/webhook/{webhook_key}`
2. App busca empresa pelo `webhook_key` (identificador opaco, não o UUID interno)
3. Valida assinatura X-Hub-Signature-256 com App Secret da empresa
4. Calcula `dedupe_key` = SHA-256 do raw body
5. Verifica se `dedupe_key` já existe no `InboundWebhook` (janela de 24h). Se sim, retorna 200 sem reprocessar
6. **Dentro de uma transação:**
   - Persiste `InboundWebhook` com status `received`
   - Materializa um `RouteDelivery` para cada rota ativa que aceita o evento
   - Enfileira jobs no BullMQ para cada `RouteDelivery`
   - Atualiza `InboundWebhook.processing_status` para `queued`
7. Retorna HTTP 200 para a Meta (ACK)
8. Worker processa cada job:
   - Valida URL de destino (proteção SSRF)
   - Envia payload com headers padronizados + assinatura outbound
   - Cria `DeliveryAttempt` com resultado
   - Atualiza `RouteDelivery.status`
9. Se falhou, agenda retry conforme configuração global (apenas para status HTTP retriable)
10. Se atingiu limite de retries, marca como `failed` e dispara notificação
11. Dashboard atualiza em tempo real via Socket.io

### Job de Recuperação (orphan-recovery)
- Roda a cada 5 minutos
- Busca `RouteDelivery` com status `pending` há mais de 2 minutos sem job correspondente na fila
- Reenfileira os jobs órfãos
- Garante que nenhuma entrega se perde mesmo com crash do worker

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
| role | Enum | `super_admin` (único papel global) |
| avatar_url | String (nullable) | |
| theme | Enum | dark, light, system |
| is_active | Boolean | default: true |
| invited_by | UUID (FK → User, nullable) | |
| created_at | DateTime | |
| updated_at | DateTime | |

**Nota:** `role` no User agora só distingue `super_admin` de `user`. Papéis por empresa (admin, manager, viewer) ficam em `UserCompanyMembership`.

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
- `super_admin` acessa todas as empresas sem membership
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
| raw_payload | JSONB | payload original da Meta |
| signature_valid | Boolean | resultado da verificação X-Hub-Signature-256 |
| event_type | String | tipo normalizado do evento (ex: messages.text, statuses.delivered) |
| dedupe_key | String (unique dentro de janela) | SHA-256 do raw body para deduplicação |
| processing_status | Enum | received, queued, processed, failed |
| created_at | DateTime | particionamento |

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
- `retry_max_attempts` (default: 3)
- `retry_intervals_seconds` (default: [10, 30, 90])
- `retry_strategy` (exponential | fixed)
- `retry_jitter_enabled` (default: true)
- `log_full_retention_days` (default: 90)
- `log_summary_retention_days` (default: 180)
- `notify_platform_enabled` (default: true)
- `notify_email_enabled` (default: true)
- `notify_whatsapp_enabled` (default: true)
- `notify_failure_threshold` (default: 5)
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
| user_id | UUID (FK → User) | |
| company_id | UUID (FK → Company, nullable) | sempre preenchido quando ação é no contexto de empresa |
| action | String | ex: user.login, credential.update |
| resource_type | String | ex: company, user, route |
| resource_id | UUID (nullable) | |
| details | JSONB | dados da ação |
| ip_address | String | |
| user_agent | String | |
| created_at | DateTime | |

### Índices Obrigatórios

```
-- InboundWebhook
CREATE INDEX idx_inbound_company_created ON inbound_webhook (company_id, created_at DESC);
CREATE INDEX idx_inbound_dedupe ON inbound_webhook (dedupe_key, created_at DESC);
CREATE INDEX idx_inbound_event_type ON inbound_webhook (event_type, created_at DESC);
CREATE INDEX idx_inbound_processing ON inbound_webhook (processing_status) WHERE processing_status != 'processed';

-- RouteDelivery
CREATE INDEX idx_delivery_company_created ON route_delivery (company_id, created_at DESC);
CREATE INDEX idx_delivery_route_created ON route_delivery (route_id, created_at DESC);
CREATE INDEX idx_delivery_status ON route_delivery (status, next_retry_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_delivery_inbound ON route_delivery (inbound_webhook_id);

-- DeliveryAttempt
CREATE INDEX idx_attempt_delivery ON delivery_attempt (route_delivery_id, attempt_number);

-- AuditLog
CREATE INDEX idx_audit_user ON audit_log (user_id, created_at DESC);
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
1. Remove `raw_payload` (seta null) de InboundWebhooks mais antigos que `log_full_retention_days`
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
- Rodapé: avatar do usuário, nome, role, botão logout

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
- Assinatura inválida = HTTP 401 + log em AuditLog como tentativa suspeita
- Verify Token único por empresa (endpoint GET para challenge/response)
- Deduplicação por SHA-256 do body (janela 24h)

### 7.4 Segurança de Saída (proteção SSRF)

**Validações obrigatórias antes de cada entrega:**
- Bloquear destinos: `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (link-local), `::1`, `fc00::/7`
- Bloquear metadata endpoints: `169.254.169.254` (AWS/GCP/Azure metadata)
- Revalidar DNS no momento do envio (prevenir DNS rebinding)
- Apenas esquema `https://` permitido
- Timeout por rota (default 30s, configurável por rota)

**Assinatura outbound padronizada:**
- Toda entrega inclui header `X-Nexus-Signature-256`: HMAC-SHA256 do raw payload usando `secret_key` da rota (quando configurada)
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
| Bloqueio de conta após tentativas falhas | 5 tentativas em 1 minuto → bloqueio 15 minutos |
| IP e user agent registrados | Em todo login (sucesso e falha) |
| JWT | Criptografado (JWE) via NextAuth.js |

### 7.6 Autorização (RBAC)

**Papéis:**
- `super_admin`: único papel global, definido no User. Acesso total sem membership.
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
- Rate limiting webhook: 1000 req/min por empresa (proteção contra flood)

---

## 8. Confiabilidade

### Garantias
- **At-least-once delivery**: todo webhook válido será entregue pelo menos uma vez a cada rota elegível
- **Persist-before-ACK**: webhook é persistido no banco antes de retornar 200 para a Meta
- **Materialização transacional**: RouteDeliveries são criadas na mesma transação que o InboundWebhook

### Deduplicação
- Chave: SHA-256 do raw body do webhook
- Janela: 24 horas
- Comportamento: se duplicado, retorna 200 (ACK) sem reprocessar
- Garante idempotência quando a Meta reenvia o mesmo evento

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
- Max attempts default: 3
- Jitter: ±20% do intervalo para evitar rajada sincronizada
- Tudo configurável na tela de Configurações Globais

### Dead Letter Queue (DLQ)
- Jobs que exauriram todas as tentativas vão para a fila `webhook-dlq` no Redis
- Ficam lá por 7 dias
- Acessíveis para reenvio manual via painel (botão de reenvio individual/lote)
- Após 7 dias, são removidos da fila (mas o RouteDelivery permanece no banco com status `failed`)

### Recovery (orphan-recovery job)
- Roda a cada 5 minutos
- Busca RouteDeliveries com status `pending` ou `delivering` há mais de 2 minutos
- Verifica se existe job correspondente na fila BullMQ
- Se não existe, reenfileira
- Previne perda de entregas por crash, restart ou deploy

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

**Exclusão:**
- Job automático de cleanup garante exclusão no prazo configurado
- Super admin pode forçar exclusão manual de dados de uma empresa

**Trilha de acesso:**
- AuditLog registra quem acessou payloads de webhook
- AuditLog retido por 365 dias (não configurável)

---

## 10. Eventos do WhatsApp Cloud API

(Mesma seção 5 — mantida aqui como referência rápida para a UI de checklist)

---

## 11. Jobs Automáticos

| Job | Função | Frequência |
|-----|--------|-----------|
| webhook-delivery | Entrega webhooks para rotas | Contínuo (evento) |
| webhook-retry | Reprocessa falhas retriable conforme config | Contínuo (evento) |
| log-cleanup | Remove payloads antigos e resumos expirados, dropa partições | Diário (meia-noite) |
| notification-dispatcher | Envia alertas (plataforma, e-mail, WhatsApp) no threshold | Contínuo (evento) |
| health-check | Ping nas URLs das rotas ativas para verificar disponibilidade | A cada 5 minutos |
| orphan-recovery | Reenfileira RouteDeliveries pendentes sem job na fila | A cada 5 minutos |

---

## 12. Funcionalidades Extras

1. **Health Check por Rota** — Ping periódico nas URLs, indicador visual (verde/vermelho/cinza)
2. **Endpoint de Status** — `/api/health` retorna status app, banco e Redis
3. **Exportação de Logs** — CSV com filtros aplicados
4. **Modo de Teste por Rota** — Botão "Enviar teste" com payload de exemplo
5. **Busca Global** — `Ctrl+K` para busca rápida em toda plataforma
6. **Seeding Super Admin** — Criação automática via variáveis de ambiente na primeira execução
7. **Audit Log** — Registro de ações sensíveis, acessível pelo super_admin (global) e company_admin (empresa)
8. **Verificação Meta** — Endpoint GET `/api/webhook/:webhook_key` para challenge/response

---

## 13. Deploy

### Docker Compose (Portainer Stack)
- **Container 1 (app):** Next.js (frontend + API + ingest + Socket.io)
- **Container 2 (worker):** BullMQ Worker (processo independente, mesma imagem Docker com entrypoint diferente)
- **Container 3 (db):** PostgreSQL 16 Alpine
- **Container 4 (redis):** Redis 7 Alpine
- **Rede:** traefik-public (externa) + internal (overlay)
- **Volumes:** postgres_data, redis_data

### Docker Compose

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
- Modelo de dados completo (migrations)
- Autenticação (login, logout, sessões, seeding super_admin)
- CRUD de empresas e credenciais
- Webhook receiver (ingest + validação + persistência)
- Worker de entrega (fan-out + retry + DLQ)
- CRUD de rotas com checklist de eventos
- Logs básicos (tabela com filtros)

### Fase 2 — Operação
- Dashboard com métricas e gráficos
- Socket.io (tempo real)
- Reenvio individual e em lote
- Notificações (plataforma + e-mail)
- Configurações globais (retry, retenção, notificações)
- Health check por rota
- Orphan recovery job
- Log cleanup job

### Fase 3 — Completude
- RBAC completo com UserCompanyMembership
- Gestão de usuários (convite, roles por empresa)
- Perfil do usuário (foto, tema, senha)
- Audit log
- Notificações por WhatsApp (Cloud API + custom)
- Busca global (Ctrl+K)
- Exportação CSV
- Modo de teste por rota
- Esqueci senha / redefinir senha via e-mail

**Nota:** Todas as fases serão implementadas. O faseamento define prioridade, não corte de escopo.
