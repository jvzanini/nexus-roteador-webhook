import { z } from "zod";
import { ALL_EVENT_IDS } from "@/lib/constants/whatsapp-events";
import { isHeaderAllowed } from "@/lib/constants/header-whitelist";

// --- Custom Header Schema ---

export const customHeaderSchema = z.object({
  key: z
    .string()
    .min(1, "Chave do header eh obrigatoria")
    .max(100, "Chave do header deve ter no maximo 100 caracteres")
    .regex(
      /^[a-zA-Z0-9\-_]+$/,
      "Chave do header so pode conter letras, numeros, hifens e underscores"
    ),
  value: z
    .string()
    .min(1, "Valor do header eh obrigatorio")
    .max(2000, "Valor do header deve ter no maximo 2000 caracteres"),
});

// --- Evento Schema ---

const eventSchema = z
  .string()
  .refine((val) => ALL_EVENT_IDS.includes(val), {
    message: "Evento invalido",
  });

// --- URL Schema ---

const httpsUrlSchema = z
  .string()
  .url("URL invalida")
  .refine((url) => url.startsWith("https://"), {
    message: "A URL deve usar HTTPS",
  })
  .refine((url) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname !== "localhost" && !parsed.hostname.startsWith("127.");
    } catch {
      return false;
    }
  }, {
    message: "URL nao pode apontar para localhost",
  });

// --- Create Schema ---

export const createWebhookRouteSchema = z.object({
  name: z
    .string()
    .min(1, "Nome eh obrigatorio")
    .max(100, "Nome deve ter no maximo 100 caracteres")
    .trim(),
  icon: z
    .string()
    .min(1, "Icone eh obrigatorio")
    .max(50, "Nome do icone deve ter no maximo 50 caracteres"),
  url: httpsUrlSchema,
  secretKey: z
    .string()
    .max(500, "Secret key deve ter no maximo 500 caracteres")
    .optional()
    .nullable(),
  events: z
    .array(eventSchema)
    .min(1, "Selecione pelo menos 1 evento")
    .transform((events) => [...new Set(events)]),
  headers: z
    .array(customHeaderSchema)
    .max(20, "No maximo 20 headers customizados")
    .optional()
    .nullable()
    .superRefine((headers, ctx) => {
      if (!headers) return;
      for (let i = 0; i < headers.length; i++) {
        if (!isHeaderAllowed(headers[i].key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Header "${headers[i].key}" eh bloqueado pelo sistema`,
            path: [i, "key"],
          });
        }
      }
    }),
  timeoutMs: z
    .number()
    .int("Timeout deve ser um numero inteiro")
    .min(1000, "Timeout minimo eh 1000ms (1 segundo)")
    .max(60000, "Timeout maximo eh 60000ms (60 segundos)")
    .default(30000),
});

export type CreateWebhookRouteInput = z.infer<typeof createWebhookRouteSchema>;

// --- Update Schema (partial, mesmas validacoes) ---

export const updateWebhookRouteSchema = z.object({
  name: z
    .string()
    .min(1, "Nome eh obrigatorio")
    .max(100, "Nome deve ter no maximo 100 caracteres")
    .trim()
    .optional(),
  icon: z
    .string()
    .min(1, "Icone eh obrigatorio")
    .max(50, "Nome do icone deve ter no maximo 50 caracteres")
    .optional(),
  url: httpsUrlSchema.optional(),
  secretKey: z
    .string()
    .max(500, "Secret key deve ter no maximo 500 caracteres")
    .optional()
    .nullable(),
  events: z
    .array(eventSchema)
    .min(1, "Selecione pelo menos 1 evento")
    .transform((events) => [...new Set(events)])
    .optional(),
  headers: z
    .array(customHeaderSchema)
    .max(20, "No maximo 20 headers customizados")
    .optional()
    .nullable()
    .superRefine((headers, ctx) => {
      if (!headers) return;
      for (let i = 0; i < headers.length; i++) {
        if (!isHeaderAllowed(headers[i].key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Header "${headers[i].key}" eh bloqueado pelo sistema`,
            path: [i, "key"],
          });
        }
      }
    }),
  timeoutMs: z
    .number()
    .int("Timeout deve ser um numero inteiro")
    .min(1000, "Timeout minimo eh 1000ms (1 segundo)")
    .max(60000, "Timeout maximo eh 60000ms (60 segundos)")
    .optional(),
});

export type UpdateWebhookRouteInput = z.infer<typeof updateWebhookRouteSchema>;
