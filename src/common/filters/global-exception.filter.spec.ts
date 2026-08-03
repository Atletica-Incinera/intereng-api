import {
  ArgumentsHost,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { Logger } from 'nestjs-pino';
import { GlobalExceptionFilter } from './global-exception.filter';

// Exceção customizada herdada de HttpException para testar prototype chain resolution
class CustomHttpException extends HttpException {
  constructor(message: string, status: number) {
    super(message, status);
  }
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockArgumentsHost: ArgumentsHost;
  let mockResponse: Partial<Response>;
  let responseStatus: number;
  let mockLogger: Partial<Logger>;
  interface ExpectedErrorResponse {
    error: {
      code: string;
      message: string;
      details?: unknown[];
    };
  }
  let responseBody: ExpectedErrorResponse | null;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };

    filter = new GlobalExceptionFilter(mockLogger as Logger);
    responseStatus = 0;
    responseBody = null;

    mockResponse = {
      status: jest.fn().mockImplementation((status: number) => {
        responseStatus = status;
        return mockResponse;
      }),
      json: jest.fn().mockImplementation((body: unknown) => {
        responseBody = body as ExpectedErrorResponse;
        return mockResponse;
      }),
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should map NotFoundException to 404 NOT_FOUND', () => {
    const exception = new NotFoundException('Recurso nao encontrado');

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.NOT_FOUND);
    expect(responseBody).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Recurso nao encontrado',
      },
    });
  });

  it('should resolve code using prototype chain for custom exception classes', () => {
    // CustomHttpException herda de HttpException, mas não está mapeado diretamente no map
    const exception = new CustomHttpException('Custom Forbidden', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.FORBIDDEN);
    expect(responseBody.error.code).toBe('FORBIDDEN');
  });

  it('should map validation BadRequestException array messages to 400 VALIDATION_ERROR details', () => {
    const exception = new BadRequestException({
      message: ['year must be an integer', 'name should not be empty'],
      error: 'Bad Request',
      statusCode: 400,
    });

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.BAD_REQUEST);
    expect(responseBody).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Erro de validação nos campos enviados.',
        details: [
          { field: 'year', issue: 'year must be an integer' },
          { field: 'name', issue: 'name should not be empty' },
        ],
      },
    });
  });

  it('should fall back to status codes in switch mapping when exception code is not in map', () => {
    // HttpException genérico com status 401
    const exception = new HttpException('Access Denied', HttpStatus.UNAUTHORIZED);

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.UNAUTHORIZED);
    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('should handle HttpException with string payload response', () => {
    const exception = new HttpException('Plain string error message', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.BAD_REQUEST);
    expect(responseBody).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Plain string error message',
      },
    });
  });

  it('should handle HttpException with object response that lacks a message property', () => {
    const exception = new HttpException({ details: ['some info'] }, HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.BAD_REQUEST);
    expect(responseBody).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Http Exception',
        details: ['some info'],
      },
    });
  });

  it('should fallback to status-based code mapping when status is NOT_FOUND', () => {
    const exception = new HttpException('Plain not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.NOT_FOUND);
    expect(responseBody.error.code).toBe('NOT_FOUND');
  });

  it('should fallback to status-based code mapping when status is CONFLICT', () => {
    const exception = new HttpException('Plain conflict', HttpStatus.CONFLICT);

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.CONFLICT);
    expect(responseBody.error.code).toBe('CONFLICT');
  });

  it('should fallback to exception message when resContent is boolean or other primitive types', () => {
    const exception = new HttpException(
      true as unknown as Record<string, any>,
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.BAD_REQUEST);
    expect(responseBody.error.message).toBe('Http Exception');
  });

  it('should handle generic status codes in fallback switch', () => {
    const exception = new HttpException('Service Unavailable', HttpStatus.SERVICE_UNAVAILABLE);

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(responseBody.error.code).toBe('INTERNAL_ERROR');
  });

  it('should map Prisma P2002 (Unique Constraint) to 409 CONFLICT', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (email)',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['email'] },
      },
    );

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.CONFLICT);
    expect(responseBody).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Conflito de dados. Um registro com esses dados já existe.',
        details: [{ field: 'email', issue: 'must be unique' }],
      },
    });
  });

  it('should map Prisma P2025 (Record Not Found) to 404 NOT_FOUND', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Record to delete does not exist.', {
      code: 'P2025',
      clientVersion: '5.22.0',
    });

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.NOT_FOUND);
    expect(responseBody).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'O registro solicitado não foi encontrado.',
      },
    });
  });

  it('should map Prisma P2003 (Foreign Key Constraint Failed) to 409 CONFLICT', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on the field name: competitionId',
      {
        code: 'P2003',
        clientVersion: '5.22.0',
        meta: { field_name: 'competitionId' },
      },
    );

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.CONFLICT);
    expect(responseBody).toEqual({
      error: {
        code: 'CONFLICT',
        message:
          'Erro de integridade referencial. Um registro relacionado obrigatório não foi encontrado ou existe uma dependência ativa.',
        details: [{ field: 'competitionId', issue: 'foreign key constraint failed' }],
      },
    });
  });

  it('should handle unmapped Prisma exceptions as generic 500 INTERNAL_ERROR', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Unknown database error', {
      code: 'P9999',
      clientVersion: '5.22.0',
    });

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(responseBody.error.code).toBe('INTERNAL_ERROR');
    expect(responseBody.error.message).toBe('Erro na operação do banco de dados.');
  });

  it('should map standard Error to 500 INTERNAL_ERROR', () => {
    const exception = new Error('Erro inesperado');

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(responseBody).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro inesperado',
      },
    });
  });
});
