# Pattern: Configuracoes Globais (Key-Value)

## Resumo

Sistema de configuracoes globais da plataforma usando modelo key-value com JSON no banco de dados. As configuracoes tem defaults em codigo, podem ser sobrescritas pelo admin via interface, e sao lidas com merge automatico (banco > defaults). Acesso restrito a super admin, com validacao Zod no backend.

## Quando Usar

- Plataformas que precisam de configuracoes ajustaveis em tempo real sem redeploy
- Politicas de retry, retencao de dados, feature flags
- Configuracoes de notificacao (canais habilitados, thresholds, destinatarios)
- Qualquer parametro operacional que o admin precisa ajustar

## Arquitetura

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Admin UI        │     │  Server Action    │     │  PostgreSQL      │
│  (settings page) │────>│  (updateSettings) │────>│  GlobalSettings  │
│                  │     │  + Zod validation │     │  (key-value)     │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
                                                           ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Application     │<────│  getGlobalSetting │<────│  DB value OU     │
│  Code            │     │  (cached reads)   │     │  Default value   │
│  (worker, API)   │     │                  │     │  (fallback)      │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

### Componentes

1. **Modelo GlobalSettings** -- tabela key-value no PostgreSQL (key unica, value JSON, updatedBy)
2. **Defaults em codigo** -- objeto com valores padrao para todas as chaves conhecidas
3. **Server Action (admin)** -- CRUD com validacao Zod e restricao de acesso (super admin only)
4. **Helper de leitura** -- funcao generica que busca do banco com fallback para default
5. **Funcoes especializadas** -- helpers que agrupam leituras relacionadas (ex: `getRetryConfig`)

## Implementacao no Nexus

### Modelo de Dados

A tabela `GlobalSettings` usa chave unica como identificador e armazena qualquer valor como JSON:

```prisma
model GlobalSettings {
  id        String   @id @default(uuid())
  key       String   @unique
  value     Json
  updatedBy String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Defaults em Codigo

**Arquivo:** `src/lib/global-settings.ts`

Cada chave de configuracao tem um default definido em codigo. Se a chave nao existir no banco, o default eh retornado. Isso garante que a aplicacao funciona mesmo com a tabela vazia.

```typescript
// src/lib/global-settings.ts
const DEFAULTS: Record<string, unknown> = {
  retry_max_retries: 3,
  retry_intervals_seconds: [10, 30, 90],
  retry_strategy: "exponential",
  retry_jitter_enabled: true,
  log_full_retention_days: 90,
  log_summary_retention_days: 180,
  notify_platform_enabled: true,
  notify_email_enabled: true,
  notify_whatsapp_enabled: true,
  notify_failure_threshold: 5,
  notify_recipients: "admins",
};
```

### Helper de Leitura

**Arquivo:** `src/lib/global-settings.ts`

Funcao generica tipada que busca do banco com fallback para default:

```typescript
export async function getGlobalSetting<T = unknown>(key: string): Promise<T> {
  const setting = await prisma.globalSettings.findUnique({
    where: { key },
  });

  if (setting) {
    return setting.value as T;
  }

  if (key in DEFAULTS) {
    return DEFAULTS[key] as T;
  }

  throw new Error(`GlobalSettings key "${key}" not found and no default defined`);
}
```

### Funcoes Especializadas

Helpers que agrupam leituras de chaves relacionadas para uso na aplicacao:

```typescript
// src/lib/global-settings.ts
export async function getRetryConfig(): Promise<RetryConfig> {
  const [maxRetries, intervalsSeconds, strategy, jitterEnabled] = await Promise.all([
    getGlobalSetting<number>("retry_max_retries"),
    getGlobalSetting<number[]>("retry_intervals_seconds"),
    getGlobalSetting<"exponential" | "fixed">("retry_strategy"),
    getGlobalSetting<boolean>("retry_jitter_enabled"),
  ]);

  return { maxRetries, intervalsSeconds, strategy, jitterEnabled };
}
```

Uso no worker:

```typescript
// src/worker/delivery.ts
const retryConfig = await getRetryConfig();
const retryDecision = getNextRetryDelay(attemptNumber, retryConfig);
```

### Interface de Tipo (Settings)

**Arquivo:** `src/lib/actions/settings.ts`

Interface TypeScript que define todas as chaves e seus tipos:

```typescript
export interface SettingsData {
  retry_max_retries: number;
  retry_intervals_seconds: number[];
  retry_strategy: "exponential" | "fixed";
  retry_jitter_enabled: boolean;
  log_full_retention_days: number;
  log_summary_retention_days: number;
  notify_platform_enabled: boolean;
  notify_email_enabled: boolean;
  notify_whatsapp_enabled: boolean;
  notify_failure_threshold: number;
  notify_recipients: string;
}
```

### Validacao Zod

**Arquivo:** `src/lib/actions/settings.ts`

Schema de validacao com limites minimos e maximos para cada campo:

```typescript
const UpdateSettingsSchema = z.object({
  retry_max_retries: z.number().int().min(0).max(10).optional(),
  retry_intervals_seconds: z.array(z.number().int().min(1).max(3600)).max(10).optional(),
  retry_strategy: z.enum(["exponential", "fixed"]).optional(),
  retry_jitter_enabled: z.boolean().optional(),
  log_full_retention_days: z.number().int().min(1).max(365).optional(),
  log_summary_retention_days: z.number().int().min(1).max(730).optional(),
  notify_platform_enabled: z.boolean().optional(),
  notify_email_enabled: z.boolean().optional(),
  notify_whatsapp_enabled: z.boolean().optional(),
  notify_failure_threshold: z.number().int().min(1).max(100).optional(),
  notify_recipients: z.string().min(1).optional(),
});
```

Todos os campos sao `.optional()` para permitir atualizacao parcial (PATCH semantics).

### Server Action: Leitura

**Arquivo:** `src/lib/actions/settings.ts`

Busca todas as configuracoes com merge de defaults:

```typescript
export async function getAllSettings(): Promise<ActionResult<SettingsData>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };
  if (!user.isSuperAdmin) return { success: false, error: "Acesso negado" };

  const rows = await prisma.globalSettings.findMany();
  const dbValues: Record<string, unknown> = {};
  for (const row of rows) {
    dbValues[row.key] = row.value;
  }

  // Merge: DB values override defaults
  const merged = { ...DEFAULTS, ...dbValues } as unknown as SettingsData;
  return { success: true, data: merged };
}
```

**Decisao de design:** O merge `{ ...DEFAULTS, ...dbValues }` garante que novas chaves adicionadas em codigo aparecem imediatamente com seu default, mesmo sem rodar migration ou seed.

### Server Action: Escrita

**Arquivo:** `src/lib/actions/settings.ts`

Atualiza configuracoes usando upsert em transacao (cria se nao existe, atualiza se existe):

```typescript
export async function updateSettings(
  data: Partial<SettingsData>
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };
  if (!user.isSuperAdmin) return { success: false, error: "Acesso negado" };

  const parsed = UpdateSettingsSchema.parse(data);

  const entries = Object.entries(parsed).filter(([, v]) => v !== undefined);

  if (entries.length === 0) {
    return { success: false, error: "Nenhuma configuracao para atualizar" };
  }

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.globalSettings.upsert({
        where: { key },
        update: { value: value as object, updatedBy: user.id },
        create: { key, value: value as object, updatedBy: user.id },
      })
    )
  );

  return { success: true };
}
```

**Decisoes de design:**
- Transacao garante atomicidade (todas as chaves atualizam juntas ou nenhuma)
- `updatedBy` registra qual admin fez a alteracao
- Upsert evita necessidade de seed/migration para popular dados iniciais

### Pagina de Configuracoes

**Arquivo:** `src/app/(protected)/settings/page.tsx`

Server Component com protecao de acesso no nivel da pagina:

```typescript
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== 'super_admin') redirect("/dashboard");

  return <SettingsContent />;
}
```

O componente `SettingsContent` (Client Component em `src/app/(protected)/settings/settings-content.tsx`) renderiza o formulario completo com secoes agrupadas (retry, retencao, notificacoes) e chama `updateSettings` no submit.

## Como Adaptar para Outro Projeto

### 1. Definir suas Chaves e Defaults

Identifique quais configuracoes precisam ser ajustaveis pelo admin:

```typescript
// src/lib/global-settings.ts
const DEFAULTS: Record<string, unknown> = {
  // Feature flags
  feature_dark_mode: true,
  feature_export_csv: false,

  // Limites operacionais
  rate_limit_requests_per_minute: 60,
  upload_max_file_size_mb: 10,

  // Integracao
  smtp_from_name: "Minha Plataforma",
  smtp_reply_to: "suporte@exemplo.com",
};
```

### 2. Criar a Interface TypeScript

```typescript
export interface SettingsData {
  feature_dark_mode: boolean;
  feature_export_csv: boolean;
  rate_limit_requests_per_minute: number;
  upload_max_file_size_mb: number;
  smtp_from_name: string;
  smtp_reply_to: string;
}
```

### 3. Criar o Schema Zod

```typescript
const UpdateSettingsSchema = z.object({
  feature_dark_mode: z.boolean().optional(),
  feature_export_csv: z.boolean().optional(),
  rate_limit_requests_per_minute: z.number().int().min(1).max(1000).optional(),
  upload_max_file_size_mb: z.number().int().min(1).max(100).optional(),
  smtp_from_name: z.string().min(1).max(100).optional(),
  smtp_reply_to: z.string().email().optional(),
});
```

### 4. Criar Helpers Especializados

```typescript
export async function getRateLimitConfig() {
  return {
    requestsPerMinute: await getGlobalSetting<number>("rate_limit_requests_per_minute"),
  };
}

export async function isFeatureEnabled(feature: string): Promise<boolean> {
  return getGlobalSetting<boolean>(`feature_${feature}`);
}
```

### 5. Criar o Formulario da UI

Crie um Client Component com secoes agrupadas que chama `getAllSettings` para carregar e `updateSettings` para salvar. Use campos tipados (toggle para booleans, number input para numeros, text input para strings).

### 6. Proteger o Acesso

No Server Component da pagina, redirecione usuarios sem permissao. Na Server Action, verifique `user.isSuperAdmin` (ou seu equivalente) antes de ler ou escrever.

## Arquivos de Referencia

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/global-settings.ts` | Defaults, `getGlobalSetting<T>`, `getRetryConfig` |
| `src/lib/actions/settings.ts` | Server Actions: `getAllSettings`, `updateSettings` + Zod schema |
| `src/app/(protected)/settings/page.tsx` | Server Component com protecao de acesso (super admin only) |
| `src/app/(protected)/settings/settings-content.tsx` | Client Component com formulario de configuracoes |
| `src/lib/retry.ts` | Consumidor do pattern: usa `RetryConfig` lido via `getRetryConfig()` |
| `src/worker/delivery.ts` | Consumidor do pattern: chama `getRetryConfig()` a cada tentativa |
| `src/worker/log-cleanup.ts` | Consumidor do pattern: usa `log_full_retention_days` para limpeza |
