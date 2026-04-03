# Nexus Roteador Webhook — Design Spec

**Data:** 2026-04-03
**Status:** Aprovado
**Domínio:** roteadorwebhook.nexusai360.com

---

## 1. Visão Geral

Plataforma interna para roteamento inteligente de webhooks da Meta (WhatsApp Cloud API). Recebe webhooks de apps da Meta e os distribui para múltiplas URLs de destino configuráveis por empresa, com controle granular de eventos, monitoramento em tempo real e sistema de notificações.

### Problema
A Meta permite apenas uma URL de webhook por aplicativo. Isso limita o uso dos eventos do WhatsApp Cloud API a um único destino.

### Solução
Um roteador intermediário que recebe o webhook da Meta e o replica para N destinos cadastrados, filtrando por tipo de evento, com retry automático, logs detalhados e dashboard de monitoramento.

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
┌──────────────────────────────────┐
│  Docker Stack (Portainer)        │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Next.js App (Container 1) │  │
│  │  ├─ Frontend (React/SSR)   │  │
│  │  ├─ API Routes             │  │
│  │  ├─ Webhook Receiver       │  │
│  │  ├─ Worker BullMQ          │  │
│  │  └─ Socket.io Server       │  │
│  └─────────┬──────┬───────────┘  │
│            │      │              │
│     ┌──────┘      └──────┐      │
│     ▼                    ▼      │
│  ┌──────────┐    ┌───────────┐  │
│  │ PostgreSQL│    │   Redis   │  │
│  │(Container │    │(Container │  │
│  │    2)     │    │    3)     │  │
│  └──────────┘    └───────────┘  │
└──────────────────────────────────┘
```

### Fluxo do Webhook
1. Meta envia POST para `roteadorwebhook.nexusai360.com/api/webhook/{company_id}`
2. App valida a assinatura X-Hub-Signature-256 com App Secret da empresa
3. Registra o webhook no PostgreSQL (log completo)
4. Enfileira no BullMQ (Redis) um job para cada rota cadastrada que aceita aquele evento
5. Worker processa a fila: envia o payload para cada URL de destino
6. Registra resultado (sucesso/falha) no PostgreSQL
7. Se falhou, agenda retry conforme configuração global
8. Se atingiu limite de retries, marca como `failed` e dispara notificação
9. Dashboard atualiza em tempo real via Socket.io

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
| password | String | bcrypt hash |
| role | Enum | super_admin, admin, manager, viewer |
| avatar_url | String (nullable) | |
| theme | Enum | dark, light, system |
| is_active | Boolean | default: true |
| invited_by | UUID (FK → User) | |
| created_at | DateTime | |
| updated_at | DateTime | |

### Company
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| name | String | |
| slug | String (unique) | URL-friendly |
| logo_url | String (nullable) | |
| is_active | Boolean | default: true |
| created_at | DateTime | |
| updated_at | DateTime | |

### CompanyCredential
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| company_id | UUID (FK → Company) | |
| meta_app_id | String | encrypted (AES-256) |
| meta_app_secret | String | encrypted |
| verify_token | String | encrypted |
| phone_number_id | String (nullable) | |
| waba_id | String (nullable) | |
| access_token | String | encrypted |
| created_at | DateTime | |
| updated_at | DateTime | |

### WebhookRoute
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| company_id | UUID (FK → Company) | |
| name | String | |
| icon | String | nome do ícone Lucide |
| url | String | |
| secret_key | String (nullable) | encrypted |
| events | JSON | array de eventos selecionados |
| is_active | Boolean | default: true |
| headers | JSON (nullable) | headers customizados key-value |
| created_at | DateTime | |
| updated_at | DateTime | |

### WebhookLog
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| company_id | UUID (FK → Company) | |
| route_id | UUID (FK → WebhookRoute) | |
| event_type | String | ex: messages, statuses.read |
| payload | JSON | webhook completo da Meta |
| status | Enum | delivered, failed, pending, retrying |
| http_status | Int (nullable) | |
| response_body | String (nullable) | |
| error_message | String (nullable) | |
| duration_ms | Int | |
| attempt | Int | default: 1 |
| created_at | DateTime | |
| delivered_at | DateTime (nullable) | |

### GlobalSettings
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| key | String (unique) | |
| value | JSON | |
| updated_by | UUID (FK → User) | |
| updated_at | DateTime | |

Chaves previstas:
- `retry_max_attempts` (default: 3)
- `retry_intervals_seconds` (default: [10, 30, 90])
- `retry_strategy` (exponential | fixed)
- `log_full_retention_days` (default: 90)
- `log_summary_retention_days` (default: 90)
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
| channels_sent | JSON | ["platform", "email", "whatsapp"] |
| is_read | Boolean | default: false |
| created_at | DateTime | |

### AuditLog
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK → User) | |
| action | String | ex: user.login, credential.update |
| resource_type | String | ex: company, user, route |
| resource_id | UUID (nullable) | |
| details | JSON | dados da ação |
| ip_address | String | |
| created_at | DateTime | |

---

## 5. Eventos do WhatsApp Cloud API

### Mensagens Recebidas (messages)
- `text` — Mensagem de texto
- `image` — Imagem
- `audio` — Áudio/voz
- `video` — Vídeo
- `document` — Documento
- `sticker` — Figurinha
- `location` — Localização
- `contacts` — Cartão de contato
- `reaction` — Reação a mensagem
- `interactive` — Resposta de botão/lista interativa
- `button` — Clique em botão de template
- `order` — Pedido de produto (catálogo)
- `referral` — Mensagem vinda de anúncio
- `system` — Mensagem de sistema
- `request_welcome` — Usuário abre conversa pela primeira vez
- `nfm_reply` — Resposta de WhatsApp Flow
- `unknown` — Tipo não suportado

### Status de Mensagens (statuses)
- `sent` — Enviada
- `delivered` — Entregue
- `read` — Lida
- `failed` — Falha

### Chamadas (calls)
- `inbound` — Chamada recebida
- `outbound` — Chamada realizada

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
- `flow_status_change` — Status do flow
- `client_error_rate` — Taxa de erro no cliente
- `endpoint_error_rate` — Taxa de erro no endpoint
- `endpoint_latency` — Latência do endpoint
- `endpoint_availability` — Disponibilidade do endpoint
- `flow_version_freeze_warning` — Versão prestes a expirar

### SMB
- `smb_message_echoes` — Mensagens enviadas pelo app nativo

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
- Header: logo, nome, status
- Abas: Visão Geral, Credenciais, Rotas de Webhook, Logs

**Aba Credenciais**
- Campos Meta: App ID, App Secret, Verify Token, Access Token, Phone Number ID, WABA ID
- Máscara mostrar/ocultar em campos sensíveis

**Aba Rotas de Webhook**
- Lista: ícone Lucide, nome, URL (mascarada), status, badge de eventos
- Botão "Nova Rota"

**Cadastro/Edição de Rota** (modal ou página)
- Nome, seletor de ícone Lucide (grid com busca), URL destino
- Secret key (opcional), headers customizados (key-value)
- Checklist de eventos agrupados por 9 categorias, colapsáveis
- Botão "Selecionar todos", badge de contagem

**Aba Logs**
- Tabela: timestamp, evento, rota, status (tag colorida), duração, tentativa
- Expandir: payload, response, erro
- Filtros: status, evento, rota, período
- Reenvio individual e em lote
- Exportação CSV

**Usuários** (`/users`)
- Tabela: avatar, nome, e-mail, role, status, criação
- Botão "Convidar Usuário" (modal: nome, e-mail, role)
- Ações: editar role, ativar/desativar, remover

**Perfil** (`/profile`)
- Upload de foto com preview
- Nome, e-mail editáveis
- Redefinir senha
- Seleção de tema

**Configurações Globais** (`/settings`) — Apenas super_admin
- **Retry:** tentativas, intervalos, estratégia, timeout
- **Retenção:** dias payload completo (default 90), dias resumo (default 90)
- **Notificações:** toggles (plataforma, e-mail, WhatsApp) com regra e-mail OU WhatsApp sempre ativo. Threshold de falhas
- **WhatsApp:** provedor (Cloud API / Custom), campos de config, número destino

**Notificações** (dropdown sino)
- Badge com contagem, lista com título/mensagem/horário/tipo
- Deep link para tela do problema
- Marcar como lida

---

## 7. Segurança

### Criptografia em Trânsito
- HTTPS/TLS via Cloudflare + Traefik
- Entrega para rotas sempre via HTTPS

### Criptografia em Repouso
- AES-256-GCM para credenciais e secret keys
- Chave em variável de ambiente (ENCRYPTION_KEY)
- Senhas com bcrypt (12 salt rounds)

### Validação de Webhooks
- X-Hub-Signature-256 com App Secret por empresa
- Assinatura inválida = HTTP 401 + log de tentativa suspeita
- Verify Token único por empresa

### Autenticação
- NextAuth.js com JWT criptografado (JWE)
- Refresh token com rotação
- Sessão expira por inatividade
- Rate limiting no login: 5 tentativas/min, bloqueio 15min

### Autorização (RBAC)

| Recurso | super_admin | admin | manager | viewer |
|---------|:-----------:|:-----:|:-------:|:------:|
| Dashboard global | ✅ | ✅ | ✅ | ✅ |
| Ver empresas | ✅ | ✅ | ✅ | ✅ |
| Criar/editar empresa | ✅ | ✅ | ❌ | ❌ |
| Gerenciar credenciais | ✅ | ✅ | ❌ | ❌ |
| Criar/editar rotas | ✅ | ✅ | ✅ | ❌ |
| Ver logs | ✅ | ✅ | ✅ | ✅ |
| Reenviar webhooks | ✅ | ✅ | ✅ | ❌ |
| Gerenciar usuários | ✅ | ✅ | ❌ | ❌ |
| Configurações globais | ✅ | ❌ | ❌ | ❌ |
| Alterar roles | ✅ | ❌ | ❌ | ❌ |
| Audit log | ✅ | ❌ | ❌ | ❌ |

### Proteções
- CSRF via NextAuth.js
- Helmet.js (headers de segurança)
- Sanitização de inputs (XSS, SQL injection)
- Audit log com timestamp, usuário e IP
- Credenciais mascaradas na API

---

## 8. Jobs Automáticos

| Job | Função | Frequência |
|-----|--------|-----------|
| webhook-delivery | Entrega webhooks para rotas | Contínuo (evento) |
| webhook-retry | Reprocessa falhas conforme config | Contínuo (evento) |
| log-cleanup | Remove payloads antigos e resumos expirados | Diário (meia-noite) |
| notification-dispatcher | Envia alertas (e-mail, WhatsApp) no threshold | Contínuo (evento) |

---

## 9. Funcionalidades Extras

1. **Health Check por Rota** — Ping periódico nas URLs, indicador visual (verde/vermelho/cinza)
2. **Endpoint de Status** — `/api/health` para monitoramento externo
3. **Exportação de Logs** — CSV com filtros aplicados
4. **Modo de Teste por Rota** — Botão "Enviar teste" com payload de exemplo
5. **Busca Global** — `Ctrl+K` para busca rápida em toda plataforma
6. **Seeding Super Admin** — Criação automática via variáveis de ambiente na primeira execução
7. **Audit Log** — Registro de ações sensíveis, acessível pelo super_admin
8. **Verificação Meta** — Endpoint GET para challenge/response com Verify Token por empresa

---

## 10. Deploy

### Docker Compose (Portainer Stack)
- **Container 1:** Next.js App (frontend + API + worker)
- **Container 2:** PostgreSQL 16 Alpine
- **Container 3:** Redis 7 Alpine
- **Rede:** traefik-public (externa) + internal (overlay)
- **Volumes:** postgres_data, redis_data

### CI/CD
- GitHub Actions: build Docker a cada push na main
- Push para GitHub Container Registry (ghcr.io)
- Atualização via re-deploy no Portainer

### Variáveis de Ambiente
- `DATABASE_URL` — Conexão PostgreSQL
- `REDIS_URL` — Conexão Redis
- `NEXTAUTH_SECRET` — Secret do NextAuth
- `NEXTAUTH_URL` — URL pública da plataforma
- `ENCRYPTION_KEY` — Chave AES-256 para credenciais
- `RESEND_API_KEY` — API key do Resend
- `ADMIN_EMAIL` — E-mail do super admin (seeding)
- `ADMIN_PASSWORD` — Senha do super admin (seeding)
