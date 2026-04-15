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
    .min(1, "Phone Number ID e obrigatorio")
    .max(50, "Phone Number ID deve ter no maximo 50 caracteres")
    .trim(),
  wabaId: z
    .string()
    .min(1, "WABA ID e obrigatorio")
    .max(50, "WABA ID deve ter no maximo 50 caracteres")
    .trim(),
  metaSystemUserToken: z
    .string()
    .min(1, "System User Token invalido")
    .max(500, "System User Token invalido")
    .optional()
    .nullable(),
});

export type UpsertCredentialInput = z.infer<typeof upsertCredentialSchema>;
