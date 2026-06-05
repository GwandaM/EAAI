import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentModule } from './agent/agent.module';
import { buildAppConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { LlmModule } from './llm/llm.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [() => buildAppConfig(validateEnv(process.env))],
    }),
    LlmModule,
    ToolsModule,
    AgentModule,
  ],
})
export class AppModule {}
