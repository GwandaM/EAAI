import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  AWS_REGION: z.string().min(1, 'AWS_REGION is required (e.g. us-east-1).'),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_SESSION_TOKEN: z.string().min(1).optional(),

  BEDROCK_KNOWLEDGE_BASE_ID: z
    .string()
    .min(1)
    .default('KB_PLACEHOLDER_ID'),

  COMPANY_API_BASE_URL: z
    .string()
    .url('COMPANY_API_BASE_URL must be a valid URL.')
    .default('https://api.company.com'),
  COMPANY_API_TOKEN: z.string().min(1).optional(),

  DATABASE_URL: z.string().min(1).optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): ValidatedEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.errors
      .map((e) => `  - ${e.path.join('.') || '<root>'}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${message}`);
  }
  return result.data;
}
