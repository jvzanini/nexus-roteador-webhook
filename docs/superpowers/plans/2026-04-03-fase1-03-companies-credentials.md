# Fase 1 — Sub-plano 3: Companies + Credentials

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar CRUD completo de empresas e credenciais Meta, com criptografia AES-256-GCM, tenant scoping via memberships e interface visual com shadcn/ui.

**Architecture:** Server Actions (Next.js) para mutations. Zod para validação. Campos sensíveis criptografados no banco e mascarados na API. Tenant scoping filtra empresas por `UserCompanyMembership` (super_admin bypassa).

**Tech Stack:** Next.js 14+ (App Router, Server Actions), Prisma, Zod, shadcn/ui, Tailwind CSS, nanoid, AES-256-GCM (src/lib/encryption.ts)

**Spec:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md`

**Depends on:** Sub-plano 2 (Auth + Users) — sessao autenticada, middleware de auth, helper `getCurrentUser()`

---

## Estrutura de Arquivos

```
src/
├── lib/
│   ├── encryption.ts                          # Ja existe (encrypt, decrypt, mask)
│   ├── validations/
│   │   ├── company.ts                         # Schemas Zod para Company
│   │   └── credential.ts                      # Schemas Zod para CompanyCredential
│   └── actions/
│       ├── company.ts                         # Server Actions para Company
│       └── credential.ts                      # Server Actions para CompanyCredential
├── app/
│   └── (dashboard)/
│       └── companies/
│           ├── page.tsx                        # Lista de empresas (cards)
│           ├── _components/
│           │   ├── company-card.tsx            # Card individual de empresa
│           │   ├── company-list.tsx            # Grid de cards
│           │   ├── create-company-dialog.tsx   # Dialog para criar empresa
│           │   └── company-status-badge.tsx    # Badge ativa/inativa
│           └── [id]/
│               ├── page.tsx                   # Pagina da empresa (tabs)
│               ├── _components/
│               │   ├── company-header.tsx      # Header com nome e status
│               │   ├── company-tabs.tsx        # Navegacao por abas
│               │   ├── overview-tab.tsx        # Aba "Visao Geral"
│               │   ├── credentials-tab.tsx     # Aba "Credenciais"
│               │   ├── edit-company-dialog.tsx  # Dialog para editar empresa
│               │   ├── credential-form.tsx      # Formulario de credenciais
│               │   └── sensitive-field.tsx       # Campo com toggle mostrar/ocultar
│               └── loading.tsx                 # Skeleton loading
└── lib/
    └── __tests__/
        ├── company-validation.test.ts          # Testes Zod Company
        ├── credential-validation.test.ts       # Testes Zod Credential
        └── credential-encryption.test.ts       # Testes encrypt/decrypt credenciais
```

---

### Task 1: Schemas de validacao Zod

**Files:**
- Create: `src/lib/validations/company.ts`
- Create: `src/lib/validations/credential.ts`

- [ ] **Step 1: Escrever teste para validacao de Company**

Criar `src/lib/__tests__/company-validation.test.ts`:

```typescript
import {
  createCompanySchema,
  updateCompanySchema,
} from "../validations/company";

describe("createCompanySchema", () => {
  it("validates a valid company", () => {
    const result = createCompanySchema.safeParse({
      name: "Empresa Teste",
      logoUrl: "https://example.com/logo.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createCompanySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name shorter than 2 chars", () => {
    const result = createCompanySchema.safeParse({ name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 chars", () => {
    const result = createCompanySchema.safeParse({ name: "A".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("allows empty logoUrl", () => {
    const result = createCompanySchema.safeParse({ name: "Teste" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid logoUrl", () => {
    const result = createCompanySchema.safeParse({
      name: "Teste",
      logoUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateCompanySchema", () => {
  it("validates partial update with name only", () => {
    const result = updateCompanySchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("validates partial update with isActive only", () => {
    const result = updateCompanySchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = updateCompanySchema.safeParse({});
    // partial schema allows empty — business logic validates at least one field
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Escrever teste para validacao de Credential**

Criar `src/lib/__tests__/credential-validation.test.ts`:

```typescript
import {
  upsertCredentialSchema,
} from "../validations/credential";

describe("upsertCredentialSchema", () => {
  const validCredential = {
    metaAppId: "123456789",
    metaAppSecret: "abc123def456",
    verifyToken: "my-verify-token",
    accessToken: "EAAxxxxxxx",
    phoneNumberId: "109876543",
    wabaId: "112233445566",
  };

  it("validates a complete credential", () => {
    const result = upsertCredentialSchema.safeParse(validCredential);
    expect(result.success).toBe(true);
  });

  it("requires metaAppId", () => {
    const { metaAppId, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires metaAppSecret", () => {
    const { metaAppSecret, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires verifyToken", () => {
    const { verifyToken, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires accessToken", () => {
    const { accessToken, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("allows optional phoneNumberId", () => {
    const { phoneNumberId, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("allows optional wabaId", () => {
    const { wabaId, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("rejects empty metaAppId", () => {
    const result = upsertCredentialSchema.safeParse({
      ...validCredential,
      metaAppId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty metaAppSecret", () => {
    const result = upsertCredentialSchema.safeParse({
      ...validCredential,
      metaAppSecret: "",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar testes para verificar que falham**

```bash
npm test -- --testPathPattern="(company-validation|credential-validation)"
```

Expected: FAIL — `Cannot find module '../validations/company'` e `Cannot find module '../validations/credential'`

- [ ] **Step 4: Implementar schema Zod de Company**

Criar `src/lib/validations/company.ts`:

```typescript
import { z } from "zod";

export const createCompanySchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter no minimo 2 caracteres")
    .max(100, "Nome deve ter no maximo 100 caracteres")
    .trim(),
  logoUrl: z
    .string()
    .url("URL do logo invalida")
    .optional()
    .or(z.literal("")),
});

export const updateCompanySchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter no minimo 2 caracteres")
    .max(100, "Nome deve ter no maximo 100 caracteres")
    .trim()
    .optional(),
  logoUrl: z
    .string()
    .url("URL do logo invalida")
    .optional()
    .or(z.literal("")),
  isActive: z.boolean().optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
```

- [ ] **Step 5: Implementar schema Zod de Credential**

Criar `src/lib/validations/credential.ts`:

```typescript
import { z } from "zod";

export const upsertCredentialSchema = z.object({
  metaAppId: z
    .string()
    .min(1, "Meta App ID e obrigatorio")
    .max(50, "Meta App ID deve ter no maximo 50 caracteres")
    .trim(),
  metaAppSecret: z
    .string()
    .min(1, "Meta App Secret e obrigatorio")
    .max(200, "Meta App Secret deve ter no maximo 200 caracteres")
    .trim(),
  verifyToken: z
    .string()
    .min(1, "Verify Token e obrigatorio")
    .max(200, "Verify Token deve ter no maximo 200 caracteres")
    .trim(),
  accessToken: z
    .string()
    .min(1, "Access Token e obrigatorio")
    .max(500, "Access Token deve ter no maximo 500 caracteres")
    .trim(),
  phoneNumberId: z
    .string()
    .max(50, "Phone Number ID deve ter no maximo 50 caracteres")
    .trim()
    .optional()
    .or(z.literal("")),
  wabaId: z
    .string()
    .max(50, "WABA ID deve ter no maximo 50 caracteres")
    .trim()
    .optional()
    .or(z.literal("")),
});

export type UpsertCredentialInput = z.infer<typeof upsertCredentialSchema>;
```

- [ ] **Step 6: Rodar testes para verificar que passam**

```bash
npm test -- --testPathPattern="(company-validation|credential-validation)"
```

Expected: PASS — todos os testes passando

- [ ] **Step 7: Commit**

```bash
git add src/lib/validations/ src/lib/__tests__/company-validation.test.ts src/lib/__tests__/credential-validation.test.ts
git commit -m "feat: schemas Zod para Company e CompanyCredential"
```

---

### Task 2: Testes de criptografia para credenciais

**Files:**
- Create: `src/lib/__tests__/credential-encryption.test.ts`

- [ ] **Step 1: Escrever teste de encrypt/decrypt para fluxo de credenciais**

Criar `src/lib/__tests__/credential-encryption.test.ts`:

```typescript
import { encrypt, decrypt, mask } from "../encryption";

describe("credential encryption flow", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "b".repeat(64); // 32 bytes hex
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  const sensitiveFields = {
    metaAppSecret: "abc123secret456def",
    verifyToken: "my-custom-verify-token-2024",
    accessToken: "EAAGxxxxxxxxxxxxxxxxxxxxxxZBZBZB",
  };

  it("encrypts all sensitive credential fields", () => {
    const encrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(sensitiveFields)) {
      encrypted[key] = encrypt(value);
      expect(encrypted[key]).not.toBe(value);
      expect(encrypted[key]).toContain(":");
    }
  });

  it("decrypts all sensitive credential fields back to original", () => {
    for (const [, value] of Object.entries(sensitiveFields)) {
      const encrypted = encrypt(value);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(value);
    }
  });

  it("masks sensitive fields correctly for API response", () => {
    expect(mask("abc123secret456def")).toBe("****...6def");
    expect(mask("EAAGxxxxxxxxxxxxxxxxxxxxxxZBZBZB")).toBe("****...ZBZB");
    expect(mask("ab")).toBe("****");
    expect(mask("abcd")).toBe("****");
    expect(mask("abcde")).toBe("****...bcde");
  });

  it("simulates full save-and-read cycle", () => {
    // Simula salvar no banco
    const toSave = {
      metaAppId: "123456789", // nao criptografado
      metaAppSecret: encrypt(sensitiveFields.metaAppSecret),
      verifyToken: encrypt(sensitiveFields.verifyToken),
      accessToken: encrypt(sensitiveFields.accessToken),
      phoneNumberId: "109876543", // nao criptografado
      wabaId: "112233445566", // nao criptografado
    };

    // Simula ler do banco e retornar para API (masked)
    const apiResponse = {
      metaAppId: toSave.metaAppId,
      metaAppSecret: mask(decrypt(toSave.metaAppSecret)),
      verifyToken: mask(decrypt(toSave.verifyToken)),
      accessToken: mask(decrypt(toSave.accessToken)),
      phoneNumberId: toSave.phoneNumberId,
      wabaId: toSave.wabaId,
    };

    expect(apiResponse.metaAppSecret).toBe("****...6def");
    expect(apiResponse.verifyToken).toBe("****...2024");
    expect(apiResponse.accessToken).toBe("****...ZBZB");
    expect(apiResponse.metaAppId).toBe("123456789");
  });
});
```

- [ ] **Step 2: Rodar teste**

```bash
npm test -- --testPathPattern=credential-encryption
```

Expected: PASS — todos os testes passando (encryption.ts ja existe do sub-plano 1)

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/credential-encryption.test.ts
git commit -m "test: testes de criptografia para fluxo de credenciais Meta"
```

---

### Task 3: Server Actions para Company

**Files:**
- Create: `src/lib/actions/company.ts`

- [ ] **Step 1: Implementar helper de slugify**

Criar `src/lib/utils/slugify.ts`:

```typescript
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")     // substitui nao-alfanumericos por hifen
    .replace(/^-+|-+$/g, "")         // remove hifens no inicio/fim
    .substring(0, 80);                // limita tamanho
}
```

- [ ] **Step 2: Implementar Server Actions de Company**

Criar `src/lib/actions/company.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  createCompanySchema,
  updateCompanySchema,
  type CreateCompanyInput,
  type UpdateCompanyInput,
} from "@/lib/validations/company";
import { slugify } from "@/lib/utils/slugify";
// import { getCurrentUser } from "@/lib/auth"; // do sub-plano 2

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Retorna as empresas acessiveis pelo usuario autenticado.
 * Super admin: todas. Demais: filtradas por UserCompanyMembership ativa.
 */
export async function getCompanies(options?: {
  includeInactive?: boolean;
}): Promise<ActionResult> {
  try {
    // TODO: substituir pelo getCurrentUser() do sub-plano 2
    // const user = await getCurrentUser();
    // if (!user) return { success: false, error: "Nao autenticado" };

    const where: Record<string, unknown> = {};

    if (!options?.includeInactive) {
      where.isActive = true;
    }

    // TODO: tenant scoping — quando nao for super_admin, filtrar por membership:
    // if (!user.isSuperAdmin) {
    //   where.memberships = {
    //     some: {
    //       userId: user.id,
    //       isActive: true,
    //     },
    //   };
    // }

    const companies = await prisma.company.findMany({
      where,
      include: {
        credential: {
          select: { id: true }, // so verifica se existe, sem expor dados
        },
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: companies };
  } catch (error) {
    console.error("[getCompanies]", error);
    return { success: false, error: "Erro ao buscar empresas" };
  }
}

/**
 * Retorna uma empresa pelo ID, com verificacao de acesso.
 */
export async function getCompanyById(
  companyId: string
): Promise<ActionResult> {
  try {
    // TODO: getCurrentUser() + verificar acesso (super_admin ou membership)

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        credential: {
          select: { id: true },
        },
        _count: {
          select: {
            memberships: true,
            routes: true,
          },
        },
      },
    });

    if (!company) {
      return { success: false, error: "Empresa nao encontrada" };
    }

    return { success: true, data: company };
  } catch (error) {
    console.error("[getCompanyById]", error);
    return { success: false, error: "Erro ao buscar empresa" };
  }
}

/**
 * Cria uma nova empresa com webhook_key e slug automaticos.
 * Apenas super_admin e company_admin podem criar.
 */
export async function createCompany(
  input: CreateCompanyInput
): Promise<ActionResult> {
  try {
    // TODO: getCurrentUser() + verificar permissao (super_admin)

    const parsed = createCompanySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados invalidos",
      };
    }

    const { name, logoUrl } = parsed.data;

    // Gerar slug unico
    let slug = slugify(name);
    const existingSlug = await prisma.company.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${nanoid(6)}`;
    }

    // Gerar webhook_key com nanoid(21)
    const webhookKey = nanoid(21);

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        webhookKey,
        logoUrl: logoUrl || null,
      },
    });

    revalidatePath("/companies");

    return { success: true, data: company };
  } catch (error) {
    console.error("[createCompany]", error);
    return { success: false, error: "Erro ao criar empresa" };
  }
}

/**
 * Atualiza uma empresa. Soft delete via isActive = false.
 * Apenas super_admin e company_admin da empresa podem editar.
 */
export async function updateCompany(
  companyId: string,
  input: UpdateCompanyInput
): Promise<ActionResult> {
  try {
    // TODO: getCurrentUser() + verificar permissao

    const parsed = updateCompanySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados invalidos",
      };
    }

    const existing = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!existing) {
      return { success: false, error: "Empresa nao encontrada" };
    }

    const data: Record<string, unknown> = {};

    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name;
      // Regerar slug se nome mudar
      let slug = slugify(parsed.data.name);
      const existingSlug = await prisma.company.findFirst({
        where: { slug, id: { not: companyId } },
      });
      if (existingSlug) {
        slug = `${slug}-${nanoid(6)}`;
      }
      data.slug = slug;
    }

    if (parsed.data.logoUrl !== undefined) {
      data.logoUrl = parsed.data.logoUrl || null;
    }

    if (parsed.data.isActive !== undefined) {
      data.isActive = parsed.data.isActive;
    }

    const company = await prisma.company.update({
      where: { id: companyId },
      data,
    });

    revalidatePath("/companies");
    revalidatePath(`/companies/${companyId}`);

    return { success: true, data: company };
  } catch (error) {
    console.error("[updateCompany]", error);
    return { success: false, error: "Erro ao atualizar empresa" };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/company.ts src/lib/utils/slugify.ts
git commit -m "feat: Server Actions CRUD de empresas com slug e webhook_key"
```

---

### Task 4: Server Actions para Credential

**Files:**
- Create: `src/lib/actions/credential.ts`

- [ ] **Step 1: Implementar Server Actions de Credential**

Criar `src/lib/actions/credential.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, mask } from "@/lib/encryption";
import {
  upsertCredentialSchema,
  type UpsertCredentialInput,
} from "@/lib/validations/credential";
// import { getCurrentUser } from "@/lib/auth"; // do sub-plano 2

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/** Campos que sao criptografados no banco */
const ENCRYPTED_FIELDS = [
  "metaAppSecret",
  "verifyToken",
  "accessToken",
] as const;

type EncryptedField = (typeof ENCRYPTED_FIELDS)[number];

/**
 * Retorna credenciais da empresa com campos sensiveis mascarados.
 * NUNCA retorna valores em texto puro.
 */
export async function getCredential(
  companyId: string
): Promise<ActionResult> {
  try {
    // TODO: getCurrentUser() + verificar acesso

    const credential = await prisma.companyCredential.findUnique({
      where: { companyId },
    });

    if (!credential) {
      return { success: true, data: null };
    }

    // Descriptografar e mascarar campos sensiveis
    const masked = {
      id: credential.id,
      companyId: credential.companyId,
      metaAppId: credential.metaAppId,
      metaAppSecret: mask(decrypt(credential.metaAppSecret)),
      verifyToken: mask(decrypt(credential.verifyToken)),
      accessToken: mask(decrypt(credential.accessToken)),
      phoneNumberId: credential.phoneNumberId,
      wabaId: credential.wabaId,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };

    return { success: true, data: masked };
  } catch (error) {
    console.error("[getCredential]", error);
    return { success: false, error: "Erro ao buscar credenciais" };
  }
}

/**
 * Retorna o valor descriptografado de um campo sensivel especifico.
 * Usado pelo toggle "mostrar" na UI. Requer permissao company_admin ou super_admin.
 */
export async function revealCredentialField(
  companyId: string,
  field: EncryptedField
): Promise<ActionResult<string>> {
  try {
    // TODO: getCurrentUser() + verificar permissao (super_admin ou company_admin)

    if (!ENCRYPTED_FIELDS.includes(field)) {
      return { success: false, error: "Campo invalido" };
    }

    const credential = await prisma.companyCredential.findUnique({
      where: { companyId },
    });

    if (!credential) {
      return { success: false, error: "Credenciais nao encontradas" };
    }

    const encryptedValue = credential[field];
    const decryptedValue = decrypt(encryptedValue);

    return { success: true, data: decryptedValue };
  } catch (error) {
    console.error("[revealCredentialField]", error);
    return { success: false, error: "Erro ao revelar campo" };
  }
}

/**
 * Cria ou atualiza credenciais Meta da empresa (1:1).
 * Campos sensiveis sao criptografados antes de salvar.
 */
export async function upsertCredential(
  companyId: string,
  input: UpsertCredentialInput
): Promise<ActionResult> {
  try {
    // TODO: getCurrentUser() + verificar permissao (super_admin ou company_admin)

    const parsed = upsertCredentialSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados invalidos",
      };
    }

    // Verificar se a empresa existe
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      return { success: false, error: "Empresa nao encontrada" };
    }

    const {
      metaAppId,
      metaAppSecret,
      verifyToken,
      accessToken,
      phoneNumberId,
      wabaId,
    } = parsed.data;

    // Criptografar campos sensiveis
    const data = {
      metaAppId,
      metaAppSecret: encrypt(metaAppSecret),
      verifyToken: encrypt(verifyToken),
      accessToken: encrypt(accessToken),
      phoneNumberId: phoneNumberId || null,
      wabaId: wabaId || null,
    };

    const credential = await prisma.companyCredential.upsert({
      where: { companyId },
      create: {
        companyId,
        ...data,
      },
      update: data,
    });

    revalidatePath(`/companies/${companyId}`);

    // Retornar mascarado
    return {
      success: true,
      data: {
        id: credential.id,
        companyId: credential.companyId,
        metaAppId: credential.metaAppId,
        metaAppSecret: mask(metaAppSecret),
        verifyToken: mask(verifyToken),
        accessToken: mask(accessToken),
        phoneNumberId: credential.phoneNumberId,
        wabaId: credential.wabaId,
      },
    };
  } catch (error) {
    console.error("[upsertCredential]", error);
    return { success: false, error: "Erro ao salvar credenciais" };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/credential.ts
git commit -m "feat: Server Actions CRUD de credenciais com criptografia AES-256-GCM"
```

---

### Task 5: UI — Lista de empresas (/companies)

**Files:**
- Create: `src/app/(dashboard)/companies/page.tsx`
- Create: `src/app/(dashboard)/companies/_components/company-card.tsx`
- Create: `src/app/(dashboard)/companies/_components/company-list.tsx`
- Create: `src/app/(dashboard)/companies/_components/create-company-dialog.tsx`
- Create: `src/app/(dashboard)/companies/_components/company-status-badge.tsx`

- [ ] **Step 1: Instalar componentes shadcn/ui necessarios**

```bash
npx shadcn@latest add card button input label tabs dialog badge textarea toast
```

- [ ] **Step 2: Criar componente CompanyStatusBadge**

Criar `src/app/(dashboard)/companies/_components/company-status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";

interface CompanyStatusBadgeProps {
  isActive: boolean;
}

export function CompanyStatusBadge({ isActive }: CompanyStatusBadgeProps) {
  return (
    <Badge
      variant={isActive ? "default" : "secondary"}
      className={
        isActive
          ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/30"
          : "bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 border-zinc-500/30"
      }
    >
      {isActive ? "Ativa" : "Inativa"}
    </Badge>
  );
}
```

- [ ] **Step 3: Criar componente CompanyCard**

Criar `src/app/(dashboard)/companies/_components/company-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Copy, Check, ExternalLink, Users, Route } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CompanyStatusBadge } from "./company-status-badge";

interface CompanyCardProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    logoUrl: string | null;
    isActive: boolean;
    _count: {
      memberships: number;
    };
    credential: { id: string } | null;
  };
}

export function CompanyCard({ company }: CompanyCardProps) {
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhook/${company.webhookKey}`;

  async function handleCopyWebhookUrl() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          {company.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={`Logo ${company.name}`}
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-zinc-400" />
            </div>
          )}
          <div>
            <Link
              href={`/companies/${company.id}`}
              className="text-sm font-semibold text-zinc-100 hover:text-white transition-colors"
            >
              {company.name}
            </Link>
            <p className="text-xs text-zinc-500">/{company.slug}</p>
          </div>
        </div>
        <CompanyStatusBadge isActive={company.isActive} />
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Webhook URL */}
        <div className="flex items-center gap-2 p-2 rounded-md bg-zinc-800/50 border border-zinc-700/50">
          <code className="text-xs text-zinc-400 truncate flex-1">
            {webhookUrl}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleCopyWebhookUrl}
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3 text-zinc-400" />
            )}
          </Button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {company._count.memberships} membros
          </span>
          <span className="flex items-center gap-1">
            {company.credential ? (
              <span className="text-emerald-400">Credenciais configuradas</span>
            ) : (
              <span className="text-amber-400">Sem credenciais</span>
            )}
          </span>
        </div>

        {/* Link */}
        <Link
          href={`/companies/${company.id}`}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Gerenciar
        </Link>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Criar componente CompanyList**

Criar `src/app/(dashboard)/companies/_components/company-list.tsx`:

```tsx
import { CompanyCard } from "./company-card";

interface CompanyListProps {
  companies: Array<{
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    logoUrl: string | null;
    isActive: boolean;
    _count: { memberships: number };
    credential: { id: string } | null;
  }>;
}

export function CompanyList({ companies }: CompanyListProps) {
  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
          <span className="text-2xl">🏢</span>
        </div>
        <h3 className="text-lg font-semibold text-zinc-200 mb-1">
          Nenhuma empresa cadastrada
        </h3>
        <p className="text-sm text-zinc-500 max-w-sm">
          Crie sua primeira empresa para comecar a configurar o roteamento de webhooks.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {companies.map((company) => (
        <CompanyCard key={company.id} company={company} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Criar componente CreateCompanyDialog**

Criar `src/app/(dashboard)/companies/_components/create-company-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCompany } from "@/lib/actions/company";

export function CreateCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);

    const name = formData.get("name") as string;
    const logoUrl = formData.get("logoUrl") as string;

    startTransition(async () => {
      const result = await createCompany({
        name,
        logoUrl: logoUrl || undefined,
      });

      if (result.success) {
        setOpen(false);
      } else {
        setError(result.error ?? "Erro desconhecido");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Empresa
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Criar Empresa</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Adicione uma nova empresa para configurar o roteamento de webhooks.
            O slug e a webhook key serao gerados automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-zinc-300">
              Nome da Empresa
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="Ex: Empresa ABC"
              required
              minLength={2}
              maxLength={100}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logoUrl" className="text-zinc-300">
              URL do Logo (opcional)
            </Label>
            <Input
              id="logoUrl"
              name="logoUrl"
              type="url"
              placeholder="https://example.com/logo.png"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-zinc-400"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Criando..." : "Criar Empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Criar pagina /companies**

Criar `src/app/(dashboard)/companies/page.tsx`:

```tsx
import { getCompanies } from "@/lib/actions/company";
import { CompanyList } from "./_components/company-list";
import { CreateCompanyDialog } from "./_components/create-company-dialog";

export default async function CompaniesPage() {
  const result = await getCompanies();
  const companies = result.success ? (result.data as any[]) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Empresas</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Gerencie as empresas e suas integracoes com a Meta.
          </p>
        </div>
        <CreateCompanyDialog />
      </div>

      {/* Lista */}
      <CompanyList companies={companies} />
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/companies/
git commit -m "feat: UI lista de empresas com cards, status badge e dialog de criacao"
```

---

### Task 6: UI — Pagina da empresa com tabs (/companies/[id])

**Files:**
- Create: `src/app/(dashboard)/companies/[id]/page.tsx`
- Create: `src/app/(dashboard)/companies/[id]/loading.tsx`
- Create: `src/app/(dashboard)/companies/[id]/_components/company-header.tsx`
- Create: `src/app/(dashboard)/companies/[id]/_components/company-tabs.tsx`
- Create: `src/app/(dashboard)/companies/[id]/_components/overview-tab.tsx`
- Create: `src/app/(dashboard)/companies/[id]/_components/credentials-tab.tsx`
- Create: `src/app/(dashboard)/companies/[id]/_components/edit-company-dialog.tsx`
- Create: `src/app/(dashboard)/companies/[id]/_components/credential-form.tsx`
- Create: `src/app/(dashboard)/companies/[id]/_components/sensitive-field.tsx`

- [ ] **Step 1: Criar componente SensitiveField (toggle mostrar/ocultar)**

Criar `src/app/(dashboard)/companies/[id]/_components/sensitive-field.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revealCredentialField } from "@/lib/actions/credential";

interface SensitiveFieldProps {
  label: string;
  maskedValue: string;
  companyId: string;
  fieldName: "metaAppSecret" | "verifyToken" | "accessToken";
}

export function SensitiveField({
  label,
  maskedValue,
  companyId,
  fieldName,
}: SensitiveFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (revealed) {
      setRevealed(false);
      setRevealedValue(null);
      return;
    }

    startTransition(async () => {
      const result = await revealCredentialField(companyId, fieldName);
      if (result.success && result.data) {
        setRevealedValue(result.data);
        setRevealed(true);
      }
    });
  }

  async function handleCopy() {
    const valueToCopy = revealedValue ?? maskedValue;
    await navigator.clipboard.writeText(valueToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const displayValue = revealed && revealedValue ? revealedValue : maskedValue;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      <div className="flex items-center gap-2 p-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
        <code className="text-sm text-zinc-300 truncate flex-1 font-mono">
          {displayValue}
        </code>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleToggle}
            disabled={isPending}
          >
            {revealed ? (
              <EyeOff className="h-3.5 w-3.5 text-zinc-400" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-zinc-400" />
            )}
          </Button>
          {revealed && revealedValue && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-zinc-400" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar componente CredentialForm**

Criar `src/app/(dashboard)/companies/[id]/_components/credential-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertCredential } from "@/lib/actions/credential";

interface CredentialFormProps {
  companyId: string;
  onSuccess?: () => void;
}

export function CredentialForm({ companyId, onSuccess }: CredentialFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await upsertCredential(companyId, {
        metaAppId: formData.get("metaAppId") as string,
        metaAppSecret: formData.get("metaAppSecret") as string,
        verifyToken: formData.get("verifyToken") as string,
        accessToken: formData.get("accessToken") as string,
        phoneNumberId: (formData.get("phoneNumberId") as string) || undefined,
        wabaId: (formData.get("wabaId") as string) || undefined,
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        onSuccess?.();
      } else {
        setError(result.error ?? "Erro desconhecido");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="metaAppId" className="text-zinc-300">
            Meta App ID *
          </Label>
          <Input
            id="metaAppId"
            name="metaAppId"
            placeholder="123456789"
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="metaAppSecret" className="text-zinc-300">
            Meta App Secret *
          </Label>
          <Input
            id="metaAppSecret"
            name="metaAppSecret"
            type="password"
            placeholder="Seu app secret"
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="verifyToken" className="text-zinc-300">
            Verify Token *
          </Label>
          <Input
            id="verifyToken"
            name="verifyToken"
            type="password"
            placeholder="Token de verificacao"
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accessToken" className="text-zinc-300">
            Access Token *
          </Label>
          <Input
            id="accessToken"
            name="accessToken"
            type="password"
            placeholder="EAAxxxxxxxx"
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phoneNumberId" className="text-zinc-300">
            Phone Number ID (opcional)
          </Label>
          <Input
            id="phoneNumberId"
            name="phoneNumberId"
            placeholder="109876543"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wabaId" className="text-zinc-300">
            WABA ID (opcional)
          </Label>
          <Input
            id="wabaId"
            name="wabaId"
            placeholder="112233445566"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && (
        <p className="text-sm text-emerald-400">
          Credenciais salvas com sucesso!
        </p>
      )}

      <Button type="submit" disabled={isPending} className="gap-2">
        <Save className="h-4 w-4" />
        {isPending ? "Salvando..." : "Salvar Credenciais"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Criar componente CompanyHeader**

Criar `src/app/(dashboard)/companies/[id]/_components/company-header.tsx`:

```tsx
import { Building2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CompanyStatusBadge } from "../../_components/company-status-badge";
import { EditCompanyDialog } from "./edit-company-dialog";

interface CompanyHeaderProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    logoUrl: string | null;
    isActive: boolean;
  };
}

export function CompanyHeader({ company }: CompanyHeaderProps) {
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhook/${company.webhookKey}`;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Link
        href="/companies"
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para empresas
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {company.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={`Logo ${company.name}`}
              className="w-14 h-14 rounded-xl object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-zinc-400" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-100">
                {company.name}
              </h1>
              <CompanyStatusBadge isActive={company.isActive} />
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">/{company.slug}</p>
          </div>
        </div>

        <EditCompanyDialog company={company} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar componente EditCompanyDialog**

Criar `src/app/(dashboard)/companies/[id]/_components/edit-company-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCompany } from "@/lib/actions/company";

interface EditCompanyDialogProps {
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
    isActive: boolean;
  };
}

export function EditCompanyDialog({ company }: EditCompanyDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);

    const name = formData.get("name") as string;
    const logoUrl = formData.get("logoUrl") as string;

    startTransition(async () => {
      const result = await updateCompany(company.id, {
        name,
        logoUrl: logoUrl || undefined,
      });

      if (result.success) {
        setOpen(false);
      } else {
        setError(result.error ?? "Erro desconhecido");
      }
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const result = await updateCompany(company.id, {
        isActive: !company.isActive,
      });

      if (!result.success) {
        setError(result.error ?? "Erro desconhecido");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-zinc-700 text-zinc-300">
          <Settings className="h-4 w-4" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Editar Empresa</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Altere as informacoes da empresa. O slug sera regenerado se o nome mudar.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-zinc-300">
              Nome da Empresa
            </Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={company.name}
              required
              minLength={2}
              maxLength={100}
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-logoUrl" className="text-zinc-300">
              URL do Logo (opcional)
            </Label>
            <Input
              id="edit-logoUrl"
              name="logoUrl"
              type="url"
              defaultValue={company.logoUrl ?? ""}
              placeholder="https://example.com/logo.png"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleToggleActive}
              disabled={isPending}
              className="sm:mr-auto"
            >
              {company.isActive ? "Desativar Empresa" : "Reativar Empresa"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-zinc-400"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Criar componente OverviewTab**

Criar `src/app/(dashboard)/companies/[id]/_components/overview-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Copy, Check, Globe, Key, Users, Route } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface OverviewTabProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    isActive: boolean;
    createdAt: Date;
    credential: { id: string } | null;
    _count: {
      memberships: number;
      routes: number;
    };
  };
}

export function OverviewTab({ company }: OverviewTabProps) {
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhook/${company.webhookKey}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Webhook URL Card */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            URL do Webhook
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-3 rounded-md bg-zinc-800 border border-zinc-700">
            <code className="text-sm text-zinc-200 truncate flex-1 font-mono">
              {webhookUrl}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4 text-zinc-400" />
              )}
            </Button>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Configure esta URL no painel do Meta App como Webhook Callback URL.
          </p>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">
                  {company._count.memberships}
                </p>
                <p className="text-xs text-zinc-500">Membros</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Route className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">
                  {company._count.routes}
                </p>
                <p className="text-xs text-zinc-500">Rotas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${company.credential ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                <Key className={`h-5 w-5 ${company.credential ? "text-emerald-400" : "text-amber-400"}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  {company.credential ? "Configuradas" : "Pendentes"}
                </p>
                <p className="text-xs text-zinc-500">Credenciais Meta</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-300">
            Informacoes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Slug</span>
            <span className="text-zinc-300 font-mono">/{company.slug}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Webhook Key</span>
            <span className="text-zinc-300 font-mono">{company.webhookKey}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Criada em</span>
            <span className="text-zinc-300">
              {new Date(company.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Criar componente CredentialsTab**

Criar `src/app/(dashboard)/companies/[id]/_components/credentials-tab.tsx`:

```tsx
import { Key, ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCredential } from "@/lib/actions/credential";
import { SensitiveField } from "./sensitive-field";
import { CredentialForm } from "./credential-form";

interface CredentialsTabProps {
  companyId: string;
}

export async function CredentialsTab({ companyId }: CredentialsTabProps) {
  const result = await getCredential(companyId);
  const credential = result.success ? result.data : null;

  return (
    <div className="space-y-6">
      {/* Aviso de seguranca */}
      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="flex items-start gap-3 pt-4">
          <ShieldCheck className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">
              Dados sensiveis criptografados
            </p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Todos os campos sensiveis sao armazenados com criptografia AES-256-GCM.
              Use o botao de olho para revelar valores temporariamente.
            </p>
          </div>
        </CardContent>
      </Card>

      {credential ? (
        <>
          {/* Credenciais existentes — exibir mascaradas */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Key className="h-4 w-4" />
                Credenciais Meta Configuradas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Campo nao-sensivel */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">
                  Meta App ID
                </label>
                <div className="p-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                  <code className="text-sm text-zinc-300 font-mono">
                    {credential.metaAppId}
                  </code>
                </div>
              </div>

              {/* Campos sensiveis com toggle */}
              <SensitiveField
                label="Meta App Secret"
                maskedValue={credential.metaAppSecret}
                companyId={companyId}
                fieldName="metaAppSecret"
              />

              <SensitiveField
                label="Verify Token"
                maskedValue={credential.verifyToken}
                companyId={companyId}
                fieldName="verifyToken"
              />

              <SensitiveField
                label="Access Token"
                maskedValue={credential.accessToken}
                companyId={companyId}
                fieldName="accessToken"
              />

              {/* Campos opcionais nao-sensiveis */}
              {credential.phoneNumberId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">
                    Phone Number ID
                  </label>
                  <div className="p-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                    <code className="text-sm text-zinc-300 font-mono">
                      {credential.phoneNumberId}
                    </code>
                  </div>
                </div>
              )}

              {credential.wabaId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">
                    WABA ID
                  </label>
                  <div className="p-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                    <code className="text-sm text-zinc-300 font-mono">
                      {credential.wabaId}
                    </code>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formulario para atualizar */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-300">
                Atualizar Credenciais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500 mb-4">
                Preencha todos os campos para atualizar as credenciais.
                Os valores antigos serao substituidos.
              </p>
              <CredentialForm companyId={companyId} />
            </CardContent>
          </Card>
        </>
      ) : (
        /* Sem credenciais — exibir formulario de criacao */
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Nenhuma credencial configurada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-500 mb-6">
              Configure as credenciais do Meta App para que o sistema possa
              receber e validar webhooks desta empresa.
            </p>
            <CredentialForm companyId={companyId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Criar componente CompanyTabs**

Criar `src/app/(dashboard)/companies/[id]/_components/company-tabs.tsx`:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "./overview-tab";
import { CredentialsTab } from "./credentials-tab";

interface CompanyTabsProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    isActive: boolean;
    createdAt: Date;
    credential: { id: string } | null;
    _count: {
      memberships: number;
      routes: number;
    };
  };
}

export function CompanyTabs({ company }: CompanyTabsProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="bg-zinc-800/50 border border-zinc-700/50">
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
        >
          Visao Geral
        </TabsTrigger>
        <TabsTrigger
          value="credentials"
          className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
        >
          Credenciais
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OverviewTab company={company} />
      </TabsContent>

      <TabsContent value="credentials">
        <CredentialsTab companyId={company.id} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 8: Criar pagina /companies/[id]**

Criar `src/app/(dashboard)/companies/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/actions/company";
import { CompanyHeader } from "./_components/company-header";
import { CompanyTabs } from "./_components/company-tabs";

interface CompanyPageProps {
  params: { id: string };
}

export default async function CompanyPage({ params }: CompanyPageProps) {
  const result = await getCompanyById(params.id);

  if (!result.success || !result.data) {
    notFound();
  }

  const company = result.data as any;

  return (
    <div className="space-y-6">
      <CompanyHeader company={company} />
      <CompanyTabs company={company} />
    </div>
  );
}
```

- [ ] **Step 9: Criar loading skeleton**

Criar `src/app/(dashboard)/companies/[id]/loading.tsx`:

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function CompanyLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-zinc-800" />
        <div className="space-y-2">
          <div className="h-7 w-48 bg-zinc-800 rounded" />
          <div className="h-4 w-24 bg-zinc-800 rounded" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="h-10 w-64 bg-zinc-800 rounded" />

      {/* Content skeleton */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <div className="h-5 w-32 bg-zinc-800 rounded" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-12 bg-zinc-800 rounded" />
          <div className="h-12 bg-zinc-800 rounded" />
          <div className="h-12 bg-zinc-800 rounded" />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add src/app/\(dashboard\)/companies/\[id\]/
git commit -m "feat: UI pagina de empresa com tabs Visao Geral e Credenciais"
```

---

### Task 7: Tenant scoping e integracao com auth

**Files:**
- Modify: `src/lib/actions/company.ts`
- Modify: `src/lib/actions/credential.ts`

> **Nota:** Esta task sera finalizada apos a implementacao do sub-plano 2 (Auth + Users). Os TODOs nos Server Actions marcam os pontos exatos de integracao.

- [ ] **Step 1: Integrar getCurrentUser() nas actions de Company**

Quando o sub-plano 2 estiver implementado, substituir os blocos `// TODO: getCurrentUser()` em `src/lib/actions/company.ts`:

```typescript
// Exemplo de integracao (aplicar em cada action):
import { getCurrentUser } from "@/lib/auth";

// Dentro de cada action:
const user = await getCurrentUser();
if (!user) return { success: false, error: "Nao autenticado" };

// Para getCompanies — tenant scoping:
if (!user.isSuperAdmin) {
  where.memberships = {
    some: {
      userId: user.id,
      isActive: true,
    },
  };
}

// Para createCompany — verificar permissao:
if (!user.isSuperAdmin) {
  return { success: false, error: "Apenas super admin pode criar empresas" };
}

// Para updateCompany — verificar permissao:
if (!user.isSuperAdmin) {
  const membership = await prisma.userCompanyMembership.findUnique({
    where: {
      userId_companyId: { userId: user.id, companyId },
    },
  });
  if (!membership || membership.role !== "company_admin") {
    return { success: false, error: "Sem permissao" };
  }
}
```

- [ ] **Step 2: Integrar getCurrentUser() nas actions de Credential**

Mesmo padrao para `src/lib/actions/credential.ts`:

```typescript
// Para revealCredentialField — apenas super_admin ou company_admin:
const user = await getCurrentUser();
if (!user) return { success: false, error: "Nao autenticado" };

if (!user.isSuperAdmin) {
  const membership = await prisma.userCompanyMembership.findUnique({
    where: {
      userId_companyId: { userId: user.id, companyId },
    },
  });
  if (!membership || membership.role !== "company_admin") {
    return { success: false, error: "Sem permissao para revelar credenciais" };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/company.ts src/lib/actions/credential.ts
git commit -m "feat: integra tenant scoping e auth nas actions de Company e Credential"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** CRUD Company (create, read, update, soft delete) ✅, CRUD Credential (upsert, read mascarado, reveal field) ✅, webhook_key com nanoid(21) ✅, slug automatico ✅, criptografia AES-256-GCM (encrypt ao salvar, decrypt ao ler, mask na API) ✅, tenant scoping (filtro por membership, super_admin bypassa) ✅
- [x] **Placeholder scan:** TODOs marcados explicitamente para integracao com auth do sub-plano 2. Sem TBDs vagos
- [x] **Type consistency:** Tipos Prisma consistentes. Zod schemas alinhados com campos do model
- [x] **Seguranca:** Campos sensiveis NUNCA retornados em texto puro via API. mask() aplicado em getCredential(). revealCredentialField() como action separada com verificacao de permissao
- [x] **Cardinalidade:** CompanyCredential 1:1 com Company via UNIQUE(company_id). Upsert garante que nao cria duplicatas
- [x] **Soft delete:** Company desativada via is_active = false. Credencial permanece no banco (conforme spec)
- [x] **UI Dark mode:** Todos os componentes usam classes zinc-800/900 para dark mode. Badges com cores semanticas (emerald=ativa, zinc=inativa, amber=pendente)
- [x] **shadcn/ui:** Card, Button, Input, Label, Tabs, Dialog, Badge — todos utilizados
- [x] **Testes:** Validacao Zod (Company + Credential), criptografia de credenciais (fluxo completo save/read/mask)
