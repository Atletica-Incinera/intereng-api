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
    return request(app.getHttpServer()).get('/api/v1').expect(200).expect({ data: 'Hello World!' });
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ data: { status: 'ok' } });
  });

  it('/api/v1/test-pagination (GET) - valid pagination params conversion', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test-pagination?page=2&pageSize=10')
      .expect(200)
      .expect({
        data: {
          page: 2,
          pageSize: 10,
        },
      });
  });

  it('/api/v1/test-pagination (GET) - default values when parameters are omitted', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test-pagination')
      .expect(200)
      .expect({
        data: {
          page: 1,
          pageSize: 20,
        },
      });
  });

  it('/api/v1/test-pagination (GET) - validation error for page less than 1', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test-pagination?page=0')
      .expect(400)
      .expect((res) => {
        expect(res.body).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Erro de validação nos campos enviados.',
            details: [
              {
                field: 'page',
                issue: 'page must not be less than 1',
              },
            ],
          },
        });
      });
  });

  it('/api/v1/test-pagination (GET) - validation error for pageSize greater than 100', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test-pagination?pageSize=150')
      .expect(400)
      .expect((res) => {
        expect(res.body).toEqual({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Erro de validação nos campos enviados.',
            details: [
              {
                field: 'pageSize',
                issue: 'pageSize must not be greater than 100',
              },
            ],
          },
        });
      });
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
            message: 'Conflito de dados. Um registro com esses dados já existe.',
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

  it('/api/v1/test-request-context (GET) - generates and returns x-request-id header and body', () => {
    return request(app.getHttpServer())
      .get('/api/v1/test-request-context')
      .expect(200)
      .expect((res) => {
        const body = res.body as { data?: { requestId?: string } };
        expect(res.headers['x-request-id']).toBeDefined();
        expect(body.data?.requestId).toBe(res.headers['x-request-id']);
      });
  });

  it('/api/v1/test-request-context (GET) - propagates custom x-request-id header from request to response', () => {
    const customId = 'my-custom-request-id-12345';
    return request(app.getHttpServer())
      .get('/api/v1/test-request-context')
      .set('x-request-id', customId)
      .expect(200)
      .expect((res) => {
        const body = res.body as { data?: { requestId?: string } };
        expect(res.headers['x-request-id']).toBe(customId);
        expect(body.data?.requestId).toBe(customId);
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
