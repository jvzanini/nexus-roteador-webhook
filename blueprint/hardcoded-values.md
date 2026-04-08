# Valores Hardcoded — Nexus Roteador Webhook

Inventario completo de tudo que muda por plataforma/cliente. Organizado em 5 categorias.

---

## 1. Identidade e Marca

| # | Arquivo | Valor atual no Nexus | O que substituir |
|---|---------|---------------------|------------------|
| 1 | `src/app/layout.tsx` | `title: "Nexus \| Roteador Webhook"` | APP_CONFIG.appName + APP_CONFIG.tagline |
| 2 | `src/app/layout.tsx` | `description: "Roteador de webhooks da Meta para multiplos destinos"` | APP_CONFIG.description |
| 3 | `src/app/(auth)/login/page.tsx` | `title: 'Login \| Nexus Roteador Webhook'` | APP_CONFIG.appName |
| 4 | `src/app/(auth)/login/page.tsx` | `description: 'Acesse o painel do Nexus Roteador Webhook'` | APP_CONFIG.description |
| 5 | `src/components/login/login-content.tsx` | `src="/logo-nexus-ai.png"`, `alt="Nexus AI"` | APP_CONFIG.logoPath, APP_CONFIG.appName |
| 6 | `src/components/login/login-content.tsx` | `<h1>Nexus AI</h1>`, `<p>Roteador de Webhooks</p>` | APP_CONFIG.appName, APP_CONFIG.tagline |
| 7 | `src/components/layout/sidebar.tsx` | `src="/logo-nexus-ai.png"`, `alt="Nexus AI"`, `<h1>Nexus AI</h1>`, `<p>Roteador Webhook</p>` | APP_CONFIG.logoPath, APP_CONFIG.appName, APP_CONFIG.tagline |
| 8 | `src/app/(auth)/login/page.tsx` | `NexusAI360 &copy; {new Date().getFullYear()}. Todos os direitos reservados.` | APP_CONFIG.copyrightHolder |

---

## 2. Cores e Tema

| # | Arquivo | Valor atual no Nexus | O que substituir |
|---|---------|---------------------|------------------|
| 1 | `src/app/globals.css` | `:root { --primary: #6d28d9; --ring: #6d28d9; --sidebar-primary: #6d28d9; --sidebar-ring: #6d28d9 }` (light mode) | APP_CONFIG.colors.primaryLight ou manual em globals.css |
| 2 | `src/app/globals.css` | `.dark { --primary: #7c3aed; --ring: #7c3aed; --sidebar-primary: #7c3aed; --sidebar-ring: #7c3aed }` (dark mode) | APP_CONFIG.colors.primaryDark ou manual em globals.css |
| 3 | `src/components/layout/sidebar.tsx` | Classes `text-violet-500`, `border-violet-500` (item ativo do menu) | Substituir violet-500 pela cor primaria do Tailwind correspondente |
| 4 | `src/components/login/login-content.tsx` | `from-violet-600 to-purple-600` (botao), `hover:from-violet-500 hover:to-purple-500`, `hover:shadow-[0_0_24px_rgba(124,58,237,0.4)]`, `focus:border-violet-500 focus:ring-violet-500/50` (inputs), `hover:text-violet-400` (link esqueci senha) | Substituir violet/purple pelas cores primarias do cliente |
| 5 | `src/app/(auth)/login/page.tsx` | `from-violet-950/80`, `to-purple-950/60`, `bg-violet-600/8`, `bg-purple-600/8` (gradientes de fundo) | Substituir violet/purple pelas cores primarias do cliente |
| 6 | `src/app/globals.css` | `--chart-1: #7c3aed; --chart-2: #8b5cf6; --chart-5: #a855f7` (cores de graficos roxas) | APP_CONFIG.colors.chartPrimary ou manual |
| 7 | `src/app/globals.css` | `background: linear-gradient(90deg, rgba(124, 58, 237, 0.5), rgba(168, 85, 247, 0.5))` (progress bar do toast) | Ajustar RGB para cor primaria do cliente |
| 8 | `src/components/layout/sidebar.tsx` | `shadow-[0_0_12px_rgba(124,58,237,0.3)]` (glow do logo) | Ajustar RGB para cor primaria do cliente |
| 9 | `src/components/login/login-content.tsx` | `boxShadow: '0 0 30px rgba(124, 58, 237, 0.12)'` e variantes (animacao glow do logo) | Ajustar RGB para cor primaria do cliente |

---

## 3. Infraestrutura

| # | Arquivo | Valor atual no Nexus | O que substituir |
|---|---------|---------------------|------------------|
| 1 | `docker-compose.yml` | `image: ghcr.io/jvzanini/nexus-roteador-webhook:latest` (servicos app e worker) | Registry e nome da imagem do cliente |
| 2 | `docker-compose.yml` | `Host(\`roteadorwebhook.nexusai360.com\`)` (Traefik router rule) | Dominio do cliente |
| 3 | `docker-compose.yml` | `NEXTAUTH_URL=https://roteadorwebhook.nexusai360.com` | URL de producao do cliente |
| 4 | `docker-compose.yml` | `POSTGRES_USER=nexus`, `POSTGRES_DB=nexus`, `postgresql://nexus:${DB_PASSWORD}@db:5432/nexus` | Nome do usuario e banco de dados do cliente |
| 5 | `.github/workflows/build.yml` | `IMAGE_NAME: ${{ github.repository }}` (resolve para jvzanini/nexus-roteador-webhook) | Repositorio do cliente |
| 6 | `.github/workflows/build.yml` | `nexus-roteador-webhook_app`, `nexus-roteador-webhook_worker` (nomes dos servicos Docker Swarm) | Prefixo do stack name do cliente |
| 7 | `.github/workflows/build.yml` | `ghcr.io/jvzanini/nexus-roteador-webhook` (pull image URL) | Registry e imagem do cliente |
| 8 | `src/lib/actions/profile.ts` | `process.env.NEXTAUTH_URL \|\| "https://roteadorwebhook.nexusai360.com"` (fallback URL) | APP_CONFIG.productionUrl ou remover fallback |
| 9 | `src/lib/actions/password-reset.ts` | `process.env.NEXTAUTH_URL \|\| "https://roteadorwebhook.nexusai360.com"` (fallback URL) | APP_CONFIG.productionUrl ou remover fallback |

---

## 4. Rotas Publicas

| # | Arquivo | Valor atual no Nexus | O que substituir |
|---|---------|---------------------|------------------|
| 1 | `src/auth.config.ts` | Rotas publicas: `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/api/webhook/*`, `/api/auth/*` | Manual — adicionar/remover conforme funcionalidades do cliente |
| 2 | `src/middleware.ts` | Matcher regex: `/((?!_next/static\|_next/image\|favicon\\.ico\|api/health\|api/webhook\|api/auth\|.*\\.(?:svg\|png\|jpg\|jpeg\|gif\|webp)$).*)` | Manual — incluir novas rotas publicas na regex |
| 3 | `src/lib/auth-helpers.ts` | `PUBLIC_ROUTES = ['/login', '/forgot-password']`, `PUBLIC_PREFIXES = ['/api/webhook/', '/api/auth/', '/api/health']` | Manual — sincronizar com auth.config.ts |

---

## 5. Textos em Portugues

### 5.1 Autenticacao e E-mail

| # | Arquivo | Texto | O que substituir |
|---|---------|-------|------------------|
| 1 | `src/lib/email.ts` | `FROM_EMAIL = "Nexus <noreply@nexusai360.com>"` | APP_CONFIG.email.fromName + APP_CONFIG.email.fromAddress |
| 2 | `src/lib/email.ts` | `subject: "Redefinicao de senha — Nexus Roteador Webhook"` | APP_CONFIG.appName |
| 3 | `src/lib/email.ts` | `subject: "Confirme seu novo e-mail — Nexus Roteador Webhook"` | APP_CONFIG.appName |
| 4 | `src/lib/email.ts` | `<h1>Nexus Roteador Webhook</h1>` (2 ocorrencias, templates de email) | APP_CONFIG.appName |
| 5 | `src/lib/email.ts` | `NexusAI360 &copy;` (2 ocorrencias, rodape dos emails) | APP_CONFIG.copyrightHolder |
| 6 | `src/lib/email.ts` | `background: #2563eb` (icone do email), `background: linear-gradient(to right, #2563eb, #3b82f6)` (botao do email) | Cores primarias do cliente nos templates de email |
| 7 | `src/auth.ts` | `'E-mail invalido'`, `'Senha e obrigatoria'` | i18n ou manter PT-BR |
| 8 | `src/lib/auth-helpers.ts` | `'Muitas tentativas de login. Tente novamente em 15 minutos.'` | i18n ou manter PT-BR |

### 5.2 Navegacao e Roles

| # | Arquivo | Texto | O que substituir |
|---|---------|-------|------------------|
| 1 | `src/lib/constants/navigation.ts` | `label: "Dashboard"`, `label: "Empresas"`, `label: "Usuarios"`, `label: "Configuracoes"` | i18n ou manter PT-BR |
| 2 | `src/lib/constants/roles.ts` | `PLATFORM_ROLE_LABELS: { super_admin: "Super Admin", admin: "Admin", manager: "Gerente", viewer: "Visualizador" }` | i18n ou manter PT-BR |
| 3 | `src/lib/constants/roles.ts` | `COMPANY_ROLE_LABELS: { company_admin: "Admin", manager: "Gerente", viewer: "Visualizador" }` | i18n ou manter PT-BR |
| 4 | `src/lib/constants/roles.ts` | `COMPANY_ROLE_OPTIONS descriptions: "Gerencia a empresa", "Gerencia rotas e webhooks", "Apenas visualizacao"` | i18n ou manter PT-BR |

### 5.3 Tenant e Acesso

| # | Arquivo | Texto | O que substituir |
|---|---------|-------|------------------|
| 1 | `src/lib/tenant.ts` | `'Acesso negado: voce nao tem permissao para acessar esta empresa.'` | i18n ou manter PT-BR |

### 5.4 Interface do Login

| # | Arquivo | Texto | O que substituir |
|---|---------|-------|------------------|
| 1 | `src/components/login/login-content.tsx` | `"E-mail"` (label), `"seu@email.com"` (placeholder) | i18n ou manter PT-BR |
| 2 | `src/components/login/login-content.tsx` | `"Senha"` (label), `"********"` (placeholder) | i18n ou manter PT-BR |
| 3 | `src/components/login/login-content.tsx` | `"Esqueci minha senha"` | i18n ou manter PT-BR |
| 4 | `src/components/login/login-content.tsx` | `"Entrando..."`, `"Entrar"` (botao submit) | i18n ou manter PT-BR |
| 5 | `src/components/login/login-content.tsx` | `"Ocultar senha"`, `"Mostrar senha"` (aria-labels) | i18n ou manter PT-BR |

### 5.5 Layout e Sidebar

| # | Arquivo | Texto | O que substituir |
|---|---------|-------|------------------|
| 1 | `src/components/layout/sidebar.tsx` | `"Sair"` (botao logout) | i18n ou manter PT-BR |
| 2 | `src/app/(protected)/layout.tsx` | `'Usuario'` (fallback para role e nome) | i18n ou manter PT-BR |

### 5.6 Notificacoes

| # | Arquivo | Texto | O que substituir |
|---|---------|-------|------------------|
| 1 | `src/components/layout/notification-bell.tsx` | `"Notificacoes"` (titulo dropdown e aria-label) | i18n ou manter PT-BR |
| 2 | `src/components/layout/notification-bell.tsx` | `"Marcar todas como lidas"` | i18n ou manter PT-BR |
| 3 | `src/components/layout/notification-bell.tsx` | `"Nenhuma notificacao"` (estado vazio) | i18n ou manter PT-BR |
| 4 | `src/components/layout/notification-bell.tsx` | `"agora"`, `"min"`, `"h"`, `"d"` (funcao timeAgo) | i18n ou manter PT-BR |

### 5.7 Worker

| # | Arquivo | Texto | O que substituir |
|---|---------|-------|------------------|
| 1 | `src/worker/index.ts` | `"[worker] Starting Nexus webhook worker..."` | APP_CONFIG.appName ou manter (log interno) |
| 2 | `src/worker/delivery.ts` | Headers `X-Nexus-Delivery-Id`, `X-Nexus-Attempt`, `X-Nexus-Event-Type`, `X-Nexus-Timestamp`, `X-Nexus-Signature-256` | APP_CONFIG.headerPrefix (ex: "X-MeuApp-") — impacta integracao com clientes |

### 5.8 Canal Realtime

| # | Arquivo | Texto | O que substituir |
|---|---------|-------|------------------|
| 1 | `src/lib/realtime.ts` | `CHANNEL = "nexus:realtime"` | APP_CONFIG.realtimeChannel ou manual |

---

## Resumo de Impacto

| Categoria | Itens | Prioridade |
|-----------|-------|-----------|
| Identidade e Marca | 8 | Alta — visivel ao usuario final |
| Cores e Tema | 9 | Alta — define identidade visual |
| Infraestrutura | 9 | Critica — necessario para deploy |
| Rotas Publicas | 3 | Media — muda se funcionalidades mudam |
| Textos em Portugues | 25+ | Baixa (se manter PT-BR) / Alta (se i18n) |

### Arquivos com maior concentracao de valores hardcoded

1. `src/lib/email.ts` — 6 valores (marca, cor, textos)
2. `src/app/globals.css` — 9 valores de cor
3. `docker-compose.yml` — 5 valores de infra
4. `src/components/login/login-content.tsx` — 5 valores (marca, cor, textos)
5. `src/components/layout/sidebar.tsx` — 4 valores (marca, cor)
6. `.github/workflows/build.yml` — 3 valores de infra
