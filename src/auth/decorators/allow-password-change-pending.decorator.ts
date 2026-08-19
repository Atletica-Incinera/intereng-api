import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'allowPasswordChangePending';

/**
 * Libera a rota para quem ainda não trocou a senha inicial.
 *
 * O `JwtAuthGuard` recusa todo o resto enquanto a conta está marcada, então sem
 * esta marca a pessoa não conseguiria nem trocar a senha nem sair — ficaria
 * autenticada e sem nenhuma rota alcançável.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);
