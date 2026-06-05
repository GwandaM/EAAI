import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { ConfigService } from '@nestjs/config';
import type { Provider } from '@nestjs/common';
import type { LanguageModel } from 'ai';

import type { AppConfig } from '../config/configuration';

export const BEDROCK_MODEL = Symbol('BEDROCK_MODEL');

export const bedrockModelProvider: Provider = {
  provide: BEDROCK_MODEL,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): LanguageModel => {
    const region = config.get('aws', { infer: true }).region;
    const modelId = config.get('bedrock', { infer: true }).modelId;

    const bedrock = createAmazonBedrock({
      region,
      credentialProvider: fromNodeProviderChain(),
    });

    return bedrock(modelId);
  },
};
