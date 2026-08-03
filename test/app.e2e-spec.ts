import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect({ data: 'Hello World!' });
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ data: { status: 'ok' } });
  });

  it('/api/v1/test-not-found (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test-not-found')
      .expect(404)
      .expect((res) => {
        expect(res.body).toEqual({
          error: {
            code: 'NOT_FOUND',
            message: 'Recurso não encontrado',
          },
        });
      });
  });

  it('/api/v1/test-prisma-unique (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test-prisma-unique')
      .expect(409)
      .expect((res) => {
        expect(res.body).toEqual({
          error: {
            code: 'CONFLICT',
            message:
              'Conflito de dados. Um registro com esses dados já existe.',
            details: [
              {
                field: 'email',
                issue: 'must be unique',
              },
            ],
          },
        });
      });
  });

  it('/api/v1/test-prisma-not-found (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test-prisma-not-found')
      .expect(404)
      .expect((res) => {
        expect(res.body).toEqual({
          error: {
            code: 'NOT_FOUND',
            message: 'O registro solicitado não foi encontrado.',
          },
        });
      });
  });

  it('/api/v1/test-prisma-fk (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test-prisma-fk')
      .expect(409)
      .expect((res) => {
        expect(res.body).toEqual({
          error: {
            code: 'CONFLICT',
            message:
              'Erro de integridade referencial. Um registro relacionado obrigatório não foi encontrado ou existe uma dependência ativa.',
            details: [
              {
                field: 'competitionId',
                issue: 'foreign key constraint failed',
              },
            ],
          },
        });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
