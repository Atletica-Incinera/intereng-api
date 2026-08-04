import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-change-me';

export interface JwtPayload {
  sub: string;
  email: string;
  isSuperAdmin: boolean;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper method to generate access and refresh JWT tokens.
   *
   * @param payload Payload containing user ID, email and super admin status.
   * @returns Generated access and refresh tokens.
   */
  private generateAuthTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
  }

  /**
   * Helper method to map the authentication result containing tokens and staff details.
   *
   * @param staff The staff member database record details.
   * @param tokens The access and refresh tokens.
   * @returns Formatted authentication response data.
   */
  private mapAuthResponse(
    staff: { id: string; name: string; email: string; isSuperAdmin: boolean },
    tokens: { accessToken: string; refreshToken: string },
  ) {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        isSuperAdmin: staff.isSuperAdmin,
      },
    };
  }

  /**
   * Helper method to generate session details including tokens and user details for staff.
   *
   * @param staff The staff member database record details.
   * @returns Formatted session response containing tokens and staff details.
   */
  private generateSessionForStaff(staff: {
    id: string;
    name: string;
    email: string;
    isSuperAdmin: boolean;
  }) {
    const payload: JwtPayload = {
      sub: staff.id,
      email: staff.email,
      isSuperAdmin: staff.isSuperAdmin,
    };
    const tokens = this.generateAuthTokens(payload);
    return this.mapAuthResponse(staff, tokens);
  }

  /**
   * Validates staff credentials (email & password) and issues authentication tokens.
   *
   * @param loginDto Object containing email and password credentials.
   * @returns Authentication tokens and staff profile details.
   * @throws UnauthorizedException if credentials are invalid or user doesn't exist.
   */
  async login(loginDto: LoginDto) {
    const staff = await this.prisma.staff.findUnique({
      where: { email: loginDto.email },
    });

    if (!staff) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, staff.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    return this.generateSessionForStaff(staff);
  }

  /**
   * Rotates and issues new authentication tokens using a valid refresh token.
   *
   * @param token The refresh token to be verified.
   * @returns Formatted authentication response data containing new tokens.
   * @throws UnauthorizedException if the token is invalid, expired, or the user does not exist.
   */
  async refresh(token: string) {
    try {
      const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;

      const staff = await this.prisma.staff.findUnique({
        where: { id: decoded.sub },
      });

      if (!staff) {
        throw new UnauthorizedException('Usuário não encontrado.');
      }

      return this.generateSessionForStaff(staff);
    } catch {
      throw new UnauthorizedException('Token de atualização inválido ou expirado.');
    }
  }

  /**
   * Retrieves profile details and assigned tournament edition roles of a staff member.
   *
   * @param staffId Unique identifier of the staff member.
   * @returns Detailed staff profile along with edition and discipline specific roles.
   * @throws UnauthorizedException if the staff member is not found.
   */
  async getMe(staffId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: {
        editionRoles: {
          include: {
            edition: true,
            editionDiscipline: {
              include: {
                discipline: true,
              },
            },
          },
        },
      },
    });

    if (!staff) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    const editionRoles = staff.editionRoles.map((role) => ({
      editionId: role.editionId,
      editionName: role.edition.name,
      disciplineId: role.editionDiscipline?.disciplineId ?? null,
      disciplineName: role.editionDiscipline?.discipline?.name ?? null,
      role: role.role,
    }));

    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      isSuperAdmin: staff.isSuperAdmin,
      editionRoles,
    };
  }

  /**
   * Verifies the authenticity and expiration of an access token.
   *
   * @param token The access token string to verify.
   * @returns The decoded payload of the access token.
   * @throws UnauthorizedException if token verification fails.
   */
  verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }
  }
}
