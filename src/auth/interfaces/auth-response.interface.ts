export type FrontendRole = 'SUPER_ADMIN' | 'EDITION_ADMIN' | 'DISCIPLINE_MANAGER';

export interface ActiveEditionRoleResponse {
  roleAssignmentId: string;
  editionId: string;
  editionName: string;
  editionDisciplineId: string | null;
  disciplineId: string | null;
  disciplineName: string | null;
  role: 'EDITION_ADMIN' | 'DISCIPLINE_MANAGER';
}

export interface AuthUserResponse {
  id: string;
  email: string;
  name: string;
  role: FrontendRole;
  scope?: string;
  editionRoles: ActiveEditionRoleResponse[];
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: AuthUserResponse;
}

export type MeResponse = AuthUserResponse;

export interface IssuedAuthSession {
  auth: AuthResponse;
  refreshToken: string;
}

export interface LogoutResponse {
  message: string;
}
