import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';

/**
 * Global module providing configurations across the application.
 */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
