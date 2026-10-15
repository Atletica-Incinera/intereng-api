/**
 * Guarda dos testes de integração que apagam tabelas inteiras.
 *
 * Esses testes limpam competições, staff e partidas de qualquer banco que esteja
 * em DATABASE_URL — e o `.env` de quem desenvolve aponta para o banco que ela
 * está usando. Rodar `npm test` no meio de um teste manual apagou todos os
 * papéis de staff e todas as partidas do banco local. Agora a limpeza só roda
 * quando o ambiente declara, de propósito, que o banco é descartável (o CI
 * declara; o `.env` local não).
 */
export function exigirBancoDescartavel(): void {
  if (process.env.PERMITIR_LIMPEZA_DO_BANCO_EM_TESTE === '1') return;
  throw new Error(
    'Este teste apaga tabelas inteiras do banco em DATABASE_URL. Rode-o contra um banco descartável ' +
      'e declare PERMITIR_LIMPEZA_DO_BANCO_EM_TESTE=1.',
  );
}
