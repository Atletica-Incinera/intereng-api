import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CatalogSecurityService } from '../catalog-security.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { maskDocument } from '../security.utils';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object';
}

/**
 * Interceptor that automatically masks the athlete's document (PII)
 * in response payloads if the requesting user is not a catalog administrator.
 */
@Injectable()
export class AthletePIIInterceptor implements NestInterceptor {
  constructor(private readonly security: CatalogSecurityService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // Resolve admin privilege exactly once per request
    const isAdmin = user ? await this.security.checkIsAdmin(user.id, user.isSuperAdmin) : false;

    return next.handle().pipe(
      map((data: unknown): unknown => {
        if (!data) return data;

        const maskAthlete = (athlete: unknown): unknown => {
          if (!isObject(athlete)) return athlete;

          const doc = athlete['document'];
          if (typeof doc === 'string') {
            return {
              ...athlete,
              document: isAdmin ? doc : maskDocument(doc),
            };
          }
          return athlete;
        };

        // Handle array of athletes
        if (Array.isArray(data)) {
          return data.map(maskAthlete);
        }

        // Handle paginated responses (e.g. { items: [...], meta: ... })
        if (isObject(data) && 'items' in data && Array.isArray(data.items)) {
          return {
            ...data,
            items: data.items.map(maskAthlete),
          };
        }

        // Handle single athlete response
        return maskAthlete(data);
      }),
    );
  }
}
