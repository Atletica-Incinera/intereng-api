export type RequiredEnv = 'DATABASE_URL' | 'JWT_SECRET' | 'JWT_REFRESH_SECRET' | 'REDIS_URL';

type SameSite = 'lax' | 'strict' | 'none';

function value(name: string, fallback?: string): string {
  const configured = process.env[name]?.trim();
  if (configured) return configured;
  if (fallback !== undefined) return fallback;
  throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
}

function booleanValue(name: string, fallback: boolean): boolean {
  const configured = process.env[name]?.trim().toLowerCase();
  if (!configured) return fallback;
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  throw new Error(`Variável de ambiente inválida: ${name} deve ser true ou false`);
}

function positiveInteger(name: string, fallback: number): number {
  const configured = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(configured) || configured <= 0) {
    throw new Error(`Variável de ambiente inválida: ${name} deve ser um inteiro positivo`);
  }
  return configured;
}

function sameSiteValue(): SameSite {
  const configured = value('COOKIE_SAME_SITE', 'lax').toLowerCase();
  if (configured === 'lax' || configured === 'strict' || configured === 'none') {
    return configured;
  }
  throw new Error('Variável de ambiente inválida: COOKIE_SAME_SITE deve ser lax, strict ou none');
}

export const env = {
  required(name: RequiredEnv): string {
    return value(name);
  },
  get nodeEnv(): string {
    return value('NODE_ENV', 'development');
  },
  get port(): number {
    return positiveInteger('PORT', 3000);
  },
  get databaseUrl(): string {
    return value(
      'DATABASE_URL',
      'postgresql://postgres:postgres@localhost:5432/competitions?schema=public',
    );
  },
  get redisUrl(): string {
    return value('REDIS_URL', 'redis://localhost:6379');
  },
  get corsOrigins(): string[] {
    return value('CORS_ORIGINS', 'http://app.localhost,http://localhost:3001')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  },
  get cookieDomain(): string | undefined {
    return process.env.COOKIE_DOMAIN?.trim() || undefined;
  },
  get cookieSecure(): boolean {
    return booleanValue('COOKIE_SECURE', this.nodeEnv === 'production');
  },
  get cookieSameSite(): SameSite {
    return sameSiteValue();
  },
  get jwtSecret(): string {
    return value('JWT_SECRET', 'local-access-secret-change-in-production');
  },
  get jwtRefreshSecret(): string {
    return value('JWT_REFRESH_SECRET', 'local-refresh-secret-change-in-production');
  },
  positiveInteger,
  value,
} as const;
