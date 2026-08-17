import { BadRequestException } from '@nestjs/common';

const EDITION_DISCIPLINE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const OPERATOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:-]{7,127}$/;

export type RequestedEditionRole = 'EDITION_ADMIN' | 'DISCIPLINE_MANAGER';

export function parseEditionRoleHeader(
  value: string | undefined,
): RequestedEditionRole | undefined {
  if (value === undefined) return undefined;

  const normalized = value.trim().toUpperCase();
  if (normalized !== 'EDITION_ADMIN' && normalized !== 'DISCIPLINE_MANAGER') {
    throw new BadRequestException(
      'O header X-Edition-Role deve ser EDITION_ADMIN ou DISCIPLINE_MANAGER.',
    );
  }

  return normalized;
}

export function parseEditionDisciplineHeader(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;

  const normalized = value.trim();
  if (!normalized || !EDITION_DISCIPLINE_ID_PATTERN.test(normalized)) {
    throw new BadRequestException(
      'O header X-Edition-Discipline-Id deve começar com letra ou número, ter no máximo 128 caracteres e usar apenas letras, números, ponto, dois-pontos, sublinhado ou hífen.',
    );
  }

  return normalized;
}

export function parseOperatorHeader(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;

  const normalized = value.trim();
  if (!OPERATOR_ID_PATTERN.test(normalized)) {
    throw new BadRequestException(
      'O header X-Operator-Id deve ter entre 8 e 128 caracteres e usar apenas letras, números, dois-pontos, sublinhado ou hífen.',
    );
  }

  return normalized;
}
