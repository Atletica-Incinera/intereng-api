import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

interface NestErrorResponse {
  message?: string | string[];
  details?: unknown[];
}

function isNestErrorResponse(val: unknown): val is NestErrorResponse {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

type ExceptionClass = new (...args: any[]) => Error;

const EXCEPTION_CODE_MAP = new Map<ExceptionClass, string>([
  [BadRequestException, 'VALIDATION_ERROR'],
  [UnauthorizedException, 'UNAUTHORIZED'],
  [ForbiddenException, 'FORBIDDEN'],
  [NotFoundException, 'NOT_FOUND'],
  [ConflictException, 'CONFLICT'],
  [InternalServerErrorException, 'INTERNAL_ERROR'],
]);

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Ocorreu um erro interno no servidor.';
    let details: unknown[] | undefined = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resContent: unknown = exception.getResponse();

      let exceptionCode: string | undefined;
      let currentClass: unknown = exception.constructor;
      while (currentClass && currentClass !== Object) {
        if (typeof currentClass === 'function') {
          const targetClass = currentClass as ExceptionClass;
          if (EXCEPTION_CODE_MAP.has(targetClass)) {
            exceptionCode = EXCEPTION_CODE_MAP.get(targetClass);
            break;
          }
        }
        currentClass = Object.getPrototypeOf(currentClass) as unknown;
      }

      if (exceptionCode) {
        code = exceptionCode;
      } else {
        switch (status) {
          case HttpStatus.BAD_REQUEST:
            code = 'VALIDATION_ERROR';
            break;
          case HttpStatus.UNAUTHORIZED:
            code = 'UNAUTHORIZED';
            break;
          case HttpStatus.FORBIDDEN:
            code = 'FORBIDDEN';
            break;
          case HttpStatus.NOT_FOUND:
            code = 'NOT_FOUND';
            break;
          case HttpStatus.CONFLICT:
            code = 'CONFLICT';
            break;
          default:
            code = 'INTERNAL_ERROR';
        }
      }

      if (isNestErrorResponse(resContent)) {
        if (
          status === HttpStatus.BAD_REQUEST &&
          Array.isArray(resContent.message)
        ) {
          details = resContent.message.map((msg: unknown) => {
            const msgStr = String(msg);
            const firstWord = msgStr.split(' ')[0];
            return {
              field: firstWord,
              issue: msgStr,
            };
          });
          message = 'Erro de validação nos campos enviados.';
        } else if (resContent.message) {
          message = Array.isArray(resContent.message)
            ? resContent.message.join(', ')
            : String(resContent.message);
        } else {
          message = exception.message;
        }

        if (resContent.details && Array.isArray(resContent.details)) {
          details = resContent.details;
        }
      } else if (typeof resContent === 'string') {
        message = resContent;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = 'Conflito de dados. Um registro com esses dados já existe.';
        const meta = exception.meta;
        if (meta && typeof meta === 'object' && 'target' in meta) {
          const targets = meta.target;
          if (Array.isArray(targets)) {
            details = targets.map((target: unknown) => ({
              field: String(target),
              issue: 'must be unique',
            }));
          }
        }
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'O registro solicitado não foi encontrado.';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message =
          'Erro de integridade referencial. Um registro relacionado obrigatório não foi encontrado ou existe uma dependência ativa.';
        const meta = exception.meta;
        if (meta && typeof meta === 'object' && 'field_name' in meta) {
          details = [
            {
              field: String(meta.field_name),
              issue: 'foreign key constraint failed',
            },
          ];
        }
      } else {
        status = HttpStatus.BAD_REQUEST;
        code = 'BAD_REQUEST';
        message = exception.message || 'Erro na operação do banco de dados.';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    });
  }
}
