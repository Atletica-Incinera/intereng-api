/**
 * Configura as variáveis de ambiente necessárias para a execução dos testes.
 */
export function setupTestEnv() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/competitions?schema=public';
}
