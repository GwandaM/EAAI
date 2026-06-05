import type { ValidatedEnv } from './env.validation';

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
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
    baseUrl: string;
    token?: string;
  };
  database: {
    url?: string;
  };
}

export const BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

export function buildAppConfig(env: ValidatedEnv): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    aws: {
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      sessionToken: env.AWS_SESSION_TOKEN,
    },
    bedrock: {
      modelId: BEDROCK_MODEL_ID,
      knowledgeBaseId: env.BEDROCK_KNOWLEDGE_BASE_ID,
    },
    companyApi: {
      baseUrl: env.COMPANY_API_BASE_URL,
      token: env.COMPANY_API_TOKEN,
    },
    database: {
      url: env.DATABASE_URL,
    },
  };
}
