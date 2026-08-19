import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { SnapshotEnvelopeDto, SnapshotResultDto } from './dto/frontend-snapshot.dto';

export function respondWithSnapshot(
  response: Response,
  ifNoneMatch: string | undefined,
  result: SnapshotResultDto,
  cacheControl: string,
): SnapshotEnvelopeDto | undefined {
  response.setHeader('ETag', result.etag);
  response.setHeader('Cache-Control', cacheControl);

  if (matchesEtag(ifNoneMatch, result.etag)) {
    response.status(HttpStatus.NOT_MODIFIED);
    return undefined;
  }

  return {
    data: result.snapshot,
    meta: { revision: result.revision },
  };
}

function matchesEtag(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === '*' || candidate === etag);
}
