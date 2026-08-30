export type FrontendRole = 'SUPER_ADMIN' | 'EDITION_ADMIN' | 'DISCIPLINE_MANAGER' | 'TEAM_MANAGER';

export interface ActiveEditionRoleResponse {
  roleAssignmentId: string;
  editionId: string;
  editionName: string;
  editionDisciplineId: string | null;
  disciplineId: string | null;
  disciplineName: string | null;
  /** Equipe do responsável de atlética. Nulo nos outros papéis. */
  teamId: string | null;
  teamName: string | null;
  role: 'EDITION_ADMIN' | 'DISCIPLINE_MANAGER' | 'TEAM_MANAGER';
}

export interface AuthUserResponse {
  id: string;
  email: string;
  name: string;
  role: FrontendRole;
  scope?: string;
  editionRoles: ActiveEditionRoleResponse[];
  /**
   * A conta ainda usa a senha inicial — a do convite ou a do bootstrap. Com ela
   * verdadeira o app só libera a troca de senha, e a API recusa o resto.
   */
  mustChangePassword: boolean;
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
