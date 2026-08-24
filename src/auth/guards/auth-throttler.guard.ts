import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AUTH_THROTTLE_KEY } from './auth-throttler.config';

/**
 * Throttler de escopo cirúrgico.
 *
 * Registrado como guard global — é a única forma de o `ThrottlerGuard` resolver
 * suas dependências sem duplicar o armazenamento —, mas atua apenas onde o
 * decorador `@ThrottleAuth` marcou. As rotas de operação do evento continuam
 * sem limite: o risco de travar a mesa no meio de um jogo é maior que o de
 * abuso numa rota que já exige sessão.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  // Devolve `Promise` porque a assinatura da classe base é assíncrona, mas sem
  // `async`: a decisão sai da metadata já resolvida em memória, e um `async` sem
  // `await` reprova em `require-await` — a única regra não corrigível pelo
  // `--fix` do `npm run lint`, que é o passo de CI que fecha o merge.
  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    const marked = this.reflector.getAllAndOverride<boolean>(AUTH_THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return Promise.resolve(marked !== true);
  }
}
