import { BadRequestException } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import { JsonShapeValidationPipe } from './json-shape-validation.pipe';
import { FutsalHandebolEventDto } from './dtos/futsal-handebol-event.dto';
import { SetWonDto } from './dtos/set-won.dto';
import { BasquetePointDto } from './dtos/basquete-point.dto';
import { NatacaoOtherDto } from './dtos/natacao-other.dto';
import { XadrezEventDto } from './dtos/xadrez-event.dto';

/**
 * Validator utility class for dynamic JSON validation of Match Event metadata.
 * It resolves the appropriate validation DTO based on the discipline slug and event type,
 * validating payloads dynamically using class-validator and class-transformer.
 *
 * Supports dynamic registration of new validator DTOs to satisfy the Open/Closed Principle (OCP).
 */
export class MatchEventMetadataValidator {
  /**
   * Registry map for dynamic mapping of normalized `${disciplineSlug}:${eventType}` key to their validation DTO class.
   */
  private static readonly registry = new Map<string, ClassConstructor<unknown>>([
    // Futsal & Handebol
    ['futsal:GOAL', FutsalHandebolEventDto],
    ['futsal:YELLOW_CARD', FutsalHandebolEventDto],
    ['futsal:RED_CARD', FutsalHandebolEventDto],
    ['handebol:GOAL', FutsalHandebolEventDto],
    ['handebol:YELLOW_CARD', FutsalHandebolEventDto],
    ['handebol:RED_CARD', FutsalHandebolEventDto],
    ['handball:GOAL', FutsalHandebolEventDto],
    ['handball:YELLOW_CARD', FutsalHandebolEventDto],
    ['handball:RED_CARD', FutsalHandebolEventDto],

    // Vôlei
    ['volei:SET_WON', SetWonDto],
    ['volleyball:SET_WON', SetWonDto],

    // Basquete
    ['basquete:POINT', BasquetePointDto],
    ['basquetebol:POINT', BasquetePointDto],
    ['basketball:POINT', BasquetePointDto],

    // Tênis de mesa
    ['tenis-de-mesa:SET_WON', SetWonDto],
    ['tenis_de_mesa:SET_WON', SetWonDto],
    ['table-tennis:SET_WON', SetWonDto],

    // Natação
    ['natacao:OTHER', NatacaoOtherDto],
    ['swimming:OTHER', NatacaoOtherDto],

    // Xadrez
    ['xadrez:CHECKMATE', XadrezEventDto],
    ['xadrez:WALKOVER_DECLARED', XadrezEventDto],
    ['chess:CHECKMATE', XadrezEventDto],
    ['chess:WALKOVER_DECLARED', XadrezEventDto],
  ]);

  /**
   * Dynamically registers a validation DTO for a discipline and event type.
   * This allows extending the validation rules at runtime without modifying the validator class directly.
   *
   * @param disciplineSlug - The slug of the sports discipline (e.g., 'futsal').
   * @param eventType - The event type string (e.g., 'GOAL').
   * @param dto - The class constructor of the DTO to use for validation.
   */
  static register(disciplineSlug: string, eventType: string, dto: ClassConstructor<unknown>): void {
    const normalizedSlug = this.normalizeSlug(disciplineSlug);
    const key = `${normalizedSlug}:${eventType}`;
    this.registry.set(key, dto);
  }

  /**
   * Unregisters a validation DTO mapping if it exists.
   *
   * @param disciplineSlug - The slug of the sports discipline.
   * @param eventType - The event type string.
   */
  static unregister(disciplineSlug: string, eventType: string): void {
    const normalizedSlug = this.normalizeSlug(disciplineSlug);
    const key = `${normalizedSlug}:${eventType}`;
    this.registry.delete(key);
  }

  /**
   * Validates match event metadata dynamic shape.
   * Resolves the DTO mapper for the specific combination of discipline and event type.
   * If mapped, it validates and sanitizes the shape using `JsonShapeValidationPipe`.
   * If unmapped, it guarantees that the metadata is a valid JSON object if provided.
   *
   * @param disciplineSlug - The slug of the sports discipline.
   * @param eventType - The event type.
   * @param metadata - The dynamic metadata object to validate.
   * @returns The parsed/validated metadata object.
   * @throws BadRequestException if validation fails or metadata structure is invalid.
   */
  static validate(disciplineSlug: string, eventType: string, metadata: unknown): unknown {
    const normalizedSlug = this.normalizeSlug(disciplineSlug);
    const key = `${normalizedSlug}:${eventType}`;
    const dto = this.registry.get(key);

    if (dto) {
      const pipe = new JsonShapeValidationPipe(dto);
      return pipe.transform(metadata);
    }

    // Para combinações não mapeadas: apenas type-check de que é um objeto JSON válido se fornecido
    if (metadata !== undefined && metadata !== null) {
      if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        throw new BadRequestException('Metadata deve ser um objeto JSON válido.');
      }
    }

    return metadata;
  }

  /**
   * Normalizes a sport discipline slug string.
   * Converts to lowercase, strips accents/diacritics, and replaces non-alphanumeric chars with hyphens.
   *
   * @param slug - The raw discipline slug.
   * @returns The normalized clean slug.
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
