import { Injectable } from '@nestjs/common';
import { ScopeResolverStrategy, ResolvedScope } from '../scope-resolver.interface';

/**
 * Strategy to resolve the scope when the target entity is an Edition.
 */
@Injectable()
export class EditionScopeResolver implements ScopeResolverStrategy {
  readonly type = 'edition';

  /**
   * Resolves the edition scope.
   */
  resolve(value: string): Promise<ResolvedScope> {
    return Promise.resolve({ editionId: value });
  }
}
