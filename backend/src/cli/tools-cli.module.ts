import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { buildAppConfig } from '../config/configuration';
import { validateEnv } from '../config/env.validation';
import { oraclePoolProvider } from '../tools/oracle/oracle.provider';
import { OracleService } from '../tools/oracle/oracle.service';
import { ToolsModule } from '../tools/tools.module';

/**
 * Boots only what the tool harness needs: validated config plus the tool
 * services. No HTTP server, no Bedrock LLM provider, no persistence — so the
 * CLI starts fast and works without model access. Oracle is provided here for
 * dev-only querying; it is intentionally absent from the agent's registry.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [() => buildAppConfig(validateEnv(process.env))],
    }),
    ToolsModule,
  ],
  providers: [oraclePoolProvider, OracleService],
})
export class ToolsCliModule {}
