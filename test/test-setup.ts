/**
 * Configura as variáveis de ambiente necessárias para a execução dos testes.
 */
export function setupTestEnv() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/competitions?schema=public';
}

export const MOCK_PASSWORD_HASH = '$2b$10$EXunA2kI86D5KaloSvNjQuIQOWNYzqKvdjLLASS76Dokg26rmjuE6';

