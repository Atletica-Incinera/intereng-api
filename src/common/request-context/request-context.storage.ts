import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  requestId: string;
}

export const requestContextStorage =
  new AsyncLocalStorage<RequestContextStore>();
