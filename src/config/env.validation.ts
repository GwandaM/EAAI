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

  // Override the Bedrock model id. Required as a cross-region *inference profile*
  // id in many regions (e.g. eu.anthropic.… in eu-*, us.anthropic.… in us-*),
  // where the bare model id is rejected as "invalid model identifier".
  BEDROCK_MODEL_ID: z.string().min(1).optional(),

  COMPANY_API_BASE_URL: z
    .string()
    .url('COMPANY_API_BASE_URL must be a valid URL.')
    .default('https://api.company.com'),
  COMPANY_API_TOKEN: z.string().min(1).optional(),

  DATABASE_URL: z.string().min(1).optional(),

  // Comma-separated list of allowed CORS origins. If unset, cross-origin requests
  // are reflected only in development; in production they are denied unless listed.
  CORS_ORIGINS: z.string().min(1).optional(),

  // --- Auth (bearer JWT verified against a remote JWKS) ---
  // Note: a plain z.coerce.boolean() would turn the string "false" into `true`
  // (Boolean("false") === true), so we parse an explicit enum instead.
  AUTH_DISABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  AUTH_JWKS_URI: z.string().url('AUTH_JWKS_URI must be a valid URL.').optional(),
  AUTH_ISSUER: z.string().min(1).optional(),
  AUTH_AUDIENCE: z.string().min(1).optional(),
})
  .superRefine((env, ctx) => {
    // When auth is enabled, a JWKS endpoint is mandatory — fail fast at boot
    // rather than letting every request 401 with a confusing message.
    if (!env.AUTH_DISABLED && !env.AUTH_JWKS_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_JWKS_URI'],
        message:
          'AUTH_JWKS_URI is required unless AUTH_DISABLED=true (it is needed to verify bearer tokens).',
      });
    }
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
