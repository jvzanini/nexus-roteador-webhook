# Nexus Roteador Webhook

## Projeto
Plataforma de roteamento inteligente de webhooks da Meta (WhatsApp Cloud API).
Deploy via Docker Swarm Stack no Portainer (VPS).

**URL Produção:** https://roteadorwebhook.nexusai360.com
**Repositório:** https://github.com/jvzanini/nexus-roteador-webhook

## Status
- **Fase 1:** CONCLUÍDA (em produção)
- **Fase 2A:** CONCLUÍDA (dashboard real, gráficos, reenvio) — aguardando deploy
- **Fase 2B:** Pendente (Socket.io, notificações, configurações globais, health check)
- **Fase 3:** Pendente (gestão usuários, WhatsApp, busca global)

## Idioma
Sempre responder em português brasileiro.

## Convenções
- Commits em português
- Código e variáveis em inglês
- Comentários em português quando necessário
- Server Actions em `src/lib/actions/` (pasta única consolidada)

## Stack Técnica
- Next.js 14+ (App Router, Server Components, Server Actions)
- TypeScript
- Prisma v7 — imports de `@/generated/prisma/client` (NÃO `@prisma/client`)
- PostgreSQL 16 + Redis 7 + BullMQ
- NextAuth.js v5 (JWT stateless, trustHost: true)
- Tailwind CSS + shadcn/ui (base-ui) — usar `render` prop, NÃO `asChild`
- Framer Motion — `as const` em variants com `ease`
- Recharts (gráficos do dashboard)
- Lucide React (ícones, NUNCA emojis)

## Deploy
- **Ambiente:** Produção direta (sem staging)
- **Pipeline:** Push main → GitHub Actions (test → build → deploy automático)
- **Infraestrutura:** Docker Swarm Stack via Portainer (4 containers)
- **Registry:** ghcr.io/jvzanini/nexus-roteador-webhook
- **Rede:** rede_nexusAI (externa)
- **Stack Portainer ID:** 101

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

## Estrutura de Actions
Todas as Server Actions ficam em `src/lib/actions/`:
- `company.ts` — CRUD de empresas
- `credential.ts` — CRUD de credenciais
- `logs.ts` — consulta de logs
- `webhook-routes.ts` — CRUD de rotas
- `dashboard.ts` — métricas e dados do dashboard
- `resend.ts` — reenvio de webhooks

## Documentação
- **Spec geral:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md` (v7)
- **Spec Fase 2A:** `docs/superpowers/specs/2026-04-04-fase2a-dashboard-reenvio-design.md` (v3)
- **Planos Fase 1:** `docs/superpowers/plans/2026-04-03-fase1-*.md`
- **Plano Fase 2A:** `docs/superpowers/plans/2026-04-04-fase2a-dashboard-reenvio.md`
- **Design System:** `design-system/nexus-roteador-webhook/MASTER.md`
