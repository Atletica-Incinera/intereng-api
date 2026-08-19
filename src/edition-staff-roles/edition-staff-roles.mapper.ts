import {
  EditionStaffRole,
  Staff,
  CompetitionEdition,
  EditionDiscipline,
  Discipline,
} from '@prisma/client';

export type EditionStaffRoleWithRelations = EditionStaffRole & {
  edition: CompetitionEdition;
  staff: Staff;
  editionDiscipline?:
    | (EditionDiscipline & {
        discipline: Discipline;
      })
    | null;
};

/**
 * Maps an EditionStaffRole database record with relations to the standard response DTO format.
 *
 * @param role The staff role database entity with staff, edition, and editionDiscipline relations
 * @returns Cleaned response DTO ready for client consumption
 */
export function toStaffRoleResponseDto(role: EditionStaffRoleWithRelations) {
  return {
    id: role.id,
    editionId: role.editionId,
    editionName: role.edition.name,
    staffId: role.staffId,
    staffName: role.staff.name,
    staffEmail: role.staff.email,
    disciplineId: role.editionDiscipline?.disciplineId ?? null,
    disciplineName: role.editionDiscipline?.discipline?.name ?? null,
    role: role.role,
    revokedAt: role.revokedAt,
    revokedById: role.revokedById,
  };
}
