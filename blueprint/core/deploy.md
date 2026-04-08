# Deploy

> Infraestrutura completa de deploy: Dockerfile multi-stage, Docker Compose para Swarm, CI/CD via GitHub Actions com deploy automático no Portainer.

---

## Dockerfile

Build multi-stage em 3 etapas. Imagem base: `node:20-alpine`.

### Stage 1 — deps (dependências de produção)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
```

Instala apenas dependências de produção (`--omit=dev`). Essa layer é cacheada e só invalida quando `package.json` ou `package-lock.json` mudam.

### Stage 2 — builder (build da aplicação)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV REDIS_URL="redis://dummy:6379"
RUN npx prisma generate
RUN npm run build
```

Instala todas as dependências (incluindo devDependencies), copia o código, gera o client Prisma e executa `npm run build`. As variáveis `DATABASE_URL` e `REDIS_URL` são dummies — necessárias apenas para que o Prisma generate e o Next.js build funcionem sem conexão real.

### Stage 3 — runner (imagem final)

```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/worker ./worker
COPY --from=builder /app/src/generated ./src/generated

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

**Detalhes da imagem final:**

| Aspecto | Valor |
|---------|-------|
| Usuário | `nextjs` (UID 1001, sem root) |
| Porta | 3000 |
| Hostname | `0.0.0.0` (aceita conexões externas) |
| Entrypoint | `node server.js` (standalone do Next.js) |

**Arquivos copiados:**

| Origem | Destino | Motivo |
|--------|---------|--------|
| `deps:/app/node_modules` | `./node_modules` | Dependências de produção |
| `builder:/app/.next/standalone` | `./` | App Next.js compilado (standalone output) |
| `builder:/app/.next/static` | `./.next/static` | Assets estáticos (CSS, JS bundles) |
| `builder:/app/public` | `./public` | Arquivos públicos (logos, favicons) |
| `builder:/app/prisma` | `./prisma` | Schema Prisma (necessário para migrations) |
| `builder:/app/src/worker` | `./worker` | Worker BullMQ (processamento de filas) |
| `builder:/app/src/generated` | `./src/generated` | Client Prisma gerado |

**Nota sobre queue pattern:** O `worker/` é copiado porque o projeto usa BullMQ. Se a plataforma não usar filas, remova a linha `COPY --from=builder /app/src/worker ./worker`.

### Parametrização

Ao gerar para um novo projeto, substituir:

- Nenhuma parametrização necessária no Dockerfile — ele é genérico. Apenas incluir/excluir a cópia do `worker/` conforme o uso de filas.

---

## docker-compose.yml

Compose para Docker Swarm (Portainer Stacks). 4 serviços, 2 redes, 2 volumes.

```yaml
version: "3.8"

services:
  app:
    image: ghcr.io/jvzanini/nexus-roteador-webhook:latest
    command: ["node", "server.js"]
    environment:
      - DATABASE_URL=postgresql://nexus:${DB_PASSWORD}@db:5432/nexus
      - REDIS_URL=redis://redis:6379
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=https://roteadorwebhook.nexusai360.com
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - RESEND_API_KEY=${RESEND_API_KEY}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    networks:
      - traefik-public
      - internal
    deploy:
      labels:
        - traefik.enable=true
        - traefik.http.routers.nexus.rule=Host(`roteadorwebhook.nexusai360.com`)
        - traefik.http.routers.nexus.entrypoints=websecure
        - traefik.http.services.nexus.loadbalancer.server.port=3000

  worker:
    image: ghcr.io/jvzanini/nexus-roteador-webhook:latest
    command: ["node", "worker/index.js"]
    environment:
      - DATABASE_URL=postgresql://nexus:${DB_PASSWORD}@db:5432/nexus
      - REDIS_URL=redis://redis:6379
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - RESEND_API_KEY=${RESEND_API_KEY}
    networks:
      - internal

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=nexus
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=nexus
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - internal

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - internal

volumes:
  postgres_data:
  redis_data:

networks:
  traefik-public:
    external: true
  internal:
    driver: overlay
```

### Serviços

| Serviço | Imagem | Porta | Rede | Descrição |
|---------|--------|-------|------|-----------|
| **app** | `ghcr.io/jvzanini/nexus-roteador-webhook:latest` | 3000 (via Traefik) | traefik-public + internal | Next.js app principal |
| **worker** | mesma imagem do app | — | internal | Worker BullMQ, entrypoint `node worker/index.js` |
| **db** | `postgres:16-alpine` | 5432 (interno) | internal | PostgreSQL com volume persistente |
| **redis** | `redis:7-alpine` | 6379 (interno) | internal | Redis com AOF persistence (`--appendonly yes`) |

### Redes

| Rede | Tipo | Uso |
|------|------|-----|
| `traefik-public` | external | Rede compartilhada com o Traefik reverse proxy. Permite que o Traefik descubra o serviço `app` via labels e faça proxy com TLS. |
| `internal` | overlay | Comunicação interna entre app, worker, db e redis. Não exposta externamente. |

### Traefik Labels (serviço app)

| Label | Função |
|-------|--------|
| `traefik.enable=true` | Habilita discovery do serviço pelo Traefik |
| `traefik.http.routers.nexus.rule=Host(...)` | Rota por domínio |
| `traefik.http.routers.nexus.entrypoints=websecure` | Força HTTPS (TLS via Let's Encrypt) |
| `traefik.http.services.nexus.loadbalancer.server.port=3000` | Porta interna do container |

### Volumes

| Volume | Mount | Uso |
|--------|-------|-----|
| `postgres_data` | `/var/lib/postgresql/data` | Dados do PostgreSQL |
| `redis_data` | `/data` | Arquivo AOF do Redis |

### Parametrização

Ao gerar para um novo projeto, substituir:

| Valor | Substituir por | Exemplo |
|-------|---------------|---------|
| `ghcr.io/jvzanini/nexus-roteador-webhook` | Registry + nome da imagem | `ghcr.io/org/meu-projeto` |
| `roteadorwebhook.nexusai360.com` | Domínio de produção | `meuapp.nexusai360.com` |
| `nexus` (POSTGRES_USER) | Nome do usuário do banco | `meuapp` |
| `nexus` (POSTGRES_DB) | Nome do banco | `meuapp` |
| `traefik-public` | Nome da rede Traefik (se diferente) | `traefik-public` |
| `nexus` (prefixo nos routers/services Traefik) | Slug do projeto | `meuapp` |

**Nota sobre worker:** Se a plataforma não usar queue pattern, remover o serviço `worker` inteiro.

---

## GitHub Actions CI/CD

Pipeline de 3 jobs sequenciais: test, build, deploy. Trigger em push na branch `main`.

### Arquivo completo: `.github/workflows/build.yml`

```yaml
name: Build and Push

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha
            type=raw,value=latest
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    env:
      PORTAINER_URL: ${{ secrets.PORTAINER_URL }}
      PORTAINER_TOKEN: ${{ secrets.PORTAINER_TOKEN }}
      GHCR_TOKEN: ${{ secrets.GHCR_TOKEN }}
    steps:
      - name: Pull image and update services
        run: |
          # Pull da nova imagem no Portainer
          AUTH=$(echo -n "{\"username\":\"jvzanini\",\"password\":\"${GHCR_TOKEN}\"}" | base64 -w 0)

          curl --insecure -X POST \
            -H "X-API-Key: ${PORTAINER_TOKEN}" \
            -H "X-Registry-Auth: ${AUTH}" \
            "${PORTAINER_URL}/api/endpoints/1/docker/images/create?fromImage=ghcr.io/jvzanini/nexus-roteador-webhook&tag=latest" \
            -o /dev/null -w "Pull: HTTP %{http_code}\n"

          # Forçar update dos serviços
          SERVICES=$(curl --insecure -s \
            -H "X-API-Key: ${PORTAINER_TOKEN}" \
            "${PORTAINER_URL}/api/endpoints/1/docker/services")

          for SERVICE_NAME in nexus-roteador-webhook_app nexus-roteador-webhook_worker; do
            SVC_ID=$(echo "$SERVICES" | python3 -c "
          import sys,json
          for s in json.load(sys.stdin):
              if s['Spec']['Name'] == '$SERVICE_NAME':
                  print(s['ID']); break
          " 2>/dev/null)

            SVC_VERSION=$(echo "$SERVICES" | python3 -c "
          import sys,json
          for s in json.load(sys.stdin):
              if s['Spec']['Name'] == '$SERVICE_NAME':
                  print(s['Version']['Index']); break
          " 2>/dev/null)

            SVC_SPEC=$(echo "$SERVICES" | python3 -c "
          import sys,json
          for s in json.load(sys.stdin):
              if s['Spec']['Name'] == '$SERVICE_NAME':
                  spec = s['Spec']
                  spec['TaskTemplate']['ForceUpdate'] = spec['TaskTemplate'].get('ForceUpdate', 0) + 1
                  print(json.dumps(spec)); break
          " 2>/dev/null)

            if [ -n "$SVC_ID" ] && [ -n "$SVC_SPEC" ]; then
              curl --insecure -s -X POST \
                -H "X-API-Key: ${PORTAINER_TOKEN}" \
                -H "Content-Type: application/json" \
                -H "X-Registry-Auth: ${AUTH}" \
                -d "$SVC_SPEC" \
                "${PORTAINER_URL}/api/endpoints/1/docker/services/${SVC_ID}/update?version=${SVC_VERSION}" \
                -o /dev/null -w "Update ${SERVICE_NAME}: HTTP %{http_code}\n"
            else
              echo "Service ${SERVICE_NAME} not found, skipping"
            fi
          done

          echo "Deploy complete!"
```

### Jobs

#### Job 1: test

| Passo | Ação |
|-------|------|
| Checkout | `actions/checkout@v4` |
| Setup Node | `actions/setup-node@v4` com Node 20 e cache npm |
| Instalar deps | `npm ci` (todas as dependências) |
| Gerar Prisma | `npx prisma generate` |
| Rodar testes | `npm test` |

#### Job 2: build (depende de test)

| Passo | Ação |
|-------|------|
| Checkout | `actions/checkout@v4` |
| Login GHCR | `docker/login-action@v3` com `GITHUB_TOKEN` |
| Extrair metadata | `docker/metadata-action@v5` — gera tags `sha-xxxxx` e `latest` |
| Build e push | `docker/build-push-action@v5` — build com `docker/Dockerfile`, push para GHCR |

**Tags geradas:** A imagem recebe duas tags a cada push:
- `ghcr.io/{repo}:sha-{commit-sha}` — tag imutável para rastreabilidade
- `ghcr.io/{repo}:latest` — tag rolling para o compose

#### Job 3: deploy (depende de build)

Fluxo do deploy automático via API do Portainer:

1. **Pull da imagem** — Chama a Docker API via Portainer para baixar a imagem `latest` no host
2. **Listar serviços** — Busca todos os serviços Docker Swarm via API
3. **Force update** — Para cada serviço (`_app` e `_worker`):
   - Extrai ID, versão e spec do serviço
   - Incrementa `ForceUpdate` no `TaskTemplate` (força o Swarm a recriar os containers)
   - Chama `POST /services/{id}/update` com a spec atualizada

### Secrets necessários no GitHub

| Secret | Descrição |
|--------|-----------|
| `GITHUB_TOKEN` | Automático. Usado para login no GHCR e push da imagem. |
| `PORTAINER_URL` | URL base do Portainer (ex: `https://portainer.meudominio.com`) |
| `PORTAINER_TOKEN` | API Key do Portainer (gerada em Settings > Access Tokens) |
| `GHCR_TOKEN` | PAT do GitHub com permissão `read:packages` (usado para pull no host) |

### Parametrização

Ao gerar para um novo projeto, substituir:

| Valor | Substituir por |
|-------|---------------|
| `ghcr.io/jvzanini/nexus-roteador-webhook` | Registry + nome da imagem |
| `nexus-roteador-webhook_app` | `{stack-name}_app` |
| `nexus-roteador-webhook_worker` | `{stack-name}_worker` (ou remover se sem filas) |
| `jvzanini` (username no AUTH) | Username do GitHub |

---

## Variáveis de Ambiente

### Variáveis da aplicação (docker-compose.yml)

| Nome | Obrigatório | Módulo | Descrição | Exemplo |
|------|-------------|--------|-----------|---------|
| `DATABASE_URL` | Sim | Core | Connection string do PostgreSQL | `postgresql://nexus:senha123@db:5432/nexus` |
| `REDIS_URL` | Sim | Core | Connection string do Redis | `redis://redis:6379` |
| `NEXTAUTH_SECRET` | Sim | Auth | Chave para assinar JWT (min. 32 chars) | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Sim | Auth | URL pública da aplicação | `https://roteadorwebhook.nexusai360.com` |
| `ENCRYPTION_KEY` | Sim | Encryption | Chave AES-256 para criptografia de dados sensíveis (32 bytes hex) | `openssl rand -hex 32` |
| `RESEND_API_KEY` | Sim | Email | API key do Resend para envio de emails | `re_xxxxxxxxxxxxx` |
| `ADMIN_EMAIL` | Sim | Auth | Email do super admin criado no seed | `admin@nexusai360.com` |
| `ADMIN_PASSWORD` | Sim | Auth | Senha do super admin criado no seed | `SenhaForte123!` |
| `DB_PASSWORD` | Sim | Core | Senha do PostgreSQL (usada no compose) | `senha-segura-aqui` |

### Variáveis do CI/CD (GitHub Secrets)

| Nome | Obrigatório | Módulo | Descrição | Exemplo |
|------|-------------|--------|-----------|---------|
| `PORTAINER_URL` | Sim | Deploy | URL base da instância Portainer | `https://portainer.nexusai360.com` |
| `PORTAINER_TOKEN` | Sim | Deploy | API Key do Portainer | `ptr_xxxxxxxxxxxx` |
| `GHCR_TOKEN` | Sim | Deploy | PAT do GitHub com `read:packages` | `ghp_xxxxxxxxxxxx` |

### Geração de chaves

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY
openssl rand -hex 32

# DB_PASSWORD
openssl rand -base64 24
```

---

## Primeira Execução

Checklist completo para colocar a plataforma em produção pela primeira vez.

### Passo 1: Criar arquivo de variáveis

Criar `.env` (ou configurar no Portainer como environment variables da stack):

```bash
DB_PASSWORD=<gerar com openssl rand -base64 24>
NEXTAUTH_SECRET=<gerar com openssl rand -base64 32>
ENCRYPTION_KEY=<gerar com openssl rand -hex 32>
RESEND_API_KEY=<obter em resend.com>
ADMIN_EMAIL=admin@seudominio.com
ADMIN_PASSWORD=<senha forte>
```

### Passo 2: Subir a stack

```bash
# Via Docker Compose local
docker compose up -d

# Ou: criar stack no Portainer (colar o docker-compose.yml + variáveis)
```

### Passo 3: Aplicar migrations do banco

O Prisma v7 não suporta `migrate deploy` em runtime. Aplicar via `psql` direto no container:

```bash
# Opção 1: prisma db push (desenvolvimento)
docker compose exec app npx prisma db push

# Opção 2: SQL direto no container db (produção)
docker compose exec db psql -U nexus -d nexus -f /caminho/migration.sql
```

### Passo 4: Seed do super admin

O seed é executado automaticamente na primeira inicialização quando `ADMIN_EMAIL` e `ADMIN_PASSWORD` estão configurados. Se precisar executar manualmente:

```bash
docker compose exec app npx prisma db seed
```

### Passo 5: Verificar saúde da aplicação

```bash
# Health check via curl
curl -s https://seudominio.com/api/health | jq

# Resposta esperada:
# { "status": "ok", "timestamp": "..." }
```

### Passo 6: Acessar a aplicação

1. Abrir `https://seudominio.com/login` no navegador
2. Fazer login com `ADMIN_EMAIL` e `ADMIN_PASSWORD`
3. Verificar que o dashboard carrega corretamente
4. Verificar que o tema dark/light funciona

### Checklist resumido

- [ ] `.env` criado com todas as variáveis obrigatórias
- [ ] Stack subindo sem erros (`docker compose ps` — todos healthy)
- [ ] Migrations aplicadas (tabelas existem no banco)
- [ ] Super admin criado (login funciona)
- [ ] Health endpoint respondendo (`/api/health` retorna `ok`)
- [ ] Aplicação acessível via HTTPS no domínio configurado
- [ ] Worker processando filas (se usar queue pattern)
- [ ] DNS apontando para o IP da VPS (registro A)
- [ ] Certificado TLS emitido pelo Traefik/Let's Encrypt
