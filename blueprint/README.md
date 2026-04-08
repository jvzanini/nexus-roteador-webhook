# Blueprint Nexus AI

> Documentação modular para criar novas plataformas a partir da base técnica do Nexus.
> O Claude Code lê este blueprint e constrói plataformas completas — do login ao deploy.

**Versão:** 1.0
**Última atualização:** 2026-04-07
**Projeto de referência:** Nexus Roteador Webhook

---

## Como Usar

Este blueprint é lido pelo Claude Code para construir novas plataformas.
Ao iniciar um novo projeto, aponte o Claude Code para esta pasta e diga:
"Cria uma nova plataforma usando o blueprint em [caminho]/blueprint/"

---

## Catálogo de Módulos

### Core (sempre incluído)
| Subsistema | Descrição | Doc |
|------------|-----------|-----|
| Auth | Login, JWT stateless, rate limiting, middleware | core/overview.md |
| Users | CRUD, hierarquia 4 níveis, ativação/desativação | core/overview.md |
| Profile | Avatar, nome, email com verificação, senha, tema | core/overview.md |
| Password Reset | Esqueci senha com token + email (1h expiração) | core/overview.md |
| Email | Resend SDK, templates HTML dark-themed responsivos | core/overview.md |

### Módulos Opcionais
| Módulo | Descrição | Depende de | Doc |
|--------|-----------|-----------|-----|
| Multi-tenant | Empresas, workspaces, scoping de dados | auth, users | [modules/multi-tenant.md](modules/multi-tenant.md) |
| Notifications | Feed, badge no header, contagem, mark as read | auth | [modules/notifications.md](modules/notifications.md) |
| Audit Log | Registro fire-and-forget (quem, o quê, quando) | auth | [modules/audit-log.md](modules/audit-log.md) |
| Real-time | SSE + Redis Pub/Sub, useRealtime hook | Redis | [modules/realtime.md](modules/realtime.md) |
| Encryption | AES-256-GCM, encrypt/decrypt/mask | — | [modules/encryption.md](modules/encryption.md) |
| Toast | Sonner customizado, pilha bottom-up, timers independentes | — | [modules/toast.md](modules/toast.md) |

### Patterns (arquitetura adaptável)
| Pattern | Descrição | Depende de | Doc |
|---------|-----------|-----------|-----|
| Dashboard | Stats cards, gráficos Recharts, filtros, tabela | — | [patterns/dashboard.md](patterns/dashboard.md) |
| Queue | BullMQ worker, retry com backoff, DLQ | Redis, realtime (opc.) | [patterns/queue.md](patterns/queue.md) |
| Settings | Config globais key-value, admin-only | auth | [patterns/settings.md](patterns/settings.md) |
| Webhook Routing | Receber, normalizar, dedup, entregar | queue, encryption | [patterns/webhook-routing.md](patterns/webhook-routing.md) |

---

## Sugestões por Tipo de Plataforma

| Tipo | Módulos recomendados |
|------|---------------------|
| SaaS multi-tenant | core + multi-tenant + dashboard + notifications + audit-log |
| Painel admin interno | core + dashboard + audit-log + settings |
| API/Integração | core + queue + encryption + webhook-routing |
| Ferramenta simples | core apenas |
| CRM | core + multi-tenant + dashboard + notifications + audit-log + encryption |

---

## Fluxo de Criação de Nova Plataforma

### Passo 1: Coleta de Identidade

Perguntar ao usuário:

1. **Nome da plataforma** — ex: "Nexus CRM"
2. **O que ela faz** (uma frase) — ex: "Gestão de clientes e pipeline de vendas"
3. **Interno Nexus AI ou externo?**
   - Se interno: domínio será `[slug].nexusai360.com`
   - Se externo: perguntar domínio completo
4. **Cor primária** (hex) — se não souber, sugerir baseado no tipo. Default: `#7c3aed`
5. **Logo** (caminho) — se não tiver, usar placeholder
6. **Registry Docker** — default: `ghcr.io/jvzanini`

### Passo 2: Seleção de Módulos

Apresentar o catálogo completo (seção acima).
Marcar recomendados baseado no tipo da plataforma.
Perguntar se quer adicionar ou remover.

### Passo 3: Criação do Projeto

Ordem de execução:

1. Criar diretório, `npm init`, `git init`
2. Gerar `src/lib/app.config.ts` a partir de `blueprint/templates/app.config.ts`
3. Instalar dependências:
   - Core: `next react react-dom next-auth@5 @auth/prisma-adapter prisma @prisma/client bcryptjs zod resend tailwindcss @tailwindcss/postcss postcss framer-motion lucide-react sonner next-themes ioredis`
   - Types: `@types/node @types/react @types/react-dom @types/bcryptjs typescript`
   - shadcn/ui: `@base-ui-components/react`
   - Por módulo: `bullmq` (queue), `recharts` (dashboard)
4. Gerar `prisma/schema.prisma` combinando core + módulos (ler `blueprint/core/database.md`)
5. Gerar `src/app/globals.css` a partir de `blueprint/templates/globals.css` (substituir cores)
6. Gerar `docker-compose.yml` a partir de `blueprint/templates/docker-compose.yml`
7. Gerar `.github/workflows/build.yml` a partir de `blueprint/templates/build.yml`
8. Gerar `docker/Dockerfile` a partir de `blueprint/templates/Dockerfile`
9. Gerar `.env.example` a partir de `blueprint/templates/env.example`
10. Implementar core (ler `blueprint/core/overview.md`, referenciar código do Nexus)
11. Implementar módulos selecionados (ler `blueprint/modules/{nome}.md`)
12. Implementar patterns selecionados (ler `blueprint/patterns/{nome}.md`)
13. Gerar `CLAUDE.md` a partir de `blueprint/templates/claude-md.template`

### Passo 4: Validação

1. `npx tsc --noEmit` — zero erros
2. `npm run build` — build passa
3. `docker compose config` — compose válido
4. Verificar que `APP_CONFIG` é a única fonte de identidade

### Passo 5: Registro

No CLAUDE.md do novo projeto, incluir:
- "Criado a partir do Nexus Blueprint em [caminho]"
- Lista de módulos incluídos
- "Para adicionar módulos: ler blueprint/modules/{nome}.md"

---

## Fluxo: Adicionar Módulo a Plataforma Existente

1. Ler o CLAUDE.md da plataforma → saber quais módulos já tem
2. Ler `blueprint/modules/{novo-modulo}.md`
3. Ler `blueprint/integration-map.md` → entender impacto
4. Seguir seção "Integração" do módulo:
   - Adicionar modelos ao schema Prisma
   - Criar migration
   - Implementar server actions
   - Adicionar componentes UI
   - Atualizar navigation se necessário
5. Atualizar CLAUDE.md com novo módulo

---

## Changelog

- v1.0 (2026-04-07) — Versão inicial: core (4 docs), templates (7 arquivos)
- v1.1 (2026-04-08) — Fase 2: módulos multi-tenant, notifications, audit-log, toast
- v1.2 (2026-04-08) — Fase 3: módulos realtime, encryption + patterns dashboard, queue, settings, webhook-routing. Blueprint completo.
