import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfig } from './config/configuration';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const corsOrigins = config.get('corsOrigins', { infer: true });
  const isProduction = config.get('nodeEnv', { infer: true }) === 'production';

  // Only reflect arbitrary origins (with credentials) outside production. In
  // production, require an explicit allowlist so we never echo back an attacker
  // origin on a credentialed request.
  const origin =
    corsOrigins.length > 0 ? corsOrigins : isProduction ? false : true;

  if (isProduction && corsOrigins.length === 0) {
    logger.warn(
      'CORS_ORIGINS is not set in production — cross-origin requests will be denied.',
    );
  }

  app.enableCors({
    origin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      // NOTE: do not enable implicit conversion — it coerces the chat DTO's
      // arbitrary `parts` objects into `[]`, corrupting model input and history.
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableShutdownHooks();

  const port = config.get('port', { infer: true });

  await app.listen(port);
  logger.log(`Enterprise AI Agent backend listening on http://localhost:${port}`);
  logger.log('POST /agent/chat — streams UI Message events for Vercel AI SDK useChat().');
}

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection]', reason);
});

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', error);
  process.exit(1);
});
