# Nexus Roteador Webhook

## Projeto
Plataforma de roteamento inteligente de webhooks da Meta (WhatsApp Cloud API).
Deploy via Docker Swarm Stack no Portainer (VPS).

**URL Produção:** https://roteadorwebhook.nexusai360.com
**Repositório:** https://github.com/jvzanini/nexus-roteador-webhook

## Status
- **Fase 1:** CONCLUÍDA (em produção)
- **Fase 2:** Pendente (dashboard, tempo real, notificações)
- **Fase 3:** Pendente (gestão usuários, WhatsApp, busca global)

## Idioma
Sempre responder em português brasileiro.

## Convenções
- Commits em português
- Código e variáveis em inglês
- Comentários em português quando necessário

## Stack Técnica
- Next.js 14+ (App Router, Server Components, Server Actions)
- TypeScript
- Prisma v7 — imports de `@/generated/prisma/client` (NÃO `@prisma/client`)
- PostgreSQL 16 + Redis 7 + BullMQ
- NextAuth.js v5 (JWT stateless, trustHost: true)
- Tailwind CSS + shadcn/ui (base-ui) — usar `render` prop, NÃO `asChild`
- Framer Motion — `as const` em variants com `ease`
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

## Documentação
- **Spec:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md` (v7)
- **Planos:** `docs/superpowers/plans/2026-04-03-fase1-*.md`
- **Design System:** `design-system/nexus-roteador-webhook/MASTER.md`
