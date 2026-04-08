# Blueprint Nexus AI Independente — Spec de Design

**Data:** 2026-04-08
**Versão:** 2.0
**Status:** Em revisão

---

## 1. Problema

O Blueprint Nexus AI mora dentro do projeto Nexus Roteador Webhook. Isso causa 3 problemas:

1. Pra criar uma plataforma nova, precisa estar dentro do projeto Nexus
2. Pra alimentar o blueprint com coisas de outros projetos, precisa abrir o Nexus
3. O blueprint fica "preso" a um projeto quando deveria ser uma ferramenta da empresa

O blueprint precisa virar uma **ferramenta independente** com seu próprio repositório, acessível de qualquer lugar via skill do Claude Code.

---

## 2. Escopo

### Fase 1 (esta spec):
- Repo independente `nexus-ai-blueprint` no GitHub (privado)
- Plugin Claude Code com duas skills: `/nexus-ai-blueprint:criar` e `/nexus-ai-blueprint:listar`
- Instalação persistente via settings.json
- CLAUDE.md template com metodologia padrão
- Migração completa do Nexus
- Teste: criar 1 projeto real

### Fase 2 (spec futura, após uso da Fase 1):
- `/nexus-ai-blueprint:absorver` — absorção guiada de módulos
- `/nexus-ai-blueprint:atualizar` — atualizar módulo existente

---

## 3. Decisões de Design

### 3.1 Repositório independente

**Repo:** `github.com/jvzanini/nexus-ai-blueprint`
**Tipo:** Privado
**Conteúdo:** Documentação do blueprint + plugin Claude Code

O conteúdo de `blueprint/` do Nexus migra integralmente pra raiz do novo repo. No Nexus, a pasta é removida e o CLAUDE.md passa a apontar pro repo novo.

### 3.2 Plugin do Claude Code

A skill é distribuída como **plugin** dentro do próprio repo do blueprint.

**Instalação persistente** — adicionar ao `~/.claude/settings.json`:

```json
{
  "plugins": [
    "/Users/joaovitorzanini/Desktop/nexus-ai-blueprint"
  ]
}
```

Isso faz o plugin carregar automaticamente em toda sessão do Claude Code, de qualquer diretório.

**Invocação:**
```
/nexus-ai-blueprint:criar
/nexus-ai-blueprint:listar
```

### 3.3 Tipos de projeto

Toda criação começa com a pergunta do tipo. Cada tipo sugere defaults, mas **todos são editáveis**. Mesmo pra interno, SEMPRE confirmar.

| Aspecto | Interno Nexus AI | Cliente Nexus AI | Terceiro |
|---------|:----------------:|:----------------:|:--------:|
| **Repo name** | Sugestão: `nexus-[slug]` — confirmar | Sugestão: `cliente-[empresa]-[slug]` — confirmar | Perguntar |
| **GitHub user/org** | Sugestão: `jvzanini` — confirmar | Sugestão: `jvzanini` — confirmar | Perguntar |
| **Domínio** | Sugestão: `[slug].nexusai360.com` — confirmar | Perguntar | Perguntar |
| **Email from** | Sugestão: `noreply@nexusai360.com` — confirmar | Perguntar | Perguntar |
| **Logo/Cores** | Sugestão: Nexus AI (violet #7c3aed) — confirmar | Obrigatório | Obrigatório |
| **Registry** | Sugestão: `ghcr.io/jvzanini` — confirmar | Perguntar | Perguntar |
| **Network** | Sugestão: `rede_nexusAI` — confirmar | Perguntar | Perguntar |
| **Deploy** | Sugestão: Portainer — confirmar | Perguntar (pode não usar) | Perguntar |

### 3.4 Core protegido

O core é **protegido, não imutável**:
- Nunca muda por absorção (Fase 2)
- Só muda por decisão explícita do dono
- Conflitos são sinalizados e rejeitados
- Se um dia migrar de NextAuth pra Clerk, o core evolui — mas conscientemente

### 3.5 Versionamento

O blueprint tem versão no `plugin.json` e no `README.md`. Todo projeto criado registra no seu `CLAUDE.md`:

```
**Blueprint versão:** 1.2
**Criado em:** 2026-04-08
```

Isso permite saber de qual versão do blueprint cada projeto veio.

### 3.6 Metodologia padrão

Todo projeto segue:

```
1. CRIAÇÃO       /nexus-ai-blueprint:criar
2. PLANEJAMENTO  superpowers:brainstorming → writing-plans
3. CONSTRUÇÃO    superpowers:executing-plans (layout: ui-ux-pro-max se frontend)
4. ABSORÇÃO      /nexus-ai-blueprint:absorver (Fase 2)
```

### 3.7 Skills pré-configuradas

Na criação, pergunta quais skills incluir:

```
"Quais skills pré-configurar?"
  ✓ superpowers (recomendado)
  ✓ ui-ux-pro-max (recomendado se tem frontend — desmarcar pra API pura)
  □ n8n-mcp-skills (se usar automação n8n)
```

---

## 4. Estrutura do Repositório

```
nexus-ai-blueprint/
│
├── .claude-plugin/
│   └── plugin.json                 # Manifesto do plugin
│
├── skills/
│   ├── criar/
│   │   └── SKILL.md                # /nexus-ai-blueprint:criar
│   └── listar/
│       └── SKILL.md                # /nexus-ai-blueprint:listar
│
├── README.md                       # Índice + instalação + como usar
├── architecture.md                 # Stack, padrões (protegido)
├── integration-map.md              # Dependências entre módulos
├── hardcoded-values.md             # Inventário de valores
│
├── core/                           # PROTEGIDO
│   ├── overview.md
│   ├── database.md
│   ├── deploy.md
│   └── ui.md
│
├── modules/                        # Peças opcionais
│   ├── README.md
│   ├── multi-tenant.md
│   ├── notifications.md
│   ├── audit-log.md
│   ├── toast.md
│   ├── realtime.md
│   └── encryption.md
│
├── patterns/                       # Arquitetura adaptável
│   ├── README.md
│   ├── dashboard.md
│   ├── queue.md
│   ├── settings.md
│   └── webhook-routing.md
│
└── templates/                      # Arquivos base
    ├── app.config.ts
    ├── globals.css
    ├── docker-compose.yml
    ├── build.yml
    ├── Dockerfile
    ├── env.example
    └── claude-md.template
```

---

## 5. plugin.json

```json
{
  "name": "nexus-ai-blueprint",
  "description": "Blueprint modular para criação de plataformas. Cria projetos completos com auth, multi-tenancy, dashboard e mais.",
  "version": "1.2.0"
}
```

---

## 6. Skill: `/nexus-ai-blueprint:criar` (detalhamento completo)

### 6.1 SKILL.md

```yaml
---
name: criar
description: Cria uma nova plataforma completa a partir do Blueprint Nexus AI. Use quando quiser iniciar um novo projeto com auth, multi-tenancy, dashboard e mais.
disable-model-invocation: true
user-invocable: true
allowed-tools: Read Glob Grep Bash Write Edit Agent
argument-hint: "[nome-opcional]"
---
```

**O conteúdo da skill (abaixo do frontmatter) deve conter:**

### 6.2 Seção de contexto (com dynamic injection)

A skill usa `!command` pra injetar contexto dinamicamente. Os caminhos são **relativos ao diretório do plugin** (onde o SKILL.md mora). Para acessar os arquivos do blueprint, a skill precisa subir dois níveis (`../../`) já que está em `skills/criar/SKILL.md`:

```markdown
## Módulos disponíveis
!`ls ../../modules/*.md 2>/dev/null | xargs -I{} basename {} .md`

## Patterns disponíveis
!`ls ../../patterns/*.md 2>/dev/null | xargs -I{} basename {} .md | grep -v README`

## Versão do Blueprint
!`cat ../../.claude-plugin/plugin.json | grep version`
```

### 6.3 Fluxo completo (no corpo da skill)

O corpo da skill contém o fluxo COMPLETO dos 9 passos — não referência, mas o texto real. Cada passo com as perguntas exatas, os defaults, e as ações.

### 6.4 Estratégia de criação (Passo 7)

O Passo 7 (criação do código) é o mais pesado. A skill instrui o Claude Code a:

1. **Gerar configs e templates primeiro** (passos 7.1 a 7.10) — são arquivos pequenos gerados diretamente
2. **Depois implementar o core e módulos** (passos 7.11 e 7.12) — usando subagentes:

```
Para implementar o core:
  1. Ler ../../core/overview.md do blueprint (5 subsistemas)
  2. Ler ../../core/database.md (schema Prisma)
  3. Ler ../../core/deploy.md (Docker, CI/CD)
  4. Ler ../../core/ui.md (tokens, tema, layout, auth pages, componentes)
  5. Usar Agent tool para despachar subagentes que implementam cada subsistema:
     - Subagente 1: Auth (auth.ts, auth.config.ts, middleware.ts, auth-helpers.ts, rate-limit.ts)
     - Subagente 2: Pages (login, forgot-password, reset-password, verify-email, layout protegido, sidebar)
     - Subagente 3: Server Actions (users.ts, profile.ts, password-reset.ts, email.ts)
     - Subagente 4: Prisma + Redis + Utils (prisma.ts, redis.ts, constants/, schemas/)

Para cada módulo selecionado:
  1. Ler ../../modules/{nome}.md
  2. Seguir a seção "Arquivos a criar" do módulo
  3. Seguir a seção "Integração" pra conectar com o core
```

### 6.5 Tratamento de erros

```
Se o diretório já existir:
  → Perguntar: "O diretório [caminho] já existe. Sobrescrever, escolher outro, ou cancelar?"

Se o repo GitHub já existir:
  → Perguntar: "O repositório [nome] já existe. Usar outro nome, usar o existente, ou criar só local?"

Se npm install falhar:
  → Mostrar o erro e perguntar se quer tentar novamente ou resolver manualmente

Se o build falhar no Passo 8:
  → Analisar o erro, tentar corrigir automaticamente, e rebuildar
  → Se persistir, informar o usuário com o erro e sugerir próximo passo
```

---

## 7. Skill: `/nexus-ai-blueprint:listar`

```yaml
---
name: listar
description: Lista todos os módulos e patterns disponíveis no Blueprint Nexus AI.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read Glob
---

# Módulos do Blueprint Nexus AI

## Versão
!`cat ../../.claude-plugin/plugin.json | grep version`

## Core (sempre incluído)
!`head -5 ../../core/overview.md`

Ler ../../core/overview.md e listar os 5 subsistemas com resumo de uma linha cada.

## Módulos Opcionais
Para cada arquivo .md em ../../modules/ (exceto README.md):
- Ler o arquivo
- Extrair o "## Resumo" (primeira seção após o título)
- Apresentar: nome | resumo | dependências

## Patterns
Para cada arquivo .md em ../../patterns/ (exceto README.md):
- Ler o arquivo
- Extrair o "## Resumo"
- Apresentar: nome | resumo | dependências

Formato: tabelas organizadas por categoria.
```

---

## 8. README.md do Blueprint (atualizado)

O README precisa de uma seção de instalação no topo. Adicionar ANTES do catálogo de módulos:

```markdown
## Instalação

### 1. Clonar o repositório
git clone git@github.com:jvzanini/nexus-ai-blueprint.git ~/Desktop/nexus-ai-blueprint

### 2. Registrar como plugin do Claude Code
Adicionar ao arquivo `~/.claude/settings.json`:

{
  "plugins": [
    "/Users/joaovitorzanini/Desktop/nexus-ai-blueprint"
  ]
}

### 3. Reiniciar o Claude Code
Fechar e reabrir, ou usar `/reload-plugins`.

### 4. Verificar
Rodar `/nexus-ai-blueprint:listar` — deve mostrar todos os módulos.

## Como Usar

### Criar nova plataforma
/nexus-ai-blueprint:criar

### Listar módulos disponíveis
/nexus-ai-blueprint:listar
```

---

## 9. CLAUDE.md Template (atualizado)

Mudanças em relação à versão anterior:
- Deploy condicional (nem todo projeto usa Portainer)
- Versão do blueprint registrada
- Data de criação
- Tipo do projeto registrado

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

## Regras
- Todo serviço sobe como container Docker
- Credenciais NUNCA no GitHub — apenas em `.env.production` (local)
- Ir pelo caminho mais simples e direto

## Estrutura de Actions
Todas as Server Actions ficam em `src/lib/actions/`:
{{ACTIONS_LIST}}
```

**A seção `{{DEPLOY_SECTION}}`** é gerada dinamicamente:
- Se usa Portainer: inclui pipeline, infraestrutura Docker Swarm, registry
- Se não usa Portainer: inclui só Docker Compose local ou outra infra informada

---

## 10. Migração do Nexus

### O que migra:
- `blueprint/` inteiro → raiz do novo repo `nexus-ai-blueprint`

### O que se cria de novo no repo:
- `.claude-plugin/plugin.json`
- `skills/criar/SKILL.md`
- `skills/listar/SKILL.md`
- Seção "Instalação" no README.md

### O que muda no Nexus:
- Remover pasta `blueprint/`
- Atualizar CLAUDE.md seção "Blueprint":
  ```
  ## Blueprint
  Movido para repositório próprio: github.com/jvzanini/nexus-ai-blueprint
  Instalar como plugin do Claude Code para usar.
  Checkpoint: "Essa feature é reutilizável? Documentar no blueprint."
  ```

---

## 11. Fase 2 (documentada, não implementada)

### `/nexus-ai-blueprint:absorver [caminho]`
- Absorção **guiada** — o usuário aponta o projeto e opcionalmente diz o que extrair
- Claude Code analisa por compatibilidade com o core (stack, padrões)
- Apresenta candidatos organizados em: módulos, componentes, patterns
- Após aprovação, escreve documentação no formato padrão
- Commita no repo do blueprint
- Rejeita conflitos com o core protegido

### `/nexus-ai-blueprint:atualizar [módulo]`
- Compara versão no blueprint com código real do projeto
- Apresenta diferenças e pede aprovação
- Atualiza a documentação do módulo

---

## 12. Implementação — O que fazer

1. Criar repo `nexus-ai-blueprint` no GitHub (privado)
2. Migrar conteúdo de `blueprint/` do Nexus pra raiz
3. Criar `.claude-plugin/plugin.json`
4. Criar `skills/criar/SKILL.md` (completo, com fluxo real e dynamic injection)
5. Criar `skills/listar/SKILL.md` (completo)
6. Atualizar `README.md` (adicionar seção Instalação)
7. Atualizar `templates/claude-md.template` (deploy condicional, versão, tipo)
8. Registrar plugin no `~/.claude/settings.json`
9. Atualizar CLAUDE.md do Nexus (link pro repo novo)
10. Remover `blueprint/` do Nexus
11. Commit + push em ambos os repos
12. Testar: `/nexus-ai-blueprint:listar` e `/nexus-ai-blueprint:criar`

---

## 13. Critérios de Sucesso

1. O plugin instala e as duas skills aparecem no Claude Code
2. `/nexus-ai-blueprint:listar` mostra todos os 6 módulos e 4 patterns
3. `/nexus-ai-blueprint:criar` conduz o fluxo completo de 9 passos sem travar
4. O projeto criado compila (`tsc`), builda (`next build`) e tem Docker válido
5. O CLAUDE.md gerado tem metodologia, skills, versão do blueprint e tipo do projeto
6. O repo do blueprint é autossuficiente — funciona sem o Nexus
7. O Nexus funciona normalmente sem a pasta `blueprint/`
8. O plugin funciona de qualquer diretório (não só do blueprint)
9. Erros no fluxo (diretório existente, repo existente, build falho) são tratados
