import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { BcryptHashService } from './services/bcrypt-hash.service';
import { JwtTokenService } from './services/jwt-token.service';
import { IHashService } from './interfaces/hash-service.interface';
import { ITokenService } from './interfaces/token-service.interface';
import { AuthCookieService } from './services/auth-cookie.service';
import { RefreshSessionsService } from './services/refresh-sessions.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookieService,
    RefreshSessionsService,
    JwtAuthGuard,
    {
      provide: IHashService,
      useClass: BcryptHashService,
    },
    {
      provide: ITokenService,
      useClass: JwtTokenService,
    },
  ],
  exports: [AuthService, JwtAuthGuard, IHashService, ITokenService],
})
export class AuthModule {}
