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
