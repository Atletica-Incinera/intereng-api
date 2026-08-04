import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validateSync, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { ClassConstructor } from 'class-transformer';

/**
 * Custom NestJS Validation Pipe designed to validate dynamic JSON payloads (shapes) against a given DTO class constructor.
 * Unlike global ValidationPipes that map directly to request bodies, this pipe is instantiated on the fly to validate
 * sub-objects or metadata structures whose target schemas depend on runtime context (e.g. discipline type).
 */
@Injectable()
export class JsonShapeValidationPipe implements PipeTransform {
  /**
   * Creates an instance of JsonShapeValidationPipe.
   *
   * @param dto - The class constructor of the target DTO to validate against.
   */
  constructor(private readonly dto: ClassConstructor<unknown>) {}

  /**
   * Transforms and validates the input value.
   * Resolves plain objects to instances of the configured DTO, performs strict validation (whitelisting and forbidding non-whitelisted fields),
   * and throws formatted validation errors if the schema is violated.
   *
   * @param value - The raw JSON payload to validate.
   * @param _metadata - Optional argument metadata from NestJS.
   * @returns The transformed, validated, and sanitized DTO instance.
   * @throws BadRequestException if the input is not a valid JSON object or if validation constraints are violated.
   */
  transform(value: unknown, _metadata?: ArgumentMetadata): any {
    if (
      value === null ||
      value === undefined ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new BadRequestException('Metadata deve ser um objeto JSON válido.');
    }

    const instance = plainToInstance(this.dto, value);
    const errors = validateSync(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const messages: string[] = [];
      const extractErrors = (errorList: ValidationError[]) => {
        for (const error of errorList) {
          if (error.constraints) {
            messages.push(...Object.values(error.constraints));
          }
          if (error.children && error.children.length > 0) {
            extractErrors(error.children);
          }
        }
      };
      extractErrors(errors);
      throw new BadRequestException(messages);
    }

    return instance;
  }
}
