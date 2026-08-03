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

  @Get('test-prisma-not-found')
  testPrismaNotFound() {
    throw new Prisma.PrismaClientKnownRequestError(
      'An operation failed because it depends on one or more records that were required but not found.',
      {
        code: 'P2025',
        clientVersion: '5.22.0',
      },
    );
  }

  @Get('test-prisma-fk')
  testPrismaFk() {
    throw new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on the database.',
      {
        code: 'P2003',
        clientVersion: '5.22.0',
        meta: { field_name: 'competitionId' },
      },
    );
  }
}
