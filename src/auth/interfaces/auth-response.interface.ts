export type FrontendRole = 'SUPER_ADMIN' | 'EDITION_ADMIN' | 'DISCIPLINE_MANAGER';

export interface AuthUserResponse {
  id: string;
  email: string;
  name: string;
  role: FrontendRole;
  scope?: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: AuthUserResponse;
}

export interface ActiveEditionRoleResponse {
  editionId: string;
  editionName: string;
  disciplineId: string | null;
  disciplineName: string | null;
  role: 'EDITION_ADMIN' | 'DISCIPLINE_MANAGER';
}

export interface MeResponse extends AuthUserResponse {
  editionRoles: ActiveEditionRoleResponse[];
}

export interface IssuedAuthSession {
  auth: AuthResponse;
  refreshToken: string;
}

export interface LogoutResponse {
  message: string;
}
