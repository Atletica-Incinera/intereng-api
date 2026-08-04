import { SetMetadata } from '@nestjs/common';
import { EditionStaffRoleType } from '@prisma/client';

export const REQUIRE_ROLE_KEY = 'require-role';

/**
 * Decorator to specify the minimum role required to access a controller route or class.
 *
 * Role checks follow an inheritance hierarchy:
 * 1. `SuperAdmin` (global flag `isSuperAdmin: true` on request user) bypasses all guards.
 * 2. `EDITION_ADMIN` inherits permissions of `DISCIPLINE_MANAGER` and passes any edition/discipline-level check in that edition.
 * 3. `DISCIPLINE_MANAGER` requires the user to have a role mapped to the specific discipline of the target resource.
 *
 * @param role The minimum EditionStaffRoleType required (e.g. `EDITION_ADMIN`, `DISCIPLINE_MANAGER`)
 */
export const RequireRole = (role: EditionStaffRoleType) => SetMetadata(REQUIRE_ROLE_KEY, role);
