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

function staffInvitePassword(): string {
  const configured = process.env.STAFF_INVITE_PASSWORD?.trim();
  if (configured) {
    if (configured.length < 8 || Buffer.byteLength(configured, 'utf8') > 72) {
      throw new Error(
        'Variável de ambiente inválida: STAFF_INVITE_PASSWORD deve ter entre 8 e 72 bytes',
      );
    }
    return configured;
  }
  if (value('NODE_ENV', 'development') === 'production') {
    throw new Error('Variável de ambiente obrigatória ausente: STAFF_INVITE_PASSWORD');
  }
  return 'intereng2026';
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
  get s3Endpoint(): string | undefined {
    return process.env.S3_ENDPOINT?.trim() || undefined;
  },
  get s3PresignEndpoint(): string | undefined {
    return process.env.S3_PRESIGN_ENDPOINT?.trim() || this.s3Endpoint;
  },
  get s3Region(): string {
    return value('S3_REGION', 'us-east-1');
  },
  get s3Bucket(): string {
    return value('S3_BUCKET', 'intereng');
  },
  get s3AccessKeyId(): string | undefined {
    return process.env.S3_ACCESS_KEY_ID?.trim() || undefined;
  },
  get s3SecretAccessKey(): string | undefined {
    return process.env.S3_SECRET_ACCESS_KEY?.trim() || undefined;
  },
  get s3ForcePathStyle(): boolean {
    return booleanValue('S3_FORCE_PATH_STYLE', Boolean(this.s3Endpoint));
  },
  get s3PresignTtlSeconds(): number {
    return positiveInteger('S3_PRESIGN_TTL_SECONDS', 5 * 60);
  },
  get s3MaxLogoBytes(): number {
    return positiveInteger('S3_MAX_LOGO_BYTES', 8 * 1024 * 1024);
  },
  get s3PublicBaseUrl(): string {
    const configured = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
    if (configured) return configured;
    const presignEndpoint =
      process.env.S3_PRESIGN_ENDPOINT?.trim() || process.env.S3_ENDPOINT?.trim();
    const bucket = value('S3_BUCKET', 'intereng');
    if (presignEndpoint) {
      return `${presignEndpoint.replace(/\/$/, '')}/${encodeURIComponent(bucket)}`;
    }
    return `https://${bucket}.s3.${value('S3_REGION', 'us-east-1')}.amazonaws.com`;
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
  get jwtAccessTtlSeconds(): number {
    return positiveInteger('JWT_ACCESS_TTL_SECONDS', 15 * 60);
  },
  get jwtRefreshTtlSeconds(): number {
    return positiveInteger('JWT_REFRESH_TTL_SECONDS', 7 * 24 * 60 * 60);
  },
  get jwtSecret(): string {
    return value('JWT_SECRET', 'local-access-secret-change-in-production');
  },
  get jwtRefreshSecret(): string {
    return value('JWT_REFRESH_SECRET', 'local-refresh-secret-change-in-production');
  },
  get staffInvitePassword(): string {
    return staffInvitePassword();
  },
  positiveInteger,
  value,
} as const;
