import { ExecutionContext, GoneException } from '@nestjs/common';
import { LegacyMutationGuard } from './legacy-mutation.guard';

describe('LegacyMutationGuard', () => {
  const guard = new LegacyMutationGuard();

  function contextFor(method: string, path: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, originalUrl: `/api/v1${path}` }),
      }),
    } as unknown as ExecutionContext;
  }

  it.each([
    ['POST', '/auth/login'],
    ['POST', '/auth/refresh'],
    ['POST', '/auth/logout'],
    // Faltou aqui na primeira versão do guard: a troca de senha voltava 410
    // Gone em produção, travando a única saída de quem tinha acabado de
    // entrar com a senha inicial.
    ['POST', '/auth/change-password'],
    ['POST', '/editions/intereng-2026/actions'],
    ['POST', '/teams/aurora/logo-upload-url'],
    // O pipeline de ações resolve a edição "active" antes de rodar qualquer
    // ação — sem nenhuma competição ativa ainda, nem `competition/create`
    // chega a executar. Este é o único jeito de sair do zero.
    ['POST', '/competitions/bootstrap'],
  ])('libera %s %s', (method, path) => {
    expect(guard.canActivate(contextFor(method, path))).toBe(true);
  });

  it('continua recusando rota REST granular fora da lista', () => {
    expect(() => guard.canActivate(contextFor('POST', '/teams'))).toThrow(GoneException);
  });

  it('continua recusando o resto de /competitions — só /bootstrap é exceção', () => {
    expect(() => guard.canActivate(contextFor('POST', '/competitions'))).toThrow(GoneException);
    expect(() => guard.canActivate(contextFor('POST', '/competitions/intereng/editions'))).toThrow(
      GoneException,
    );
  });

  it('não interfere em métodos de leitura', () => {
    expect(guard.canActivate(contextFor('GET', '/editions/intereng-2026/snapshot'))).toBe(true);
  });
});
