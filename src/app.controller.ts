import { Controller, Get, NotFoundException } from '@nestjs/common';
import { AppService } from './app.service';
import { Prisma } from '@prisma/client';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  @Get('test-not-found')
  testNotFound() {
    throw new NotFoundException('Recurso não encontrado');
  }

  @Get('test-prisma-unique')
  testPrismaUnique() {
    throw new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (email)',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['email'] },
      },
    );
  }
}
