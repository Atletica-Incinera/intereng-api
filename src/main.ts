import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './common/config/env';
import { trustedProxyHops } from './common/guards/client-ip';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Sem isto o Express trata o IP do proxy como o do cliente: `request.ip` no
  // log aponta sempre para o gateway, e `secure` do cookie passa a depender de
  // uma conexão que, do ponto de vista do Node, é HTTP. A contagem por origem
  // do throttler e do teto de SSE não depende daqui — ela lê o cabeçalho
  // direto, em `resolveClientIp` —, mas o resto do app depende.
  app.getHttpAdapter().getInstance().set('trust proxy', trustedProxyHops());
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
