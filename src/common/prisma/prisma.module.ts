import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ScopeResolverService } from '../guards/scope-resolver.service';

@Global()
@Module({
  providers: [PrismaService, ScopeResolverService],
  exports: [PrismaService, ScopeResolverService],
})
export class PrismaModule {}
