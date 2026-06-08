import { Global, Module } from '@nestjs/common';

import { BEDROCK_MODEL, bedrockModelProvider } from './bedrock.provider';

@Global()
@Module({
  providers: [bedrockModelProvider],
  exports: [BEDROCK_MODEL],
})
export class LlmModule {}
