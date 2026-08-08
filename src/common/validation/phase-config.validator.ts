import { BadRequestException } from '@nestjs/common';
import { PhaseType } from '@prisma/client';
import type { ClassConstructor } from 'class-transformer';
import { JsonShapeValidationPipe } from './json-shape-validation.pipe';

/**
 * Validator utility class for dynamic JSON validation of Phase configurations.
 * It resolves the appropriate validation DTO based on the PhaseType,
 * validating payloads dynamically using class-validator and class-transformer.
 *
 * Designed to conform to the Open/Closed Principle (OCP): new PhaseTypes and their
 * corresponding validator DTOs can be registered dynamically without modifying this class.
 */
export class PhaseConfigValidator {
  /**
   * Registry map for dynamic mapping of PhaseType to their validation DTO class.
   */
  private static readonly registry = new Map<PhaseType, ClassConstructor<unknown>>();

  /**
   * Registers a validation DTO class for a specific PhaseType.
   */
  static register(type: PhaseType, dto: ClassConstructor<unknown>): void {
    this.registry.set(type, dto);
  }

  /**
   * Unregisters the validation DTO class for a specific PhaseType.
   */
  static unregister(type: PhaseType): void {
    this.registry.delete(type);
  }

  /**
   * Validates phase config dynamic shape.
   * Resolves the DTO mapper for the specific phase type.
   * If mapped, it validates and sanitizes the shape using `JsonShapeValidationPipe`.
   * If unmapped, it guarantees that the config is a valid JSON object if provided.
   *
   * @param type - The type of the phase (GROUP, LEAGUE, KNOCKOUT).
   * @param config - The dynamic config object to validate.
   * @returns The parsed/validated config object.
   * @throws BadRequestException if validation fails or config structure is invalid.
   */
  static validate(type: PhaseType, config: unknown): unknown {
    const dto = this.registry.get(type);

    if (dto) {
      // If config is not provided, throw BadRequestException since GROUP/LEAGUE require configs,
      // and even KNOCKOUT expects {} which is a valid object.
      if (config === undefined || config === null) {
        throw new BadRequestException('Configuração da fase é obrigatória.');
      }
      const pipe = new JsonShapeValidationPipe(dto);
      return pipe.transform(config);
    }

    if (config !== undefined && config !== null) {
      if (typeof config !== 'object' || Array.isArray(config)) {
        throw new BadRequestException('Config deve ser um objeto JSON válido.');
      }
    }

    return config;
  }
}
