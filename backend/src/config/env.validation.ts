import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3005),

  AWS_REGION: z.string().min(1, 'AWS_REGION is required (e.g. us-east-1).'),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_SESSION_TOKEN: z.string().min(1).optional(),

  BEDROCK_KNOWLEDGE_BASE_ID: z
    .string()
    .min(1, 'BEDROCK_KNOWLEDGE_BASE_ID is required.'),

  // Override the Bedrock model id. Required as a cross-region *inference profile*
  // id in many regions (e.g. eu.anthropic.… in eu-*, us.anthropic.… in us-*),
  // where the bare model id is rejected as "invalid model identifier".
  BEDROCK_MODEL_ID: z.string().min(1).optional(),

  // Policy and Party services live behind different base URLs but share the
  // same bearer token (BEARER_TOKEN, with COMPANY_API_TOKEN as a legacy alias).
  POLICY_SERVICE_BASE_URL: z
    .string()
    .url('POLICY_SERVICE_BASE_URL must be a valid URL.'),
  PARTY_SERVICE_BASE_URL: z
    .string()
    .url('PARTY_SERVICE_BASE_URL must be a valid URL.'),
  BEARER_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  COMPANY_API_TOKEN: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),

  // Treat an empty string the same as unset (history disabled), so
  // `DATABASE_URL=` doesn't fail validation or trigger a doomed connection.
  DATABASE_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),

  // --- Oracle (optional; internal-only database access) ---
  // node-oracledb runs in thin mode (no Instant Client). ORACLE_CONNECT_STRING is
  // a TNS alias from tnsnames.ora, an Easy Connect string (host:port/service), or
  // a full connect descriptor. ORACLE_TNS_ADMIN points at the directory holding
  // tnsnames.ora when connecting by alias. All-or-none: user/password/connectString
  // must be set together (enforced below).
  ORACLE_USER: z.string().min(1).optional(),
  ORACLE_PASSWORD: z.string().min(1).optional(),
  ORACLE_CONNECT_STRING: z.string().min(1).optional(),
  ORACLE_TNS_ADMIN: z.string().min(1).optional(),
  // Schema names can't be bound, so they are concatenated into ALTER SESSION;
  // restrict to a valid unquoted identifier to keep that injection-safe.
  ORACLE_SCHEMA: z
    .string()
    .regex(
      /^[A-Za-z][A-Za-z0-9_$#]*$/,
      'ORACLE_SCHEMA must be a valid Oracle identifier (letters, digits, _ $ #; starting with a letter).',
    )
    .optional(),

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

    // Oracle is all-or-none: a half-set of credentials can never connect, so fail
    // fast at boot rather than warning at the first query. (TNS_ADMIN and SCHEMA
    // are optional refinements on top of a valid connection.)
    const oracleCore = [
      ['ORACLE_USER', env.ORACLE_USER],
      ['ORACLE_PASSWORD', env.ORACLE_PASSWORD],
      ['ORACLE_CONNECT_STRING', env.ORACLE_CONNECT_STRING],
    ] as const;
    const setCount = oracleCore.filter(([, value]) => value).length;
    if (setCount > 0 && setCount < oracleCore.length) {
      for (const [name, value] of oracleCore) {
        if (!value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message:
              'ORACLE_USER, ORACLE_PASSWORD and ORACLE_CONNECT_STRING must all be set together (or all unset).',
          });
        }
      }
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
