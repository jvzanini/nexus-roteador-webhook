# Modulo: Encryption

## Resumo

Criptografia simetrica AES-256-GCM para dados sensiveis armazenados no banco de dados (tokens de acesso, segredos de aplicativo, etc.).
Cada valor criptografado recebe um IV aleatorio e um authentication tag, garantindo confidencialidade e integridade.
Inclui funcao utilitaria `mask()` para exibir valores parcialmente ocultos na interface sem precisar descriptografar.

## Dependencias

Nenhuma externa. Usa exclusivamente o modulo `crypto` nativo do Node.js (`createCipheriv`, `createDecipheriv`, `randomBytes`).

## Pacotes npm

Nenhum. Todas as funcoes criptograficas vem do Node.js built-in.

## Schema Prisma

Nenhum. O modulo nao cria tabelas proprias. Os valores criptografados sao armazenados como `String` nos campos dos models existentes (ex: `accessToken`, `metaAppSecret` em `CompanyCredential`).

## Variaveis de ambiente

| Variavel | Tipo | Obrigatoria | Descricao |
|----------|------|-------------|-----------|
| `ENCRYPTION_KEY` | String (64 caracteres hexadecimais) | Sim | Chave AES-256 de 32 bytes representada em hexadecimal. Deve ter exatamente 64 caracteres hex (0-9, a-f). |

**Gerando uma chave:**

```bash
openssl rand -hex 32
```

O comando acima gera 32 bytes aleatorios e imprime como 64 caracteres hexadecimais, pronto para usar como `ENCRYPTION_KEY`.

## Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/encryption.ts` | Funcoes `encrypt()`, `decrypt()` e `mask()`. Constantes do algoritmo e funcao interna `getKey()` |

## Funcoes

### `getKey(): Buffer` (interna, nao exportada)

**Arquivo:** `src/lib/encryption.ts`

Carrega e valida a chave de criptografia a partir da variavel de ambiente `ENCRYPTION_KEY`.

**Comportamento:**

1. Le `process.env.ENCRYPTION_KEY`
2. Valida que o valor existe e tem exatamente 64 caracteres
3. Converte o hex para `Buffer` de 32 bytes
4. Lanca `Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)")` se a validacao falhar

**Implementacao completa:**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}
```

---

### `encrypt(plaintext: string): string`

**Arquivo:** `src/lib/encryption.ts`

Criptografa um valor em texto plano usando AES-256-GCM com IV aleatorio.

**Parametros:**

| Parametro | Tipo | Descricao |
|-----------|------|-----------|
| `plaintext` | `string` | Texto a ser criptografado (ex: token de acesso, segredo de app) |

**Retorno:** `string` no formato `${ivHex}:${authTagHex}:${encryptedHex}`

**Comportamento:**

1. Obtem a chave via `getKey()`
2. Gera um IV aleatorio de 16 bytes usando `randomBytes()`
3. Cria um cipher AES-256-GCM com a chave, IV e auth tag de 16 bytes
4. Criptografa o plaintext (entrada UTF-8, saida hex)
5. Extrai o authentication tag gerado pelo GCM
6. Retorna os tres componentes concatenados com `:` como separador

**Implementacao completa:**

```typescript
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}
```

---

### `decrypt(ciphertext: string): string`

**Arquivo:** `src/lib/encryption.ts`

Descriptografa um valor previamente criptografado por `encrypt()`.

**Parametros:**

| Parametro | Tipo | Descricao |
|-----------|------|-----------|
| `ciphertext` | `string` | String no formato `${ivHex}:${authTagHex}:${encryptedHex}` |

**Retorno:** `string` com o texto plano original.

**Erros:**

- Lanca `Error("Invalid ciphertext format")` se o formato nao contiver os tres segmentos separados por `:`
- Lanca erro nativo do Node.js se o authentication tag nao corresponder (dados adulterados)
- Lanca erro nativo do Node.js se a chave for diferente da usada na criptografia

**Comportamento:**

1. Obtem a chave via `getKey()`
2. Separa o ciphertext em tres partes pelo separador `:`
3. Valida que as tres partes existem (ivHex, authTagHex, encrypted)
4. Converte IV e auth tag de hex para `Buffer`
5. Cria um decipher AES-256-GCM com a chave e IV
6. Define o auth tag no decipher para verificacao de integridade
7. Descriptografa o conteudo (entrada hex, saida UTF-8)
8. Retorna o texto plano

**Implementacao completa:**

```typescript
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivHex, authTagHex, encrypted] = ciphertext.split(":");

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
```

---

### `mask(value: string, visibleChars?: number): string`

**Arquivo:** `src/lib/encryption.ts`

Mascara um valor sensivel para exibicao na interface, mostrando apenas os ultimos caracteres.

**Parametros:**

| Parametro | Tipo | Padrao | Descricao |
|-----------|------|--------|-----------|
| `value` | `string` | — | Valor a ser mascarado (texto plano, ja descriptografado) |
| `visibleChars` | `number` | `5` | Quantidade de caracteres visiveis no final |

**Retorno:** `string` no formato `••••••••XXXXX` onde `XXXXX` sao os ultimos caracteres visiveis.

**Comportamento:**

1. Se o valor for vazio ou menor/igual a `visibleChars`, retorna `"••••••••"` (mascara completa)
2. Caso contrario, retorna `"••••••••"` seguido dos ultimos `visibleChars` caracteres do valor

**Implementacao completa:**

```typescript
export function mask(value: string, visibleChars: number = 5): string {
  if (!value || value.length <= visibleChars) return "••••••••";
  return "••••••••" + value.slice(-visibleChars);
}
```

## Formato de armazenamento

O valor criptografado e armazenado como uma unica string com tres segmentos hexadecimais separados por `:`:

```
${ivHex}:${authTagHex}:${encryptedHex}
```

| Segmento | Tamanho (hex chars) | Descricao |
|----------|---------------------|-----------|
| `ivHex` | 32 | Initialization Vector aleatorio (16 bytes) |
| `authTagHex` | 32 | Authentication Tag do GCM (16 bytes) |
| `encryptedHex` | Variavel | Dados criptografados (depende do tamanho do plaintext) |

**Exemplo real:**

```
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6:f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6:9a8b7c6d5e4f
```

Esse formato permite armazenar tudo em um unico campo `String` no banco de dados, sem necessidade de colunas separadas para IV ou auth tag.

## Integracao (o que muda em arquivos existentes)

| Arquivo | Mudanca |
|---------|---------|
| `src/lib/actions/credential.ts` | Importar `encrypt` e `decrypt`. Chamar `encrypt()` antes de salvar `accessToken` e `metaAppSecret` no banco. Chamar `decrypt()` ao ler esses campos para uso em chamadas a Meta API. Chamar `mask()` ao retornar valores para exibicao na interface. |
| `src/lib/actions/webhook-routes.ts` | Se houver segredos nas rotas, criptografar antes de salvar e descriptografar ao usar. |
| `.env.production` | Adicionar `ENCRYPTION_KEY` com 64 caracteres hex gerados via `openssl rand -hex 32`. |
| `docker-compose.yml` | Garantir que `ENCRYPTION_KEY` esta mapeado como variavel de ambiente no container da aplicacao. |

**Exemplo de uso em uma Server Action:**

```typescript
import { encrypt, decrypt, mask } from "@/lib/encryption";

// Ao salvar credencial
const encryptedToken = encrypt(accessToken);
await prisma.companyCredential.create({
  data: {
    accessToken: encryptedToken,
    // ...
  },
});

// Ao usar a credencial (chamada a Meta API)
const credential = await prisma.companyCredential.findUnique({ where: { id } });
const plainToken = decrypt(credential.accessToken);

// Ao exibir na interface
const maskedToken = mask(plainToken);
// Resultado: "••••••••a1b2c"
```

## Referencia no Nexus

| Recurso | Caminho |
|---------|---------|
| Modulo de criptografia | `src/lib/encryption.ts` |
| Uso em credenciais | `src/lib/actions/credential.ts` |
| Variavel de ambiente | `ENCRYPTION_KEY` em `.env.production` |

## Customizacoes por plataforma

| Aspecto | Padrao no Nexus | O que personalizar |
|---------|----------------|--------------------|
| Caracteres visiveis na mascara | 5 (ultimos 5 chars) | Ajustar o parametro `visibleChars` na chamada de `mask()` conforme o tipo de dado (ex: 4 para cartao de credito, 8 para tokens longos) |
| Formato da mascara | `••••••••` + ultimos chars | Alterar o prefixo de mascaramento (ex: `****` ou `[OCULTO]`) conforme a identidade visual da plataforma |
| Algoritmo | AES-256-GCM | Manter GCM para garantir autenticacao. Alternativas como AES-256-CBC nao fornecem verificacao de integridade nativa |
| Tamanho do IV | 16 bytes (128 bits) | 12 bytes e mais comum para GCM e recomendado pelo NIST, mas 16 bytes funciona corretamente com a implementacao do Node.js |
| Campos criptografados | `accessToken`, `metaAppSecret` | Criptografar qualquer campo sensivel armazenado no banco (chaves de API, webhookSecret, tokens OAuth, etc.) |
| Rotacao de chave | Nao implementada | Para rotacao, descriptografar todos os valores com a chave antiga e re-criptografar com a nova. Implementar como job agendado se necessario |

## Seguranca

- **AES-256-GCM:** algoritmo de criptografia autenticada que fornece confidencialidade e integridade dos dados. Qualquer alteracao no ciphertext, IV ou auth tag causa falha na descriptografia, detectando adulteracao
- **IV aleatorio:** cada chamada a `encrypt()` gera um Initialization Vector novo via `randomBytes()`, garantindo que o mesmo plaintext produz ciphertexts diferentes a cada vez (previne ataques de analise de frequencia)
- **Authentication Tag:** o GCM gera um tag de 16 bytes que valida a integridade do ciphertext durante a descriptografia. Se os dados foram alterados no banco, `decrypt()` lanca erro
- **Chave via variavel de ambiente:** a `ENCRYPTION_KEY` nunca e commitada no repositorio. Fica exclusivamente em `.env.production` (local na maquina de deploy) e e injetada como variavel de ambiente no container
- **Constant-time nao necessario:** a verificacao do authentication tag e feita internamente pelo modulo `crypto` do Node.js (implementacao nativa em C/OpenSSL), que ja utiliza comparacao em tempo constante
- **Validacao da chave:** a funcao `getKey()` valida o comprimento exato (64 hex = 32 bytes) antes de usar, prevenindo erros silenciosos com chaves invalidas
- **Separacao de responsabilidades:** `mask()` opera no texto plano ja descriptografado e nunca recebe o ciphertext, evitando vazamento acidental do formato criptografado para a interface
