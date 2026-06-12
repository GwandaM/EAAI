import type { ValidatedEnv } from './env.validation';

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  corsOrigins: string[];
  aws: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
  bedrock: {
    modelId: string;
    knowledgeBaseId: string;
  };
  companyApi: {
    policyBaseUrl: string;
    partyBaseUrl: string;
    token?: string;
  };
  database: {
    url?: string;
  };
  oracle: {
    user?: string;
    password?: string;
    connectString?: string;
    tnsAdmin?: string;
    schema?: string;
  };
  auth: {
    disabled: boolean;
    jwksUri?: string;
    issuer?: string;
    audience?: string;
  };
}

export const BEDROCK_MODEL_ID = 'eu.anthropic.claude-3-5-sonnet-20241022-v2:0';

export function buildAppConfig(env: ValidatedEnv): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    corsOrigins: env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0)
      : [],
    aws: {
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      sessionToken: env.AWS_SESSION_TOKEN,
    },
    bedrock: {
      modelId: env.BEDROCK_MODEL_ID ?? BEDROCK_MODEL_ID,
      knowledgeBaseId: env.BEDROCK_KNOWLEDGE_BASE_ID,
    },
    companyApi: {
      policyBaseUrl: env.POLICY_SERVICE_BASE_URL,
      partyBaseUrl: env.PARTY_SERVICE_BASE_URL,
      token: env.BEARER_TOKEN ?? env.COMPANY_API_TOKEN,
    },
    database: {
      url: env.DATABASE_URL,
    },
    oracle: {
      user: env.ORACLE_USER,
      password: env.ORACLE_PASSWORD,
      connectString: env.ORACLE_CONNECT_STRING,
      tnsAdmin: env.ORACLE_TNS_ADMIN,
      schema: env.ORACLE_SCHEMA,
    },
    auth: {
      disabled: env.AUTH_DISABLED,
      jwksUri: env.AUTH_JWKS_URI,
      issuer: env.AUTH_ISSUER,
      audience: env.AUTH_AUDIENCE,
    },
  };
}
