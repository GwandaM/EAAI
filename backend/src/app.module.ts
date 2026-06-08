import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { buildAppConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { LlmModule } from './llm/llm.module';
import { PersistenceModule } from './persistence/persistence.module';
import { HistoryModule } from './persistence/history.module';
import { ToolsModule } from './tools/tools.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [() => buildAppConfig(validateEnv(process.env))],
    }),
    AuthModule,
    PersistenceModule,
    LlmModule,
    ToolsModule,
    AgentModule,
    HistoryModule,
    HealthModule,
  ],
})
export class AppModule {}
