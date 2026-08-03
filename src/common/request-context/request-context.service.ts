import { Injectable } from '@nestjs/common';
import { requestContextStorage } from './request-context.storage';

@Injectable()
export class RequestContextService {
  getRequestId(): string | undefined {
    return requestContextStorage.getStore()?.requestId;
  }
}
