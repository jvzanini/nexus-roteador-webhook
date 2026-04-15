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
- **Fase 3:** CONCLUÍDA — gestão usuários, ajustes UI/UX massivos, super admin auto-vinculado, selects padronizados, esqueci senha, perfil completo (avatar, nome, email com verificação, senha, tema)
- **Fase 3B:** CONCLUÍDA — rebranding roxo Nexus AI, light mode, responsividade mobile/tablet, login redesign, selects padronizados, sidebar sync avatar/nome
- **Fase 3C:** CONCLUÍDA — controle de acesso completo (backend+frontend), segurança webhook-routes e logs, fix updateUser, excluir empresa, slug editável, viewer read-only, selects inline usuários
- **Fase 3D:** CONCLUÍDA — sistema de permissões em duas camadas (platformRole + CompanyRole independentes), JWT refresh em tempo real, login usuário inativo, sidebar com role real
- **Fase 3E:** CONCLUÍDA — toast estilo Portainer (pilha bottom-up, timers independentes via pointer-events), data minúscula dashboard, selects largura ajustada, ring inputs corrigido, coluna nível membros, limpeza arquivos obsoletos
- **Busca Global:** CONCLUÍDA — command palette ⌘K, busca em 4 entidades (empresas/rotas/logs/usuários), deep-link tabs, tenant scoping, contexto React, AbortController + debounce 300ms
- **Ajustes pós-Busca:** CONCLUÍDOS — slug salva webhookKey (bug fix), overview simplificado (remove Webhook Key), header/overview dinâmicos, deep-link via window.history.replaceState, copiar URL rota, ícone empresa nas tags, card Rotas flex-1 alinhado
- **Tema cookie SSR:** CONCLUÍDO — next-themes removido, ThemeProvider custom via cookie SSR-aware, html class renderizada no primeiro byte (zero flicker), preferência sincronizada via login action, persistência DB via /api/user/theme
- **Relatórios CSV:** CONCLUÍDO — página /relatorios, 4 tipos (logs, empresas, rotas, usuários), streaming com BOM UTF-8, rate limit Redis, proteção formula-injection (CWE-1236), permissões em três camadas (plataforma + tipo + empresa), managers incluídos sem acesso a Usuários, validação HEAD antes do download, range logs limitado a 90 dias, cap 50k linhas, 43 testes unitários (csv + filters + authorize)

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
- **superpowers:subagent-driven-development:** OBRIGATÓRIO para TODA implementação — nenhuma fase de código é escrita fora desse fluxo
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
1. **Integração Meta API** — configurar webhook automaticamente no app Meta

## Documentação
- **Spec Relatórios CSV:** `docs/superpowers/specs/2026-04-10-relatorios-csv-design.md`
- **Plano Relatórios CSV:** `docs/superpowers/plans/2026-04-10-relatorios-csv.md`
- **Spec geral:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md` (v7)
- **Spec Fase 2A:** `docs/superpowers/specs/2026-04-04-fase2a-dashboard-reenvio-design.md` (v3)
- **Planos Fase 1:** `docs/superpowers/plans/2026-04-03-fase1-*.md`
- **Plano Fase 2A:** `docs/superpowers/plans/2026-04-04-fase2a-dashboard-reenvio.md`
- **Plano Fase 3B:** `docs/superpowers/plans/2026-04-06-fase3b-rebranding-responsividade-ajustes.md`
- **Plano Fase 3C:** `docs/superpowers/plans/2026-04-06-fase3c-controle-acesso-ajustes-ui.md`
- **Spec Logs+Overview:** `docs/superpowers/specs/2026-04-04-logs-overview-tabs-design.md`
- **Spec Ajustes UI/UX:** `docs/superpowers/specs/2026-04-05-ajustes-ui-ux-massivos.md`
- **Spec Permissões:** `docs/superpowers/specs/2026-04-06-permissoes-duas-camadas-design.md`
- **Design System:** `design-system/nexus-roteador-webhook/MASTER.md`

## Toast System
- Sonner v2 customizado com MutationObserver em `src/components/ui/sonner.tsx`
- Pilha bottom-up: flex column-reverse no `<ol>`, position relative nos toasts
- Timers independentes: pointer-events none no `<ol>`, auto em cada `<li>`
- Progress bar CSS: `::before` com animação toast-shrink (4s)
- Animação entrada: slide-up com cubic-bezier spring
- Animação saída: colapso suave (height/opacity/margin transition)

## Tema (dark/light/system)
- **next-themes é a fonte única de verdade** — não criar wrappers que setem tema via session/JWT
- Persistência no banco via `POST /api/user/theme` (fetch, NÃO server action)
  - Server actions disparam re-render implícito do server component → causa flicker
- Qualquer componente que lê `useTheme()` deve usar `mounted` state guard antes de renderizar UI que depende do tema
- CSS overrides globais em `globals.css` (`:root:not(.dark) .text-*-400`) tornam cores dark-only theme-aware no light mode
- Badges de role em `src/lib/constants/roles.ts` usam padrão `text-*-600 dark:text-*-400`

## Build Local (iCloud Drive)
Projeto está em `~/Desktop` que é sincronizado com iCloud Drive. Durante builds repetidos, iCloud cria arquivos de conflito (`name 2.json`, `node_modules 2/`, etc) em `.next` que quebram `rm -rf` padrão.
- `npm run clean` — limpa conflitos + remove `.next`
- `npm run build:clean` — limpa + build (use localmente quando travar)
- `npm run build` — build padrão (usado no CI, sem problema de iCloud)
- Script em `scripts/clean-build.js`
