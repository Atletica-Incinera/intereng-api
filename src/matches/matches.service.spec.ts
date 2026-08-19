import { GoneException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { MatchesService } from './matches.service';

/**
 * Trava de cutover: `PATCH /matches/:id/status` é hoje bloqueada pelo `LegacyMutationGuard`
 * (APP_GUARD, src/app.module.ts). O guard é global e removível; esta suíte garante que a barreira
 * também existe dentro do serviço, para que remover o guard não ressuscite um escritor de partidas
 * que encerra o jogo sem recalcular `phase_standings` pelo motor canônico.
 *
 * Não toca no banco de propósito: as dependências são nulas porque o método precisa falhar antes
 * de qualquer acesso a Prisma, auditoria ou event emitter.
 */
describe('MatchesService — rota legada de status', () => {
  const service = new MatchesService(null as never, null as never, null as never);

  it('recusa a transição para FINISHED sem tocar em nenhuma dependência', () => {
    expect(() => service.updateMatchStatus('match-1', MatchStatus.FINISHED, 'staff-1')).toThrow(
      GoneException,
    );
  });

  it('recusa qualquer outra transição de status', () => {
    expect(() => service.updateMatchStatus('match-1', MatchStatus.LIVE, 'staff-1')).toThrow(
      GoneException,
    );
    expect(() => service.updateMatchStatus('match-1', MatchStatus.WALKOVER, 'staff-1')).toThrow(
      GoneException,
    );
  });
});
