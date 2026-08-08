import { EditionStaffRoleType } from '@prisma/client';
import { RoleValidationStrategy } from './role-validation-strategy.interface';
import { EditionAdminValidationStrategy } from './edition-admin-validation.strategy';
import { DisciplineManagerValidationStrategy } from './discipline-manager-validation.strategy';

export * from './role-validation-strategy.interface';
export * from './edition-admin-validation.strategy';
export * from './discipline-manager-validation.strategy';

export const ROLE_VALIDATION_STRATEGIES: Record<EditionStaffRoleType, RoleValidationStrategy> = {
  [EditionStaffRoleType.EDITION_ADMIN]: new EditionAdminValidationStrategy(),
  [EditionStaffRoleType.DISCIPLINE_MANAGER]: new DisciplineManagerValidationStrategy(),
};
