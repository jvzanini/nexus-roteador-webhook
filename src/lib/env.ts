import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  REDIS_URL: z.string().min(1, 'REDIS_URL é obrigatória'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET deve ter no mínimo 32 caracteres'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL deve ser uma URL válida'),
  ENCRYPTION_KEY: z.string().min(64, 'ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes)'),
  META_GRAPH_API_URL: z.string().url().optional(),
  META_API_VERSION: z.string().optional(),
  META_SUBSCRIPTION_FIELDS: z.string().optional(),
  META_DRIFT_CHECK_CRON: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      'Variáveis de ambiente inválidas:',
      result.error.flatten().fieldErrors
    );
    throw new Error('Variáveis de ambiente inválidas. Verifique o .env');
  }

  return result.data;
}

export const env = validateEnv();
