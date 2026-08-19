import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '../../common/config/config.service';
import { IHashService } from '../interfaces/hash-service.interface';

export type BootstrapOutcome = 'not-configured' | 'already-exists' | 'email-taken' | 'created';

/**
 * Cria a primeira conta de super administrador.
 *
 * Um banco de produção recém-migrado não tem caminho para a primeira conta: o
 * login exige uma linha em `staff`, criar staff exige uma sessão de super
 * administrador, e o seed recusa `NODE_ENV=production`. Sem isto aqui, subir a
 * API contra um banco vazio produz um sistema em que ninguém consegue entrar.
 *
 * É idempotente e se autodesliga: havendo qualquer super administrador, não faz
 * nada. Por isso as variáveis podem ficar no ambiente para sempre — o que
 * importa, já que a alternativa seria alguém precisar acessar a VM para rodar
 * um comando pontual.
 *
 * A conta nasce com `mustChangePassword`, então a senha que passou pelo
 * ambiente (e pelo secret do CI) não é a senha que fica.
 */
@Injectable()
export class SuperAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(IHashService) private readonly hashService: IHashService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  async run(): Promise<BootstrapOutcome> {
    const credentials = this.config.bootstrapSuperAdmin;
    if (!credentials) return 'not-configured';

    const existing = await this.prisma.staff.count({ where: { isSuperAdmin: true } });
    if (existing > 0) {
      this.logger.log(
        `Bootstrap ignorado: já existe super administrador (${existing}). ` +
          'As variáveis BOOTSTRAP_SUPER_ADMIN_* podem permanecer no ambiente.',
      );
      return 'already-exists';
    }

    const passwordHash = await this.hashService.hash(credentials.password);

    try {
      const created = await this.prisma.staff.create({
        data: {
          name: 'Super administrador',
          email: credentials.email,
          passwordHash,
          isSuperAdmin: true,
          mustChangePassword: true,
        },
        select: { id: true, email: true },
      });
      this.logger.warn(
        `Super administrador criado por bootstrap: ${created.email}. ` +
          'A senha do ambiente é provisória — o primeiro acesso exige trocá-la.',
      );
      return 'created';
    } catch (error) {
      // Já existe conta com esse e-mail sem ser super administrador, ou duas
      // réplicas subiram ao mesmo tempo e a outra ganhou a corrida. Promover
      // uma conta existente a partir de variável de ambiente seria pior do que
      // falar alto e não fazer nada.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.error(
          `Bootstrap não criou a conta: já existe staff com o e-mail ${credentials.email}. ` +
            'Use outro e-mail em BOOTSTRAP_SUPER_ADMIN_EMAIL ou promova a conta pelo sistema.',
        );
        return 'email-taken';
      }
      throw error;
    }
  }
}
