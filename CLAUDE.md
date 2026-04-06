# Nexus Roteador Webhook

## Projeto
Plataforma de roteamento inteligente de webhooks da Meta (WhatsApp Cloud API).
Deploy via Docker Swarm Stack no Portainer (VPS).

**URL Produção:** https://roteadorwebhook.nexusai360.com
**Repositório:** https://github.com/jvzanini/nexus-roteador-webhook

## Status
- **Fase 1:** CONCLUÍDA (em produção)
- **Fase 2A:** CONCLUÍDA (em produção) — dashboard real, gráficos, reenvio, UI premium
- **Pendentes pré-2B:** CONCLUÍDOS — Aba Logs integrada + Visão Geral mini dashboard
- **Fase 2B:** CONCLUÍDA (em produção) — config globais, notificações, real-time SSE, health check
- **Fase 3:** Em progresso — gestão usuários OK, ajustes UI/UX massivos OK, super admin auto-vinculado OK, selects padronizados OK, esqueci senha OK, perfil completo OK (avatar, nome, email com verificação, senha, tema). Pendente: busca global, exportação CSV
- **Fase 3B:** CONCLUÍDA — rebranding roxo Nexus AI, light mode, responsividade mobile/tablet, login redesign, selects padronizados, sidebar sync avatar/nome

## Idioma
Sempre responder em português brasileiro.

## Convenções
- Commits em português
- Código e variáveis em inglês
- Comentários em português quando necessário
- Server Actions em `src/lib/actions/` (pasta única consolidada)
- Tabs da empresa: "Visão Geral", "WhatsApp Cloud", "Rotas de Webhook", "Logs", "Membros"
- Todo texto visível ao usuário DEVE ter acentos e caracteres PT-BR corretos

## Stack Técnica
- Next.js 14+ (App Router, Server Components, Server Actions)
- TypeScript
- Prisma v7 — imports de `@/generated/prisma/client` (NÃO `@prisma/client`)
- PostgreSQL 16 + Redis 7 + BullMQ
- NextAuth.js v5 (JWT stateless, trustHost: true)
- Tailwind CSS + shadcn/ui (base-ui) — usar `render` prop, NÃO `asChild`
- next-themes (ThemeProvider) — dark/light/system mode
- Framer Motion — `as const` em variants com `ease`
- Recharts (gráficos do dashboard)
- Lucide React (ícones, NUNCA emojis)

## Identidade Visual
- **Cor primária:** Roxo/Violet (#7c3aed dark, #6d28d9 light) — extraído do logo Nexus AI
- **Logo:** `public/logo-nexus-ai.png` (ícone N com gradiente roxo)
- **Marca dark:** `public/marca-nexus-ai-dark.png`
- **Marca light:** `public/marca-nexus-ai-light.png`
- **Temas:** Dark (padrão), Light, Sistema — gerenciados por next-themes
- **CSS variables:** Todas as cores via CSS custom properties em globals.css
- **Selects:** Usar `CustomSelect` de `@/components/ui/custom-select.tsx` (padrão label + descrição)

## Deploy
- **Ambiente:** Produção direta (sem staging)
- **Pipeline:** Push main → GitHub Actions (test → build → deploy automático)
- **Infraestrutura:** Docker Swarm Stack via Portainer (4 containers)
- **Registry:** ghcr.io/jvzanini/nexus-roteador-webhook
- **Rede:** rede_nexusAI (externa)
- **Stack Portainer ID:** 101
- **Migrations:** Prisma v7 não suporta migrate deploy no runtime. Aplicar via psql direto no container db

## Skills Obrigatórias
- **dotcontext MCP:** Gerenciamento de contexto e memória do projeto
- **superpowers:** Brainstorm, planejamento, desenvolvimento, testes, debugging
- **ui-ux-pro-max:** OBRIGATÓRIO para TODO layout/UI — design system em `design-system/nexus-roteador-webhook/MASTER.md`

## Regras
- Testes direto em produção
- Todo serviço sobe como container Docker dentro da stack
- Usar docker-compose.yml compatível com Portainer stacks
- Credenciais NUNCA no GitHub — apenas em `.env.production` (local)
- Ir pelo caminho mais simples e direto, sem complicar
- Phone Number ID e WABA ID são obrigatórios nas credenciais
- Webhook key personalizável (opcional, auto-gera se vazio)

## Estrutura de Actions
Todas as Server Actions ficam em `src/lib/actions/`:
- `company.ts` — CRUD de empresas
- `credential.ts` — CRUD de credenciais (WhatsApp Cloud)
- `logs.ts` — consulta de logs (cursor-based pagination)
- `webhook-routes.ts` — CRUD de rotas
- `dashboard.ts` — métricas e dados do dashboard (action agregadora) + `getCompanyOverviewData`
- `settings.ts` — CRUD de configurações globais (admin-only)
- `notifications.ts` — feed de notificações (getNotifications, markAsRead, markAllAsRead)
- `resend.ts` — reenvio de webhooks (delivery derivada)
- `users.ts` — CRUD usuários + memberships (com controle hierárquico de acesso)
- `password-reset.ts` — solicitar e redefinir senha (token + Resend email)
- `profile.ts` — perfil do usuário (avatar, nome, email com verificação, senha, tema)

## Regras de Acesso (Hierarquia)
- Super Admin > Admin (company_admin) > Gerente (manager) > Visualizador (viewer)
- Super Admin: vê e edita todos. Não pode ser excluído pela plataforma. Auto-vinculado como company_admin em toda nova empresa
- Admin: vê admins (sem editar) + níveis abaixo (edita). Não vê super admins
- /users e /settings: apenas super admin e admin
- Aba Membros: apenas super admin e admin

## Próximo Passo
Continuar Fase 3:
1. **Busca global** — busca unificada no header
2. **Exportação CSV** — logs e métricas
3. **Integração Meta API** — configurar webhook automaticamente no app Meta

## Documentação
- **Spec geral:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md` (v7)
- **Spec Fase 2A:** `docs/superpowers/specs/2026-04-04-fase2a-dashboard-reenvio-design.md` (v3)
- **Planos Fase 1:** `docs/superpowers/plans/2026-04-03-fase1-*.md`
- **Plano Fase 2A:** `docs/superpowers/plans/2026-04-04-fase2a-dashboard-reenvio.md`
- **Plano Fase 3B:** `docs/superpowers/plans/2026-04-06-fase3b-rebranding-responsividade-ajustes.md`
- **Spec Logs+Overview:** `docs/superpowers/specs/2026-04-04-logs-overview-tabs-design.md`
- **Spec Ajustes UI/UX:** `docs/superpowers/specs/2026-04-05-ajustes-ui-ux-massivos.md`
- **Design System:** `design-system/nexus-roteador-webhook/MASTER.md`
