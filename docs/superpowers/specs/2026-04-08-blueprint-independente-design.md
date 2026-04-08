# Blueprint Nexus AI Independente — Spec de Design

**Data:** 2026-04-08
**Versão:** 1.0
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
- Repo independente `nexus-ai-blueprint` no GitHub
- Skill `/blueprint criar` — cria projetos novos com fluxo guiado
- Skill `/blueprint listar` — lista módulos disponíveis
- CLAUDE.md template com metodologia padrão
- Testar criando 1 projeto real

### Fase 2 (spec futura, após uso da Fase 1):
- `/blueprint absorver` — absorção guiada de módulos de outros projetos
- `/blueprint atualizar` — atualizar módulo existente com mudanças
- Evolução do core conforme necessidade real

---

## 3. Decisões de Design

### 3.1 Repositório independente

**Repo:** `github.com/jvzanini/nexus-ai-blueprint`
**Tipo:** Repositório privado
**Conteúdo:** Toda a documentação do blueprint + a skill do Claude Code

O conteúdo atual de `blueprint/` do Nexus é migrado integralmente. No projeto Nexus, a pasta `blueprint/` é substituída por um link/nota apontando pro repo novo.

### 3.2 Skill como plugin do Claude Code

A skill é distribuída como **plugin** do Claude Code, dentro do próprio repo do blueprint:

```
nexus-ai-blueprint/
├── .claude-plugin/
│   └── plugin.json              # Manifesto do plugin
├── skills/
│   ├── criar/
│   │   └── SKILL.md             # /nexus-ai-blueprint:criar
│   └── listar/
│       └── SKILL.md             # /nexus-ai-blueprint:listar
├── core/
├── modules/
├── patterns/
├── templates/
├── architecture.md
├── integration-map.md
├── hardcoded-values.md
└── README.md
```

**Instalação:**
```bash
# No settings.json do Claude Code, adicionar o caminho do plugin:
# Ou usar: claude --plugin-dir ~/Desktop/nexus-ai-blueprint
```

**Invocação:**
```
/nexus-ai-blueprint:criar
/nexus-ai-blueprint:listar
```

### 3.3 Tipos de projeto

Toda criação começa com a pergunta do tipo. Cada tipo sugere defaults, mas tudo é editável.

| Aspecto | Interno Nexus AI | Cliente Nexus AI | Terceiro |
|---------|:----------------:|:----------------:|:--------:|
| **Repo name** | Sugestão: `nexus-[nome]` | Sugestão: `cliente-[empresa]-[projeto]` | Perguntar |
| **GitHub org** | `jvzanini` | `jvzanini` | Perguntar |
| **Domínio** | Sugestão: `[slug].nexusai360.com` — confirmar | Perguntar | Perguntar |
| **Email from** | Sugestão: `noreply@nexusai360.com` — confirmar | Perguntar | Perguntar |
| **Logo/Cores** | Sugestão: herdar Nexus AI — confirmar | Obrigatório informar | Obrigatório informar |
| **Registry** | Sugestão: `ghcr.io/jvzanini` — confirmar | Perguntar | Perguntar |
| **Network Docker** | Sugestão: `rede_nexusAI` — confirmar | Perguntar | Perguntar |

**Regra:** mesmo para interno, SEMPRE confirmar. Defaults são sugestões, nunca imposições.

### 3.4 Core protegido (não imutável)

O core (auth, users, profile, password-reset, email, architecture, padrões) é **protegido**:
- Nunca muda por absorção automática (Fase 2)
- Só muda por decisão explícita do dono
- Qualquer conflito com o core é sinalizado

Isso não é "cláusula pétrea" — é "precisa de aprovação". Se um dia migrar de NextAuth pra Clerk, o core evolui. Mas conscientemente.

### 3.5 Metodologia padrão

Todo projeto criado pelo blueprint segue esta metodologia (documentada no CLAUDE.md gerado):

```
1. CRIAÇÃO       /nexus-ai-blueprint:criar
                 → Tipo, nome, cores, domínio, módulos
                 → Repo no GitHub, diretório local, código base

2. PLANEJAMENTO  superpowers:brainstorming → writing-plans
                 → Spec de design → plano de implementação

3. CONSTRUÇÃO    superpowers:executing-plans
                 → Task por task, commits frequentes
                 → Layout: ui-ux-pro-max (se frontend)

4. ABSORÇÃO      /nexus-ai-blueprint:absorver (Fase 2)
                 → Funcionalidades reutilizáveis voltam pro blueprint
```

### 3.6 Skills pré-configuradas

Na criação, o Claude Code pergunta quais skills incluir:

```
"Quais skills pré-configurar? (recomendadas marcadas com ✓)"

  ✓ superpowers — brainstorm, planejamento, desenvolvimento, debug
  ✓ ui-ux-pro-max — design system, layout (desmarcar se API sem frontend)
  □ n8n-mcp-skills — automação n8n (se usar)
  □ outras...
```

As skills selecionadas são referenciadas no CLAUDE.md do novo projeto como obrigatórias.

---

## 4. Estrutura do Repositório

```
nexus-ai-blueprint/
│
├── .claude-plugin/
│   └── plugin.json                # Manifesto: name, description, version
│
├── skills/
│   ├── criar/
│   │   └── SKILL.md               # Skill de criação de projeto
│   └── listar/
│       └── SKILL.md               # Skill de listagem de módulos
│
├── README.md                      # Índice geral + como usar
├── architecture.md                # Stack, padrões, convenções (protegido)
├── integration-map.md             # Dependências entre módulos
├── hardcoded-values.md            # Inventário de valores por plataforma
│
├── core/                          # PROTEGIDO — base de toda plataforma
│   ├── overview.md
│   ├── database.md
│   ├── deploy.md
│   └── ui.md
│
├── modules/                       # Peças opcionais
│   ├── README.md
│   ├── multi-tenant.md
│   ├── notifications.md
│   ├── audit-log.md
│   ├── toast.md
│   ├── realtime.md
│   └── encryption.md
│
├── patterns/                      # Arquitetura adaptável
│   ├── README.md
│   ├── dashboard.md
│   ├── queue.md
│   ├── settings.md
│   └── webhook-routing.md
│
└── templates/                     # Arquivos base
    ├── app.config.ts
    ├── globals.css
    ├── docker-compose.yml
    ├── build.yml
    ├── Dockerfile
    ├── env.example
    └── claude-md.template
```

---

## 5. Skill: `/nexus-ai-blueprint:criar`

### 5.1 Fluxo completo

```
PASSO 1: TIPO DE PROJETO
─────────────────────────
"Qual o tipo deste projeto?"
  1. Interno Nexus AI
  2. Cliente Nexus AI
  3. Terceiro (projeto independente)


PASSO 2: IDENTIDADE
────────────────────
"Nome da plataforma?" → ex: "Nexus CRM"
"O que ela faz? (uma frase)" → ex: "Gestão de clientes e vendas"

[Se interno]:
  "Domínio — usar [slug].nexusai360.com? Ou mudar?"
  "Email — usar noreply@nexusai360.com? Ou mudar?"
  "Logo/Cores — usar padrão Nexus AI (violet #7c3aed)? Ou mudar?"
  "Registry — usar ghcr.io/jvzanini? Ou mudar?"
  "Rede Docker — usar rede_nexusAI? Ou mudar?"

[Se cliente]:
  "Nome da empresa cliente?" → ex: "ACME Corp"
  "Domínio?" → ex: "portal.acme.com"
  "Email from?" → ex: "noreply@acme.com"
  "Cor primária (hex)?" → obrigatório
  "Logo (caminho)?" → obrigatório ou placeholder
  "Registry Docker?" → default ghcr.io/jvzanini ou mudar
  "Rede Docker?" → perguntar

[Se terceiro]:
  Todas as perguntas sem defaults. Tudo obrigatório.


PASSO 3: DIRETÓRIO
───────────────────
"Onde criar o projeto?"
  Sugestão: ~/Desktop/[slug-do-projeto]/
  Aceitar ou informar outro caminho absoluto


PASSO 4: MÓDULOS
─────────────────
Apresentar catálogo completo.
Sugerir baseado na descrição do projeto.
Marcar recomendados. Perguntar se quer mudar.


PASSO 5: SKILLS
────────────────
"Quais skills pré-configurar?"
  ✓ superpowers (recomendado)
  ✓ ui-ux-pro-max (recomendado se tem frontend)
  □ outras


PASSO 6: REPOSITÓRIO GITHUB
────────────────────────────
"Criar repositório no GitHub agora?"
  → Se sim: gh repo create [nome] --private
  → Se não: criar só local, push depois

Nome sugerido baseado no tipo:
  Interno: nexus-[slug]
  Cliente: cliente-[empresa]-[slug]
  Terceiro: [slug]


PASSO 7: CRIAÇÃO
─────────────────
Executar na ordem:
  1. Criar diretório
  2. git init
  3. Gerar app.config.ts (com dados coletados)
  4. Gerar package.json + npm install
  5. Gerar prisma/schema.prisma (core + módulos)
  6. Gerar globals.css (com cores informadas)
  7. Gerar docker-compose.yml
  8. Gerar .github/workflows/build.yml
  9. Gerar docker/Dockerfile
  10. Gerar .env.example
  11. Implementar core (auth, users, profile, reset, email)
  12. Implementar módulos selecionados
  13. Gerar CLAUDE.md (com metodologia + skills + módulos)
  14. Commit inicial
  15. Push pro GitHub (se repo criado)


PASSO 8: VALIDAÇÃO
───────────────────
  1. npx tsc --noEmit → zero erros
  2. npm run build → passa
  3. docker compose config → válido


PASSO 9: PRÓXIMOS PASSOS
─────────────────────────
Informar ao usuário:
  "Projeto criado em [caminho]. Próximo passo:"
  "1. cd [caminho]"
  "2. Abra o Claude Code"
  "3. Use superpowers:brainstorming pra planejar as features"
```

### 5.2 SKILL.md — Estrutura

```yaml
---
name: criar
description: Cria uma nova plataforma a partir do Blueprint Nexus AI. Use quando quiser iniciar um novo projeto.
disable-model-invocation: true
allowed-tools: Read Glob Grep Bash Write Edit Agent
argument-hint: "[nome-opcional]"
---

# Criar Nova Plataforma

Você é o assistente de criação de plataformas do Blueprint Nexus AI.

## Contexto
Leia estes arquivos do blueprint para entender os módulos disponíveis:
- !`cat {blueprint_path}/README.md`
- !`ls {blueprint_path}/modules/*.md | sed 's/.*\///' | sed 's/\.md//'`
- !`ls {blueprint_path}/patterns/*.md | sed 's/.*\///' | sed 's/\.md//'`

## Fluxo
Siga EXATAMENTE o fluxo de 9 passos documentado nesta skill.
[... fluxo completo dos 9 passos ...]

## Ao criar o projeto
- Leia os docs do core: core/overview.md, core/database.md, core/deploy.md, core/ui.md
- Para cada módulo selecionado, leia modules/{nome}.md
- Para cada pattern selecionado, leia patterns/{nome}.md
- Use templates/ como base para os arquivos de config
- Gere código real e funcional, não placeholders

## CLAUDE.md do novo projeto
Use templates/claude-md.template como base. Incluir:
- Metodologia: criar → planejar (superpowers) → construir → absorver
- Skills obrigatórias selecionadas
- Módulos incluídos
- Link de volta pro blueprint
```

---

## 6. Skill: `/nexus-ai-blueprint:listar`

```yaml
---
name: listar
description: Lista todos os módulos e patterns disponíveis no Blueprint Nexus AI.
disable-model-invocation: false
allowed-tools: Read Glob
---

# Listar Módulos do Blueprint

Leia o README.md do blueprint e apresente:

1. **Core** (sempre incluído) — listar os 5 subsistemas
2. **Módulos** — para cada .md em modules/, mostrar nome e resumo (primeira frase)
3. **Patterns** — para cada .md em patterns/, mostrar nome e resumo
4. **Templates** — listar os 7 templates disponíveis

Formato: tabela organizada por categoria.
```

---

## 7. Migração do Nexus

### O que migra:
- Todo o conteúdo de `blueprint/` → raiz do novo repo

### O que muda no Nexus:
- Remover pasta `blueprint/`
- Atualizar `CLAUDE.md` do Nexus:
  - Seção "Blueprint" passa a dizer: "Blueprint movido para repo próprio: github.com/jvzanini/nexus-ai-blueprint"
  - Manter regra de checkpoint: "Essa feature é reutilizável? Documentar no blueprint."

---

## 8. plugin.json

```json
{
  "name": "nexus-ai-blueprint",
  "description": "Blueprint modular para criação de plataformas. Cria projetos completos com auth, multi-tenancy, dashboard e mais.",
  "version": "1.0.0"
}
```

---

## 9. CLAUDE.md Template (atualizado)

O template `templates/claude-md.template` é atualizado pra incluir a metodologia:

```markdown
# {{APP_NAME}}

## Projeto
{{DESCRIPTION}}
Deploy via Docker Swarm Stack no Portainer (VPS).

**URL Produção:** https://{{DOMAIN}}
**Repositório:** https://github.com/{{GITHUB_USER}}/{{PROJECT_SLUG}}
**Blueprint:** github.com/jvzanini/nexus-ai-blueprint
**Tipo:** {{PROJECT_TYPE}} (interno/cliente/terceiro)

## Metodologia
Este projeto segue a metodologia do Blueprint Nexus AI:
1. **Criação** — `/nexus-ai-blueprint:criar` (já executado)
2. **Planejamento** — `superpowers:brainstorming` → `writing-plans`
3. **Construção** — `superpowers:executing-plans` com commits frequentes
4. **Absorção** — ao concluir, funcionalidades reutilizáveis voltam pro blueprint

## Skills Obrigatórias
{{SKILLS_LIST}}

## Idioma
Sempre responder em português brasileiro.

## Convenções
- Commits em português
- Código e variáveis em inglês
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

## Deploy
- **Pipeline:** Push main → GitHub Actions (test → build → deploy)
- **Infraestrutura:** Docker Swarm Stack via Portainer
- **Registry:** {{REGISTRY}}/{{PROJECT_SLUG}}

## Módulos Incluídos
{{MODULES_LIST}}

## Regras
- Testes direto em produção
- Todo serviço sobe como container Docker
- Credenciais NUNCA no GitHub
- Ir pelo caminho mais simples e direto

## Estrutura de Actions
{{ACTIONS_LIST}}
```

---

## 10. Fase 2 (documentada, não implementada)

Após a Fase 1 estar em uso, implementar:

### `/nexus-ai-blueprint:absorver [caminho]`
- Absorção **guiada** (não automática)
- Usuário aponta o projeto e opcionalmente diz o que quer absorver
- Claude Code analisa, filtra por compatibilidade com o core
- Apresenta ao usuário o que encontrou
- Após aprovação, escreve a documentação do módulo no formato padrão
- Commita no repo do blueprint
- Rejeita qualquer coisa que conflite com o core protegido

### `/nexus-ai-blueprint:atualizar [módulo]`
- Atualiza um módulo existente com mudanças do projeto atual
- Compara a versão no blueprint com o código real
- Apresenta as diferenças e pede aprovação

---

## 11. Implementação — O que fazer

1. Criar repo `nexus-ai-blueprint` no GitHub (privado)
2. Migrar conteúdo de `blueprint/` do Nexus
3. Criar `.claude-plugin/plugin.json`
4. Criar `skills/criar/SKILL.md`
5. Criar `skills/listar/SKILL.md`
6. Atualizar `templates/claude-md.template` com metodologia
7. Atualizar `README.md` do blueprint (como instalar, como usar)
8. Atualizar `CLAUDE.md` do Nexus (remover blueprint, adicionar link)
9. Remover `blueprint/` do Nexus
10. Testar: instalar plugin e rodar `/nexus-ai-blueprint:criar`

---

## 12. Critérios de Sucesso

1. O plugin instala e as skills aparecem no Claude Code
2. `/nexus-ai-blueprint:criar` conduz o fluxo completo de 9 passos
3. O projeto criado compila, builda e tem Docker válido
4. O CLAUDE.md gerado tem metodologia e skills configuradas
5. `/nexus-ai-blueprint:listar` mostra todos os módulos e patterns
6. O repo do blueprint é autossuficiente (não depende do Nexus)
7. O Nexus continua funcionando sem a pasta blueprint/
