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

/**
 * Segredo criptográfico com trava de produção.
 *
 * O padrão só vale fora de produção. Antes, um `.env` incompleto fazia a API
 * subir assinando tokens (ou cifrando CPF) com um valor publicado no
 * repositório — sem log, sem aviso, sem falha. Agora falta de segredo derruba o
 * boot, que é barulhento e acontece antes de qualquer requisição.
 */
function productionSecret(
  name: string,
  developmentFallback: string,
  options: { minLength?: number; aviso?: string } = {},
): string {
  const minLength = options.minLength ?? 32;
  const configured = process.env[name]?.trim();

  if (configured) {
    if (configured.length < minLength) {
      throw new Error(
        `Variável de ambiente inválida: ${name} deve ter ao menos ${minLength} caracteres.`,
      );
    }
    return configured;
  }

  if (value('NODE_ENV', 'development') === 'production') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}.` +
        (options.aviso ? ` ${options.aviso}` : ''),
    );
  }

  return developmentFallback;
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

/**
 * Tamanho mínimo de toda senha escolhida por uma pessoa.
 *
 * Vale para o bootstrap do super administrador e para a troca de senha. É maior
 * que o mínimo do convite (8) de propósito: a senha de convite é temporária e
 * trocada no primeiro acesso, enquanto estas duas ficam.
 */
export const MIN_CHOSEN_PASSWORD_LENGTH = 12;

/** Limite do bcrypt: ele trunca em silêncio a partir de 72 bytes. */
export const MAX_PASSWORD_BYTES = 72;

/**
 * Credencial do primeiro super administrador.
 *
 * Sem ela, um banco de produção recém-migrado não tem caminho para a primeira
 * conta: o login exige uma linha em `staff`, criar staff exige uma sessão de
 * super administrador, e o seed recusa `NODE_ENV=production`.
 *
 * As duas variáveis andam juntas. Configurar só uma derruba o boot em vez de
 * ser ignorada em silêncio — meia configuração aqui significa que alguém tentou
 * criar a conta e ela não vai existir.
 */
function bootstrapSuperAdmin(): { email: string; password: string } | undefined {
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD?.trim();

  if (!email && !password) return undefined;
  if (!email || !password) {
    throw new Error(
      'Variáveis de ambiente incompletas: BOOTSTRAP_SUPER_ADMIN_EMAIL e ' +
        'BOOTSTRAP_SUPER_ADMIN_PASSWORD precisam ser definidas juntas.',
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Variável de ambiente inválida: BOOTSTRAP_SUPER_ADMIN_EMAIL não é um e-mail.');
  }
  if (
    password.length < MIN_CHOSEN_PASSWORD_LENGTH ||
    Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
  ) {
    throw new Error(
      'Variável de ambiente inválida: BOOTSTRAP_SUPER_ADMIN_PASSWORD deve ter entre ' +
        `${MIN_CHOSEN_PASSWORD_LENGTH} e ${MAX_PASSWORD_BYTES} bytes.`,
    );
  }

  return { email, password };
}

export const env = {
  required(name: RequiredEnv): string {
    return value(name);
  },
  get bootstrapSuperAdmin(): { email: string; password: string } | undefined {
    return bootstrapSuperAdmin();
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
  /**
   * Caminho do cookie de refresh.
   *
   * O padrão é `/` de propósito. O valor anterior era o prefixo interno do Nest
   * (`/api/v1/auth`), o que só funciona quando a API é servida na raiz do
   * domínio: atrás de um proxy que a monta sob outro caminho — em produção,
   * `/intereng-api` — o navegador nunca encontra correspondência e deixa de
   * enviar o cookie, derrubando a sessão a cada expiração do token de acesso.
   *
   * Com `/` o cookie funciona sob qualquer montagem. Quem quiser restringir o
   * escopo define COOKIE_PATH com o caminho público real.
   */
  get cookiePath(): string {
    return process.env.COOKIE_PATH?.trim() || '/';
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
    return productionSecret('JWT_SECRET', 'local-access-secret-change-in-production');
  },
  get jwtRefreshSecret(): string {
    return productionSecret('JWT_REFRESH_SECRET', 'local-refresh-secret-change-in-production');
  },
  get piiPepper(): string {
    return productionSecret('PII_PEPPER', 'local-pii-pepper-change-in-production', {
      aviso:
        'Se a base já tem documentos gravados, use exatamente o mesmo valor de antes: ' +
        'trocar o pepper invalida o índice de unicidade dos documentos existentes.',
    });
  },
  get piiEncryptionKey(): string {
    return productionSecret('PII_ENCRYPTION_KEY', 'local-32-byte-key-change-me-now!', {
      aviso:
        'Se a base já tem documentos cifrados, use exatamente o mesmo valor de antes: ' +
        'com outra chave os documentos existentes deixam de ser legíveis e precisam ser recifrados.',
    });
  },
  get staffInvitePassword(): string {
    return staffInvitePassword();
  },
  positiveInteger,
  value,
} as const;
