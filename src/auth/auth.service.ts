import { randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { EditionStaffRoleType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '../common/config/config.service';
import { LoginDto } from './dto/login.dto';
import { IHashService } from './interfaces/hash-service.interface';
import { ITokenService } from './interfaces/token-service.interface';
import {
  ActiveEditionRoleResponse,
  AuthUserResponse,
  FrontendRole,
  IssuedAuthSession,
  MeResponse,
} from './interfaces/auth-response.interface';
import { RefreshSessionsService } from './services/refresh-sessions.service';

export interface JwtPayload {
  sub: string;
  email: string;
  isSuperAdmin: boolean;
  jti: string;
}

const ACTIVE_AUTH_STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  isSuperAdmin: true,
  editionRoles: {
    where: {
      revokedAt: null,
      edition: { isActive: true },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      editionId: true,
      role: true,
      edition: {
        select: { name: true },
      },
      editionDiscipline: {
        select: {
          id: true,
          disciplineId: true,
          discipline: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StaffSelect;

type StaffWithActiveRoles = Prisma.StaffGetPayload<{
  select: typeof ACTIVE_AUTH_STAFF_SELECT;
}>;

interface AuthIdentity {
  user: AuthUserResponse;
  isSuperAdmin: boolean;
  activeEditionId: string | null;
}

interface PendingAuthSession extends IssuedAuthSession {
  refreshExpiresAt: Date;
  editionId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly refreshSessionsService: RefreshSessionsService,
    @Inject(IHashService) private readonly hashService: IHashService,
    @Inject(ITokenService) private readonly tokenService: ITokenService,
  ) {}

  async login(loginDto: LoginDto): Promise<IssuedAuthSession> {
    const staff = await this.prisma.staff.findUnique({
      where: { email: loginDto.email.trim().toLowerCase() },
      select: ACTIVE_AUTH_STAFF_SELECT,
    });

    if (!staff) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const isPasswordValid = await this.hashService.compare(loginDto.password, staff.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const identity = this.resolveIdentity(staff);
    const session = this.issueSession(identity);

    await this.refreshSessionsService.create({
      token: session.refreshToken,
      staffId: identity.user.id,
      editionId: session.editionId,
      expiresAt: session.refreshExpiresAt,
    });

    return {
      auth: session.auth,
      refreshToken: session.refreshToken,
    };
  }

  async refresh(token: string): Promise<IssuedAuthSession> {
    const decoded = this.verifyRefreshToken(token);
    const staff = await this.findStaffWithActiveRoles(decoded.sub);

    if (!staff) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    const identity = this.resolveIdentity(staff);
    const session = this.issueSession(identity);

    await this.refreshSessionsService.rotate(token, {
      token: session.refreshToken,
      staffId: identity.user.id,
      editionId: session.editionId,
      expiresAt: session.refreshExpiresAt,
    });

    return {
      auth: session.auth,
      refreshToken: session.refreshToken,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    await this.refreshSessionsService.revoke(refreshToken);
  }

  async getMe(staffId: string): Promise<MeResponse> {
    const staff = await this.findStaffWithActiveRoles(staffId);

    if (!staff) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    return this.resolveIdentity(staff).user;
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.validatePayload(
        this.tokenService.verify<JwtPayload>(token, { tokenType: 'access' }),
      );
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }
  }

  private async findStaffWithActiveRoles(staffId: string): Promise<StaffWithActiveRoles | null> {
    return this.prisma.staff.findUnique({
      where: { id: staffId },
      select: ACTIVE_AUTH_STAFF_SELECT,
    });
  }

  private resolveIdentity(staff: StaffWithActiveRoles): AuthIdentity {
    const editionRoles = this.mapEditionRoles(staff);

    if (staff.isSuperAdmin) {
      return {
        user: this.mapUser(staff, 'SUPER_ADMIN', editionRoles),
        isSuperAdmin: true,
        activeEditionId: null,
      };
    }

    const editionAdminRole = staff.editionRoles.find(
      (role) => role.role === EditionStaffRoleType.EDITION_ADMIN,
    );
    if (editionAdminRole) {
      return {
        user: this.mapUser(staff, 'EDITION_ADMIN', editionRoles),
        isSuperAdmin: false,
        activeEditionId: editionAdminRole.editionId,
      };
    }

    const disciplineManagerRoles = staff.editionRoles.filter(
      (role) =>
        role.role === EditionStaffRoleType.DISCIPLINE_MANAGER &&
        role.editionDiscipline?.discipline.name,
    );
    if (disciplineManagerRoles.length) {
      const singleRole = disciplineManagerRoles.length === 1 ? disciplineManagerRoles[0] : null;
      const activeEditionIds = new Set(disciplineManagerRoles.map((role) => role.editionId));
      return {
        user: this.mapUser(
          staff,
          'DISCIPLINE_MANAGER',
          editionRoles,
          singleRole?.editionDiscipline?.discipline.name,
        ),
        isSuperAdmin: false,
        activeEditionId: activeEditionIds.size === 1 ? disciplineManagerRoles[0].editionId : null,
      };
    }

    throw new UnauthorizedException('Usuário sem papel ativo na edição atual.');
  }

  private mapUser(
    staff: Pick<StaffWithActiveRoles, 'id' | 'email' | 'name'>,
    role: FrontendRole,
    editionRoles: ActiveEditionRoleResponse[],
    scope?: string,
  ): AuthUserResponse {
    return {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role,
      editionRoles,
      ...(scope ? { scope } : {}),
    };
  }

  private mapEditionRoles(staff: StaffWithActiveRoles): ActiveEditionRoleResponse[] {
    return staff.editionRoles.map((role) => ({
      roleAssignmentId: role.id,
      editionId: role.editionId,
      editionName: role.edition.name,
      editionDisciplineId: role.editionDiscipline?.id ?? null,
      disciplineId: role.editionDiscipline?.disciplineId ?? null,
      disciplineName: role.editionDiscipline?.discipline.name ?? null,
      role: role.role,
    }));
  }

  private issueSession(identity: AuthIdentity): PendingAuthSession {
    const issuedAt = Date.now();
    const accessExpiresAt = new Date(issuedAt + this.configService.jwtAccessTtlSeconds * 1000);
    const refreshExpiresAt = new Date(issuedAt + this.configService.jwtRefreshTtlSeconds * 1000);
    const commonPayload = {
      sub: identity.user.id,
      email: identity.user.email,
      isSuperAdmin: identity.isSuperAdmin,
    };
    const accessToken = this.tokenService.sign(
      { ...commonPayload, jti: randomUUID() },
      {
        expiresIn: this.configService.jwtAccessTtlSeconds,
        tokenType: 'access',
      },
    );
    const refreshToken = this.tokenService.sign(
      { ...commonPayload, jti: randomUUID() },
      {
        expiresIn: this.configService.jwtRefreshTtlSeconds,
        tokenType: 'refresh',
      },
    );

    return {
      auth: {
        token: accessToken,
        expiresAt: accessExpiresAt.toISOString(),
        user: identity.user,
      },
      refreshToken,
      refreshExpiresAt,
      editionId: identity.activeEditionId,
    };
  }

  private verifyRefreshToken(token: string): JwtPayload {
    try {
      return this.validatePayload(
        this.tokenService.verify<JwtPayload>(token, { tokenType: 'refresh' }),
      );
    } catch {
      throw new UnauthorizedException('Token de atualização inválido ou expirado.');
    }
  }

  private validatePayload(payload: JwtPayload): JwtPayload {
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.isSuperAdmin !== 'boolean' ||
      typeof payload.jti !== 'string'
    ) {
      throw new Error('Payload de autenticação inválido.');
    }

    return payload;
  }
}
