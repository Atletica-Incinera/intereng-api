import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EditionActionAuditDto } from './dto/edition-action.dto';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function actionObject(
  value: unknown,
  label: string,
  allowedKeys?: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${label} deve ser um objeto.`);
  }
  const record = value as Record<string, unknown>;
  if (allowedKeys) {
    const unknownKeys = Object.keys(record).filter((key) => !allowedKeys.includes(key));
    if (unknownKeys.length) {
      throw new BadRequestException(
        `${label} possui campo(s) não permitido(s): ${unknownKeys.join(', ')}.`,
      );
    }
  }
  return record;
}

export function actionArray(value: unknown, label: string, max = 500): unknown[] {
  if (!Array.isArray(value)) throw new BadRequestException(`${label} deve ser uma lista.`);
  if (value.length > max) {
    throw new BadRequestException(`${label} deve possuir no máximo ${max} itens.`);
  }
  return value;
}

export function actionString(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options: { min?: number; max?: number; trim?: boolean } = {},
): string {
  const value = record[key];
  if (typeof value !== 'string') throw new BadRequestException(`${label} deve ser um texto.`);
  const normalized = options.trim === false ? value : value.trim();
  const min = options.min ?? 1;
  const max = options.max ?? 300;
  if (normalized.length < min || normalized.length > max) {
    throw new BadRequestException(`${label} deve ter entre ${min} e ${max} caracteres.`);
  }
  return normalized;
}

export function optionalActionString(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options: { min?: number; max?: number; trim?: boolean; nullable: true },
): string | null | undefined;
export function optionalActionString(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options?: { min?: number; max?: number; trim?: boolean; nullable?: false },
): string | undefined;
export function optionalActionString(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options: { min?: number; max?: number; trim?: boolean; nullable?: boolean } = {},
): string | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value === null && options.nullable) return null;
  return actionString(record, key, label, options);
}

export function actionId(record: Record<string, unknown>, key: string, label: string): string {
  const value = actionString(record, key, label, { min: 1, max: 128 });
  if (!ID_PATTERN.test(value)) {
    throw new BadRequestException(
      `${label} deve começar com letra ou número e usar apenas letras, números, ponto, dois-pontos, sublinhado ou hífen.`,
    );
  }
  return value;
}

export function actionBoolean(
  record: Record<string, unknown>,
  key: string,
  label: string,
): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') throw new BadRequestException(`${label} deve ser booleano.`);
  return value;
}

export function optionalActionBoolean(
  record: Record<string, unknown>,
  key: string,
  label: string,
): boolean | undefined {
  return record[key] === undefined ? undefined : actionBoolean(record, key, label);
}

export function actionNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${label} deve ser um número válido.`);
  }
  if (options.integer !== false && !Number.isInteger(value)) {
    throw new BadRequestException(`${label} deve ser um número inteiro.`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new BadRequestException(`${label} deve ser maior ou igual a ${options.min}.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new BadRequestException(`${label} deve ser menor ou igual a ${options.max}.`);
  }
  return value;
}

export function optionalActionNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options: { min?: number; max?: number; integer?: boolean; nullable: true },
): number | null | undefined;
export function optionalActionNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options?: { min?: number; max?: number; integer?: boolean; nullable?: false },
): number | undefined;
export function optionalActionNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options: { min?: number; max?: number; integer?: boolean; nullable?: boolean } = {},
): number | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value === null && options.nullable) return null;
  return actionNumber(record, key, label, options);
}

export function actionEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  label: string,
  values: readonly T[],
): T {
  const value = actionString(record, key, label, { min: 1, max: 100 });
  if (!values.includes(value as T)) {
    throw new BadRequestException(`${label} possui valor inválido.`);
  }
  return value as T;
}

export function optionalActionEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  label: string,
  values: readonly T[],
): T | undefined {
  return record[key] === undefined ? undefined : actionEnum(record, key, label, values);
}

export function actionDate(record: Record<string, unknown>, key: string, label: string): string {
  const value = actionString(record, key, label, { min: 10, max: 10 });
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new BadRequestException(`${label} deve estar no formato AAAA-MM-DD.`);
  }
  return value;
}

export function actionTime(record: Record<string, unknown>, key: string, label: string): string {
  const value = actionString(record, key, label, { min: 5, max: 5 });
  if (!TIME_PATTERN.test(value)) {
    throw new BadRequestException(`${label} deve estar no formato HH:mm.`);
  }
  return value;
}

export function actionIsoDateTime(
  record: Record<string, unknown>,
  key: string,
  label: string,
): Date {
  const value = actionString(record, key, label, { min: 10, max: 80 });
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException(`${label} deve ser uma data válida.`);
  return date;
}

export function scheduledAt(date: string, time: string): Date {
  return new Date(`${date}T${time}:00.000Z`);
}

export function actionEmail(record: Record<string, unknown>, key: string, label: string): string {
  const email = actionString(record, key, label, { min: 3, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException(`${label} deve ser um e-mail válido.`);
  }
  return email;
}

export function requireActionReason(
  audit: EditionActionAuditDto | undefined,
  operation: string,
): string {
  const reason = audit?.reason?.trim();
  if (!reason || reason.length < 5) {
    throw new BadRequestException(`${operation} exige um motivo com pelo menos 5 caracteres.`);
  }
  return reason;
}

export function toInputJson(value: unknown, label: string): Prisma.InputJsonValue {
  return toJson(value, label) as Prisma.InputJsonValue;
}

function toJson(value: unknown, label: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => toJson(item, label));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        toJson(item, label),
      ]),
    );
  }
  throw new BadRequestException(`${label} possui um valor não serializável.`);
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
