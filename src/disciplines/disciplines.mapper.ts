import { Discipline, EditionDiscipline } from '@prisma/client';
import { DisciplineResponseDto } from './dto/discipline-response.dto';
import { EditionDisciplineResponseDto } from './dto/edition-discipline-response.dto';

/**
 * Transforms a Discipline database entity from Prisma into a standardized DisciplineResponseDto.
 * Extracts global catalog fields, including id, name, slug, description, and whether the discipline is individual.
 *
 * @param discipline The Discipline database model entity.
 * @returns The mapped DisciplineResponseDto object.
 */
export function toDisciplineResponseDto(discipline: Discipline): DisciplineResponseDto {
  return {
    id: discipline.id,
    name: discipline.name,
    slug: discipline.slug,
    isIndividual: discipline.isIndividual,
    description: discipline.description,
    createdAt: discipline.createdAt,
  };
}

export type EditionDisciplineWithRelation = EditionDiscipline & {
  discipline: Discipline;
};

/**
 * Transforms an EditionDiscipline database entity (including its joined Discipline relation)
 * into a standardized EditionDisciplineResponseDto.
 * Exposes specific configuration details and metadata relative to a competition edition.
 *
 * @param ed The EditionDiscipline database entity containing the related Discipline entity.
 * @returns The mapped EditionDisciplineResponseDto object.
 */
export function toEditionDisciplineResponseDto(
  ed: EditionDisciplineWithRelation,
): EditionDisciplineResponseDto {
  return {
    id: ed.id,
    disciplineId: ed.disciplineId,
    disciplineName: ed.discipline.name,
    isIndividual: ed.discipline.isIndividual,
    config: ed.config,
  };
}
