import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  ScopeResolverService,
  SCOPE_RESOLVER_STRATEGIES,
  ScopeResolverStrategyProvider,
} from '../guards/scope-resolver.service';

@Global()
@Module({
  providers: [
    PrismaService,
    ScopeResolverService,
    ...SCOPE_RESOLVER_STRATEGIES,
    ScopeResolverStrategyProvider,
  ],
  exports: [PrismaService, ScopeResolverService],
})
export class PrismaModule {}
