import { SetMetadata } from '@nestjs/common';

export const CLEAR_COOKIE_KEY = 'clear_cookie';
export const ClearCookie = (name: string) => SetMetadata(CLEAR_COOKIE_KEY, name);
