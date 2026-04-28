import type { FastifyInstance, FastifyReply } from 'fastify';

export type ApiErrorCode =
  | 'invalid-date'
  | 'invalid-hour'
  | 'missing-version'
  | 'unknown-version'
  | 'unsupported-version'
  | 'missa-only-version'
  | 'invalid-language'
  | 'invalid-query-value'
  | 'composition-error'
  | 'not-found'
  | 'internal-error';

export interface ApiErrorBody {
  readonly kind: 'error';
  readonly apiVersion: 'v1';
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  readonly hints?: readonly string[];
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  readonly hints?: readonly string[];

  constructor(params: {
    readonly statusCode: number;
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly details?: Readonly<Record<string, string | number | boolean | null>>;
    readonly hints?: readonly string[];
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.details = params.details;
    this.hints = params.hints;
  }

  toBody(): ApiErrorBody {
    return {
      kind: 'error',
      apiVersion: 'v1',
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
      ...(this.hints ? { hints: this.hints } : {})
    };
  }
}

export function invalidLanguage(message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: 'invalid-language',
    message
  });
}

export function invalidQueryValue(field: string, message: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: 'invalid-query-value',
    message,
    details: { field }
  });
}

export function invalidDate(value: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: 'invalid-date',
    message: `Invalid date: ${value}`,
    details: { date: value }
  });
}

export function invalidHour(value: string): ApiError {
  return new ApiError({
    statusCode: 400,
    code: 'invalid-hour',
    message: `Invalid hour: ${value}`,
    details: { hour: value }
  });
}

export function compositionError(message: string): ApiError {
  return new ApiError({
    statusCode: 422,
    code: 'composition-error',
    message
  });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error, _request, reply: FastifyReply) => {
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send(error.toBody());
      return;
    }

    reply.code(500).send({
      kind: 'error',
      apiVersion: 'v1',
      code: 'internal-error',
      message: 'Internal server error'
    } satisfies ApiErrorBody);
  });
}
