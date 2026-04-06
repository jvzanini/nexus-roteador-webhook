import { z } from "zod";

const webhookKeySchema = z
  .string()
  .min(4, "Webhook key deve ter no minimo 4 caracteres")
  .max(50, "Webhook key deve ter no maximo 50 caracteres")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Webhook key deve conter apenas letras, numeros, hifens e underscores"
  );

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
  webhookKey: webhookKeySchema.optional(),
});

export const updateCompanySchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter no minimo 2 caracteres")
    .max(100, "Nome deve ter no maximo 100 caracteres")
    .trim()
    .optional(),
  slug: z
    .string()
    .min(2, "Slug deve ter no mínimo 2 caracteres")
    .max(50, "Slug deve ter no máximo 50 caracteres")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug deve conter apenas letras minúsculas, números e hífens"
    )
    .optional(),
  logoUrl: z
    .string()
    .url("URL do logo invalida")
    .optional()
    .or(z.literal("")),
  isActive: z.boolean().optional(),
  webhookKey: webhookKeySchema.optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
