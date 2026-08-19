import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './common/config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());
  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
    exposedHeaders: ['ETag', 'X-Request-Id'],
  });
  app.setGlobalPrefix('api/v1');
  await app.listen(env.port, '0.0.0.0');
}
void bootstrap();
