# Blueprint Independente — Fase 1 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair o blueprint do Nexus para um repo independente com plugin Claude Code funcional.

**Architecture:** Criar repo `nexus-ai-blueprint` no GitHub, migrar 27 arquivos do `blueprint/` do Nexus, adicionar plugin Claude Code (plugin.json + 2 skills), atualizar README e template, registrar plugin no settings.json, limpar o Nexus.

**Tech Stack:** Git, GitHub CLI (`gh`), Claude Code Plugin System (SKILL.md + plugin.json)

**Spec:** `docs/superpowers/specs/2026-04-08-blueprint-independente-design.md`

---

## File Structure

### Novo repo: `~/Desktop/nexus-ai-blueprint/`

Arquivos NOVOS (a criar):
```
.claude-plugin/plugin.json
skills/criar/SKILL.md
skills/listar/SKILL.md
```

Arquivos MIGRADOS (de blueprint/ do Nexus → raiz):
```
README.md (migrado + modificado: adicionar seção Instalação)
architecture.md
integration-map.md
hardcoded-values.md
core/overview.md
core/database.md
core/deploy.md
core/ui.md
modules/README.md
modules/multi-tenant.md
modules/notifications.md
modules/audit-log.md
modules/toast.md
modules/realtime.md
modules/encryption.md
patterns/README.md
patterns/dashboard.md
patterns/queue.md
patterns/settings.md
patterns/webhook-routing.md
templates/app.config.ts
templates/globals.css
templates/docker-compose.yml
templates/build.yml
templates/Dockerfile
templates/env.example
templates/claude-md.template (migrado + modificado: adicionar metodologia/versão/tipo)
```

### Modificações no Nexus:
```
CLAUDE.md (atualizar seção Blueprint)
blueprint/ (remover pasta inteira)
```

---

## Task 1: Criar repo no GitHub e migrar conteúdo

**Files:**
- Create: `~/Desktop/nexus-ai-blueprint/` (repo inteiro)
- Modify: nenhum do Nexus ainda

- [ ] **Step 1: Criar repositório no GitHub**

```bash
gh repo create jvzanini/nexus-ai-blueprint --private --description "Blueprint modular para criação de plataformas Nexus AI" --clone --clone-dir ~/Desktop/nexus-ai-blueprint
```

Esperado: repo criado e clonado em `~/Desktop/nexus-ai-blueprint/`

- [ ] **Step 2: Copiar todo o conteúdo do blueprint**

```bash
cp -r "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/blueprint/"* ~/Desktop/nexus-ai-blueprint/
```

Esperado: todos os 27 arquivos copiados.

- [ ] **Step 3: Verificar que tudo foi copiado**

```bash
cd ~/Desktop/nexus-ai-blueprint && find . -type f -not -path './.git/*' | sort | wc -l
```

Esperado: 27 arquivos.

- [ ] **Step 4: Commit inicial**

```bash
cd ~/Desktop/nexus-ai-blueprint
git add -A
git commit -m "feat: migração do blueprint do Nexus Roteador Webhook

Conteúdo migrado integralmente de blueprint/ do projeto Nexus.
27 arquivos: 4 docs raiz + 4 core + 6 módulos + 4 patterns + 7 templates + 2 READMEs"
git push origin main
```

---

## Task 2: Criar plugin.json

**Files:**
- Create: `~/Desktop/nexus-ai-blueprint/.claude-plugin/plugin.json`

- [ ] **Step 1: Criar diretório e arquivo**

```bash
mkdir -p ~/Desktop/nexus-ai-blueprint/.claude-plugin
```

- [ ] **Step 2: Escrever plugin.json**

```json
{
  "name": "nexus-ai-blueprint",
  "description": "Blueprint modular para criação de plataformas. Cria projetos completos com auth, multi-tenancy, dashboard e mais.",
  "version": "1.2.0"
}
```

Salvar em `~/Desktop/nexus-ai-blueprint/.claude-plugin/plugin.json`.

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/nexus-ai-blueprint
git add .claude-plugin/plugin.json
git commit -m "feat: plugin.json — manifesto do plugin Claude Code"
```

---

## Task 3: Criar skill `/nexus-ai-blueprint:listar`

**Files:**
- Create: `~/Desktop/nexus-ai-blueprint/skills/listar/SKILL.md`

A skill mais simples — fazemos primeiro.

- [ ] **Step 1: Criar diretório**

```bash
mkdir -p ~/Desktop/nexus-ai-blueprint/skills/listar
```

- [ ] **Step 2: Escrever SKILL.md**

O arquivo completo:

````markdown
---
name: listar
description: Lista todos os módulos e patterns disponíveis no Blueprint Nexus AI. Use para ver o catálogo completo antes de criar um projeto.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read Glob Grep
---

# Listar Módulos do Blueprint Nexus AI

Você é o assistente do Blueprint Nexus AI. Sua tarefa é listar todos os módulos e patterns disponíveis.

## Versão do Blueprint
!`cat ../../.claude-plugin/plugin.json 2>/dev/null || echo "versão não encontrada"`

## Instruções

Leia os arquivos do blueprint e apresente ao usuário em formato de tabelas organizadas.

### 1. Core (sempre incluído)

Leia o arquivo `../../core/overview.md`. Identifique os 5 subsistemas (Auth, Users, Profile, Password Reset, Email) e apresente:

| Subsistema | Descrição |
|------------|-----------|
| Auth | Login, JWT stateless, rate limiting, middleware |
| Users | CRUD, hierarquia 4 níveis, ativação/desativação |
| Profile | Avatar, nome, email com verificação, senha, tema |
| Password Reset | Esqueci senha com token + email (1h expiração) |
| Email | Resend SDK, templates HTML dark-themed responsivos |

### 2. Módulos Opcionais

Para cada arquivo `.md` em `../../modules/` (exceto README.md):
1. Leia o arquivo
2. Extraia o título (primeira linha `#`) e a seção `## Resumo`
3. Extraia a seção `## Dependências`

Apresente em tabela:

| Módulo | Descrição | Depende de |
|--------|-----------|-----------|

### 3. Patterns (arquitetura adaptável)

Para cada arquivo `.md` em `../../patterns/` (exceto README.md):
1. Leia o arquivo
2. Extraia o título e a seção `## Resumo`
3. Extraia `## Quando usar`

Apresente em tabela:

| Pattern | Descrição | Quando usar |
|---------|-----------|-------------|

### 4. Templates Disponíveis

Liste os arquivos em `../../templates/`:

| Template | Propósito |
|----------|-----------|
| app.config.ts | Identidade centralizada da plataforma |
| globals.css | CSS variables (cores, tema, animações) |
| docker-compose.yml | Infraestrutura Docker |
| build.yml | GitHub Actions CI/CD |
| Dockerfile | Build multi-stage Node 20 |
| env.example | Variáveis de ambiente documentadas |
| claude-md.template | CLAUDE.md base do novo projeto |

### 5. Sugestões por Tipo

No final, mostre:

| Tipo | Módulos recomendados |
|------|---------------------|
| SaaS multi-tenant | core + multi-tenant + dashboard + notifications + audit-log |
| Painel admin | core + dashboard + audit-log + settings |
| API/Integração | core + queue + encryption + webhook-routing |
| Ferramenta simples | core apenas |

Sempre responda em **português brasileiro**.
````

Salvar em `~/Desktop/nexus-ai-blueprint/skills/listar/SKILL.md`.

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/nexus-ai-blueprint
git add skills/listar/SKILL.md
git commit -m "feat: skill /nexus-ai-blueprint:listar — catálogo de módulos"
```

---

## Task 4: Criar skill `/nexus-ai-blueprint:criar`

**Files:**
- Create: `~/Desktop/nexus-ai-blueprint/skills/criar/SKILL.md`

Esta é a skill principal e mais complexa.

- [ ] **Step 1: Criar diretório**

```bash
mkdir -p ~/Desktop/nexus-ai-blueprint/skills/criar
```

- [ ] **Step 2: Escrever SKILL.md**

O arquivo completo (este é o maior arquivo do plano — ~300 linhas):

````markdown
---
name: criar
description: Cria uma nova plataforma completa a partir do Blueprint Nexus AI. Use quando quiser iniciar um novo projeto com auth, multi-tenancy, dashboard e mais.
disable-model-invocation: true
user-invocable: true
allowed-tools: Read Glob Grep Bash Write Edit Agent
argument-hint: "[nome-opcional]"
---

# Criar Nova Plataforma — Blueprint Nexus AI

Você é o assistente de criação de plataformas do Blueprint Nexus AI. Sua tarefa é guiar o usuário na criação de um novo projeto completo.

## Contexto do Blueprint

### Módulos disponíveis
!`ls ../../modules/*.md 2>/dev/null | xargs -I{} basename {} .md | grep -v README`

### Patterns disponíveis
!`ls ../../patterns/*.md 2>/dev/null | xargs -I{} basename {} .md | grep -v README`

### Versão
!`cat ../../.claude-plugin/plugin.json 2>/dev/null | grep version`

---

## FLUXO OBRIGATÓRIO — Seguir na ordem exata

Sempre responda em **português brasileiro**.

### PASSO 1: TIPO DE PROJETO

Perguntar ao usuário:

"Qual o tipo deste projeto?"
1. **Interno Nexus AI** — plataforma da própria Nexus AI
2. **Cliente Nexus AI** — plataforma para um cliente da Nexus
3. **Terceiro** — projeto independente, sem vínculo com a Nexus AI

Guardar a resposta como `TIPO`. Isso define os defaults dos próximos passos.

### PASSO 2: IDENTIDADE

Perguntar:

**Para todos os tipos:**
- "Qual o nome da plataforma?" → ex: "Nexus CRM" → guardar como `APP_NAME`
- "O que ela faz? (uma frase)" → ex: "Gestão de clientes e vendas" → guardar como `DESCRIPTION`

**Se TIPO = Interno Nexus AI:**
- "Domínio — usar [slug].nexusai360.com? Ou prefere outro?" → default: `[slug].nexusai360.com` → guardar como `DOMAIN`
- "Email — usar noreply@nexusai360.com? Ou prefere outro?" → default: `noreply@nexusai360.com` → guardar como `EMAIL_FROM`
- "Logo e cores — usar padrão Nexus AI (violet #7c3aed)? Ou prefere mudar?" → default: `#7c3aed` → guardar como `PRIMARY_COLOR`
- "Registry Docker — usar ghcr.io/jvzanini? Ou outro?" → default: `ghcr.io/jvzanini` → guardar como `REGISTRY`
- "Rede Docker — usar rede_nexusAI? Ou outra?" → default: `rede_nexusAI` → guardar como `NETWORK`
- "Deploy — usar Portainer? Ou outro método?" → default: Portainer → guardar como `DEPLOY_METHOD`

**Se TIPO = Cliente Nexus AI:**
- "Nome da empresa cliente?" → guardar como `CLIENT_NAME`
- "Domínio?" → obrigatório → guardar como `DOMAIN`
- "Email from? (ex: noreply@empresa.com)" → obrigatório → guardar como `EMAIL_FROM`
- "Cor primária (hex)?" → obrigatório → guardar como `PRIMARY_COLOR`
- "Logo (caminho do arquivo)?" → obrigatório ou "placeholder por enquanto" → guardar como `LOGO_PATH`
- "Registry Docker?" → default: `ghcr.io/jvzanini` → guardar como `REGISTRY`
- "Rede Docker?" → perguntar → guardar como `NETWORK`
- "Deploy — usar Portainer? Ou outro?" → perguntar → guardar como `DEPLOY_METHOD`

**Se TIPO = Terceiro:**
- Todas as perguntas sem defaults. Tudo obrigatório.
- Incluir: "GitHub user/org?" → guardar como `GITHUB_USER`

Para Interno e Cliente, `GITHUB_USER` = `jvzanini` (confirmar).

Derivar automaticamente:
- `PROJECT_SLUG` = nome em kebab-case (ex: "Nexus CRM" → "nexus-crm")
- `EMAIL_DOMAIN` = domínio extraído do EMAIL_FROM

### PASSO 3: DIRETÓRIO LOCAL

Perguntar:
- "Onde criar o projeto? Sugestão: ~/Desktop/[PROJECT_SLUG]/"
- Aceitar o default ou caminho absoluto informado → guardar como `PROJECT_DIR`

**Tratamento de erro:**
Se o diretório já existir, perguntar: "O diretório já existe. Sobrescrever, escolher outro caminho, ou cancelar?"

### PASSO 4: SELEÇÃO DE MÓDULOS

Apresentar o catálogo completo. Sugerir baseado no DESCRIPTION:

```
CORE (sempre incluído, não opcional):
  ✓ Auth — Login, JWT stateless, rate limiting, middleware
  ✓ Users — CRUD, hierarquia de acesso (4 níveis)
  ✓ Profile — Avatar, nome, email com verificação, senha, tema
  ✓ Password Reset — Esqueci senha com token + email
  ✓ Email — Resend SDK, templates HTML

MÓDULOS (marcar recomendados baseado na descrição):
  □ multi-tenant — Empresas, workspaces, scoping de dados
  □ notifications — Feed, badge no header, contagem
  □ audit-log — Registro de ações (quem fez o quê)
  □ toast — Notificação visual customizada (Sonner)
  □ realtime — Atualizações instantâneas (SSE + Redis)
  □ encryption — Criptografia AES-256-GCM para dados sensíveis

PATTERNS (marcar recomendados):
  □ dashboard — Painel com stats, gráficos, filtros
  □ queue — Processamento assíncrono (BullMQ worker)
  □ settings — Configurações globais da plataforma
  □ webhook-routing — Receber e rotear webhooks externos
```

Perguntar: "Quer adicionar ou remover algum?"
Guardar seleção como `MODULES` e `PATTERNS`.

### PASSO 5: SKILLS

Perguntar:
```
"Quais skills pré-configurar no projeto?"
  ✓ superpowers — brainstorm, planejamento, desenvolvimento, debug (recomendado)
  ✓ ui-ux-pro-max — design system, layout (recomendado se tem frontend)
  □ n8n-mcp-skills — automação n8n
```

Guardar como `SKILLS_LIST`.

### PASSO 6: REPOSITÓRIO GITHUB

Perguntar: "Criar repositório no GitHub agora? (recomendado)"

Se sim:
- Nome sugerido:
  - Interno: `nexus-[PROJECT_SLUG]`
  - Cliente: `cliente-[CLIENT_NAME_SLUG]-[PROJECT_SLUG]`
  - Terceiro: `[PROJECT_SLUG]`
- Confirmar nome
- Executar: `gh repo create [GITHUB_USER]/[REPO_NAME] --private`

**Tratamento de erro:**
Se o repo já existir, perguntar: "O repositório já existe. Usar outro nome, usar o existente, ou criar só local?"

Se não: pular, criar só local.

Guardar como `REPO_NAME` e `REPO_CREATED` (true/false).

### PASSO 7: CRIAÇÃO DO PROJETO

**IMPORTANTE:** Este é o passo mais pesado. Executar na ordem:

#### 7.1 — Estrutura base
```bash
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR
git init
```

#### 7.2 — Gerar app.config.ts
Ler `../../templates/app.config.ts` do blueprint.
Substituir todos os `{{placeholders}}` com os valores coletados.
Salvar em `$PROJECT_DIR/src/lib/app.config.ts`.

#### 7.3 — Gerar package.json e instalar dependências
Criar `package.json` com:
- Dependências core: next, react, react-dom, next-auth@5, prisma, @prisma/client, bcryptjs, zod, resend, tailwindcss, @tailwindcss/postcss, postcss, framer-motion, lucide-react, sonner, next-themes, ioredis
- Types: @types/node, @types/react, @types/react-dom, @types/bcryptjs, typescript
- shadcn: @base-ui-components/react
- Se "dashboard" em PATTERNS: adicionar recharts
- Se "queue" em PATTERNS: adicionar bullmq

Executar: `npm install`

#### 7.4 — Gerar Prisma schema
Ler `../../core/database.md` do blueprint.
Montar `prisma/schema.prisma` combinando:
- Config base (datasource, generator)
- Enums base (PlatformRole, Theme)
- Modelo User + PasswordResetToken + EmailChangeToken
- Para cada módulo em MODULES: adicionar os modelos listados no doc do módulo

#### 7.5 — Gerar globals.css
Ler `../../templates/globals.css` do blueprint.
Substituir as cores marcadas com `← COR PRIMÁRIA` pelo `PRIMARY_COLOR` coletado.
Salvar em `$PROJECT_DIR/src/app/globals.css`.

#### 7.6 — Gerar docker-compose.yml
Ler `../../templates/docker-compose.yml` do blueprint.
Substituir valores marcados com `←` pelos dados coletados (REGISTRY, PROJECT_SLUG, DOMAIN, NETWORK).
Se "queue" NÃO está em PATTERNS: remover service "worker".
Salvar em `$PROJECT_DIR/docker-compose.yml`.

#### 7.7 — Gerar GitHub Actions
Ler `../../templates/build.yml` do blueprint.
Substituir valores marcados com `←`.
Se "queue" NÃO está em PATTERNS: remover update do worker no deploy.
Salvar em `$PROJECT_DIR/.github/workflows/build.yml`.

#### 7.8 — Gerar Dockerfile
Ler `../../templates/Dockerfile` do blueprint.
Se "queue" NÃO está em PATTERNS: remover linha `COPY worker/`.
Salvar em `$PROJECT_DIR/docker/Dockerfile`.

#### 7.9 — Gerar .env.example
Ler `../../templates/env.example` do blueprint.
Se "encryption" NÃO está em MODULES: remover seção ENCRYPTION_KEY.
Salvar em `$PROJECT_DIR/.env.example`.

#### 7.10 — Gerar CLAUDE.md
Ler `../../templates/claude-md.template` do blueprint.
Substituir TODOS os placeholders:
- `{{APP_NAME}}`, `{{DESCRIPTION}}`, `{{DOMAIN}}`, `{{GITHUB_USER}}`, `{{PROJECT_SLUG}}`
- `{{PRIMARY_COLOR}}`, `{{REGISTRY}}`
- `{{BLUEPRINT_VERSION}}` = versão do plugin.json
- `{{PROJECT_TYPE}}` = "Interno Nexus AI" / "Cliente Nexus AI" / "Terceiro"
- `{{CREATED_DATE}}` = data de hoje
- `{{SKILLS_LIST}}` = lista das skills selecionadas
- `{{MODULES_LIST}}` = lista dos módulos incluídos com descrição
- `{{ACTIONS_LIST}}` = server actions dos módulos incluídos
- `{{DEPLOY_SECTION}}` = se Portainer: seção completa de deploy; se não: seção simplificada

Salvar em `$PROJECT_DIR/CLAUDE.md`.

#### 7.11 — Implementar o core
Esta é a parte mais pesada. Usar a ferramenta **Agent** para despachar subagentes:

**Para cada subsistema, ler o doc correspondente do blueprint E o código do Nexus Roteador Webhook como referência:**

Subagente Auth:
- Ler `../../core/overview.md` seção Auth
- Criar: src/auth.ts, src/auth.config.ts, src/middleware.ts, src/lib/auth.ts, src/lib/auth-helpers.ts, src/lib/rate-limit.ts, src/lib/redis.ts
- Adaptar: trocar nomes, rotas públicas, textos

Subagente Pages:
- Ler `../../core/ui.md`
- Criar: src/app/(auth)/layout.tsx, login/page.tsx, login-content.tsx, forgot-password/, reset-password/, verify-email/
- Criar: src/app/(protected)/layout.tsx, src/components/layout/sidebar.tsx
- Criar: src/components/providers/theme-provider.tsx, theme-initializer.tsx
- Adaptar: cores, logo, textos

Subagente Actions:
- Ler `../../core/overview.md` seções Users, Profile, Password Reset, Email
- Criar: src/lib/actions/users.ts, profile.ts, password-reset.ts
- Criar: src/lib/email.ts, src/lib/constants/roles.ts, src/lib/constants/navigation.ts
- Adaptar: labels, hierarquia, textos

Subagente Infra:
- Ler `../../core/database.md`
- Criar: src/lib/prisma.ts, src/lib/utils.ts, src/lib/env.ts
- Criar: src/app/api/auth/[...nextauth]/route.ts, src/app/api/health/route.ts
- Executar: npx prisma generate

#### 7.12 — Implementar módulos selecionados
Para cada módulo em MODULES:
- Ler `../../modules/{nome}.md`
- Seguir seção "Arquivos a criar"
- Seguir seção "Integração" pra conectar com core

Para cada pattern em PATTERNS:
- Ler `../../patterns/{nome}.md`
- Seguir seção "Como adaptar" (patterns precisam de adaptação ao domínio)

### PASSO 8: VALIDAÇÃO

Executar e reportar resultados:
```bash
cd $PROJECT_DIR
npx tsc --noEmit
npm run build
docker compose config > /dev/null 2>&1 && echo "Docker válido" || echo "Docker inválido"
```

**Tratamento de erro:**
- Se tsc falhar: analisar erros, corrigir, rodar novamente
- Se build falhar: analisar, corrigir, rebuildar
- Se persistir após 2 tentativas: informar o usuário com o erro exato

### PASSO 9: FINALIZAÇÃO

Se REPO_CREATED = true:
```bash
cd $PROJECT_DIR
git add -A
git commit -m "feat: projeto inicial criado via Blueprint Nexus AI v[VERSÃO]

Tipo: [TIPO]
Módulos: [MODULES]
Patterns: [PATTERNS]"
git remote add origin git@github.com:[GITHUB_USER]/[REPO_NAME].git
git push -u origin main
```

Informar ao usuário:
```
"Projeto criado com sucesso em [PROJECT_DIR]!"

Próximos passos:
1. cd [PROJECT_DIR]
2. Abra o Claude Code neste diretório
3. Use superpowers:brainstorming pra planejar as features específicas da plataforma

Repositório: https://github.com/[GITHUB_USER]/[REPO_NAME]
Blueprint versão: [VERSÃO]
Módulos incluídos: [LISTA]
```
````

Salvar em `~/Desktop/nexus-ai-blueprint/skills/criar/SKILL.md`.

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/nexus-ai-blueprint
git add skills/criar/SKILL.md
git commit -m "feat: skill /nexus-ai-blueprint:criar — criação guiada de plataformas"
```

---

## Task 5: Atualizar README.md do blueprint

**Files:**
- Modify: `~/Desktop/nexus-ai-blueprint/README.md`

- [ ] **Step 1: Ler o README atual**

Ler `~/Desktop/nexus-ai-blueprint/README.md`.

- [ ] **Step 2: Adicionar seção Instalação e Como Usar no topo**

Adicionar LOGO APÓS o header (título + versão), ANTES do catálogo de módulos:

```markdown
---

## Instalação

### 1. Clonar o repositório
```bash
git clone git@github.com:jvzanini/nexus-ai-blueprint.git ~/Desktop/nexus-ai-blueprint
```

### 2. Registrar como plugin do Claude Code

Abrir o arquivo `~/.claude/settings.json` e adicionar na raiz:

```json
{
  "plugins": [
    "/Users/joaovitorzanini/Desktop/nexus-ai-blueprint"
  ]
}
```

Se o arquivo já tiver outras configs, apenas adicionar o campo `plugins` (sem apagar o resto).

### 3. Reiniciar o Claude Code
Fechar e reabrir o Claude Code para carregar o plugin.

### 4. Verificar
Rodar `/nexus-ai-blueprint:listar` — deve mostrar todos os módulos e patterns.

---

## Como Usar

### Criar nova plataforma
```
/nexus-ai-blueprint:criar
```
O assistente guia você por 9 passos: tipo, identidade, módulos, criação, validação.

### Listar módulos disponíveis
```
/nexus-ai-blueprint:listar
```
Mostra o catálogo completo de core, módulos, patterns e templates.
```

- [ ] **Step 3: Atualizar changelog**

Adicionar ao changelog no final do README:

```markdown
- v1.2 (2026-04-08) — Blueprint extraído para repo independente. Plugin Claude Code com skills /criar e /listar.
```

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/nexus-ai-blueprint
git add README.md
git commit -m "docs: seção Instalação e Como Usar no README"
```

---

## Task 6: Atualizar claude-md.template

**Files:**
- Modify: `~/Desktop/nexus-ai-blueprint/templates/claude-md.template`

- [ ] **Step 1: Ler o template atual**

Ler `~/Desktop/nexus-ai-blueprint/templates/claude-md.template`.

- [ ] **Step 2: Reescrever com as seções atualizadas**

O template atualizado conforme a spec seção 9:

```markdown
# {{APP_NAME}}

## Projeto
{{DESCRIPTION}}

**URL Produção:** https://{{DOMAIN}}
**Repositório:** https://github.com/{{GITHUB_USER}}/{{PROJECT_SLUG}}
**Blueprint:** github.com/jvzanini/nexus-ai-blueprint (v{{BLUEPRINT_VERSION}})
**Tipo:** {{PROJECT_TYPE}}
**Criado em:** {{CREATED_DATE}}

## Metodologia
Este projeto segue a metodologia do Blueprint Nexus AI:
1. **Criação** — `/nexus-ai-blueprint:criar` (concluída)
2. **Planejamento** — `superpowers:brainstorming` → `writing-plans`
3. **Construção** — `superpowers:executing-plans` com commits frequentes
4. **Absorção** — ao concluir, funcionalidades reutilizáveis voltam pro blueprint

## Idioma
Sempre responder em português brasileiro.

## Skills Obrigatórias
{{SKILLS_LIST}}

## Convenções
- Commits em português
- Código e variáveis em inglês
- Comentários em português quando necessário
- Server Actions em `src/lib/actions/`
- Todo texto visível ao usuário DEVE ter acentos e caracteres PT-BR corretos

## Stack Técnica
- Next.js 14+ (App Router, Server Components, Server Actions)
- TypeScript
- Prisma v7 — imports de `@/generated/prisma/client` (NÃO `@prisma/client`)
- PostgreSQL 16 + Redis 7
- NextAuth.js v5 (JWT stateless, trustHost: true)
- Tailwind CSS + shadcn/ui (base-ui) — usar `render` prop, NÃO `asChild`
- next-themes (ThemeProvider) — dark/light/system mode
- Framer Motion — `as const` em variants com `ease`
- Lucide React (ícones, NUNCA emojis)

## Identidade Visual
- **Cor primária:** {{PRIMARY_COLOR}}
- **Logo:** `public/logo.png`
- **Temas:** Dark (padrão), Light, Sistema
- **CSS variables:** Todas as cores via CSS custom properties em globals.css

## Deploy
{{DEPLOY_SECTION}}

## Módulos Incluídos
{{MODULES_LIST}}

## Para adicionar módulos
Invocar `/nexus-ai-blueprint:listar` para ver módulos disponíveis.
Ler o doc do módulo no blueprint e seguir a seção "Integração".

## Regras
- Todo serviço sobe como container Docker
- Credenciais NUNCA no GitHub — apenas em `.env.production` (local)
- Ir pelo caminho mais simples e direto

## Estrutura de Actions
Todas as Server Actions ficam em `src/lib/actions/`:
{{ACTIONS_LIST}}
```

- [ ] **Step 3: Commit**

```bash
cd ~/Desktop/nexus-ai-blueprint
git add templates/claude-md.template
git commit -m "docs: claude-md.template com metodologia, versão e deploy condicional"
```

---

## Task 7: Registrar plugin no settings.json

**Files:**
- Modify: `~/.claude/settings.json`

- [ ] **Step 1: Ler settings.json atual**

Ler `~/.claude/settings.json`.

- [ ] **Step 2: Adicionar campo plugins**

O settings.json atual tem `permissions`, `enabledPlugins`, `extraKnownMarketplaces`, etc. Adicionar o campo `plugins` na raiz:

```json
{
  "plugins": [
    "/Users/joaovitorzanini/Desktop/nexus-ai-blueprint"
  ],
  "permissions": { ... },
  "enabledPlugins": { ... },
  ...resto mantido igual...
}
```

**IMPORTANTE:** Não apagar nenhum campo existente. Apenas adicionar `plugins`.

- [ ] **Step 3: Verificar JSON válido**

```bash
python3 -c "import json; json.load(open('/Users/joaovitorzanini/.claude/settings.json'))" && echo "JSON válido" || echo "JSON inválido"
```

Esperado: "JSON válido"

---

## Task 8: Atualizar Nexus — remover blueprint e atualizar CLAUDE.md

**Files:**
- Modify: `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/CLAUDE.md`
- Delete: `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/blueprint/` (pasta inteira)

- [ ] **Step 1: Ler CLAUDE.md do Nexus**

Ler seção `## Blueprint` do CLAUDE.md.

- [ ] **Step 2: Substituir seção Blueprint**

A seção atual diz:
```
## Blueprint
Pasta `blueprint/` contém documentação modular para criar novas plataformas.
Ao concluir funcionalidade reutilizável, SEMPRE verificar:
...
```

Substituir por:
```markdown
## Blueprint
Movido para repositório próprio: github.com/jvzanini/nexus-ai-blueprint
Instalar como plugin do Claude Code para usar (`/nexus-ai-blueprint:criar`).
Checkpoint ao finalizar features: "Essa feature é reutilizável? Documentar no blueprint."
```

- [ ] **Step 3: Remover pasta blueprint/**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta"
rm -rf blueprint/
```

- [ ] **Step 4: Commit e push no Nexus**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta"
git add -A
git commit -m "refactor: blueprint migrado para repo independente nexus-ai-blueprint

Blueprint removido deste projeto e movido para:
github.com/jvzanini/nexus-ai-blueprint

Instalar como plugin do Claude Code para usar."
git push origin main
```

---

## Task 9: Push final do blueprint e validação

**Files:** Nenhum novo — apenas push e teste.

- [ ] **Step 1: Push do blueprint**

```bash
cd ~/Desktop/nexus-ai-blueprint
git push origin main
```

- [ ] **Step 2: Verificar estrutura final**

```bash
cd ~/Desktop/nexus-ai-blueprint
echo "=== Estrutura ==="
find . -type f -not -path './.git/*' | sort
echo ""
echo "=== Total de arquivos ==="
find . -type f -not -path './.git/*' | wc -l
```

Esperado: 30 arquivos (27 migrados + plugin.json + 2 skills).

- [ ] **Step 3: Verificar que o Nexus não tem mais a pasta blueprint**

```bash
ls "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/blueprint/" 2>&1
```

Esperado: "No such file or directory"

- [ ] **Step 4: Informar o usuário**

Apresentar resumo:
```
Blueprint migrado com sucesso!

Repo: github.com/jvzanini/nexus-ai-blueprint (privado)
Local: ~/Desktop/nexus-ai-blueprint/
Plugin: registrado em ~/.claude/settings.json

Para testar:
1. Reinicie o Claude Code (fechar e abrir)
2. Rode: /nexus-ai-blueprint:listar
3. Rode: /nexus-ai-blueprint:criar

30 arquivos: 27 docs/templates + plugin.json + 2 skills
```

---

## Resumo de Tasks

| Task | Descrição | Arquivos |
|------|-----------|----------|
| 1 | Criar repo GitHub + migrar conteúdo | 27 arquivos migrados |
| 2 | Criar plugin.json | .claude-plugin/plugin.json |
| 3 | Skill /listar | skills/listar/SKILL.md |
| 4 | Skill /criar | skills/criar/SKILL.md |
| 5 | Atualizar README (instalação) | README.md |
| 6 | Atualizar claude-md.template | templates/claude-md.template |
| 7 | Registrar plugin no settings.json | ~/.claude/settings.json |
| 8 | Limpar Nexus (remover blueprint, atualizar CLAUDE.md) | CLAUDE.md, blueprint/ |
| 9 | Push final + validação | — |

**Tasks parallelizáveis:** 2, 3, 4, 5, 6 podem rodar em paralelo após Task 1. Task 7 é independente. Task 8 depende de Task 1 (repo criado). Task 9 depende de todas.
