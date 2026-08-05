import { BadRequestException } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import { JsonShapeValidationPipe } from '../../common/validation/json-shape-validation.pipe';
import { VolleyballConfigDto, DefaultDurationConfigDto } from '../dto/configs.dto';

/**
 * Validator utility class responsible for validating dynamic JSON configurations
 * for specific sports/disciplines in a competition edition.
 * Maps normalized discipline slugs to their respective validation DTOs.
 */
export class EditionDisciplineConfigValidator {
  /**
   * Registry mapping normalized slugs to their appropriate validation DTO classes.
   */
  private static readonly registry = new Map<string, ClassConstructor<unknown>>([
    ['volei', VolleyballConfigDto],
    ['volleyball', VolleyballConfigDto],
    ['futsal', DefaultDurationConfigDto],
    ['handebol', DefaultDurationConfigDto],
    ['handball', DefaultDurationConfigDto],
    ['basquete', DefaultDurationConfigDto],
    ['basquetebol', DefaultDurationConfigDto],
    ['basketball', DefaultDurationConfigDto],
  ]);

  /**
   * Dynamically validates a configuration object based on the discipline's slug.
   * If a specific validation schema (DTO) exists for the normalized slug, it uses JsonShapeValidationPipe
   * to validate and transform the configuration object. Otherwise, it verifies that the configuration
   * is a valid JSON object structure (non-array object).
   *
   * @param disciplineSlug The original slug of the discipline (e.g. 'volei-de-praia').
   * @param config The raw configuration object to validate.
   * @returns The validated and transformed configuration object.
   * @throws BadRequestException if configuration does not meet validation criteria.
   */
  static validate(disciplineSlug: string, config: unknown): unknown {
    if (config === undefined || config === null) {
      return config;
    }

    const normalizedSlug = this.normalizeSlug(disciplineSlug);
    const dto = this.registry.get(normalizedSlug);

    if (dto) {
      const pipe = new JsonShapeValidationPipe(dto);
      return pipe.transform(config);
    }

    // Default fallback: check that config is a valid JSON object
    if (typeof config !== 'object' || Array.isArray(config)) {
      throw new BadRequestException('A configuração deve ser um objeto JSON válido.');
    }

    return config;
  }

  /**
   * Normalizes a slug string to make it case-insensitive, strip accents,
   * and remove special characters for reliable matching.
   *
   * @param slug The raw slug.
   * @returns The normalized slug string.
   */
  private static normalizeSlug(slug: string): string {
    if (!slug) return '';
    return slug
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-');
  }
}
