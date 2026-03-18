import { NextResponse } from 'next/server'

export enum ErrorCode {
  // Client errors
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',

  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  AGENT_SERVICE_UNREACHABLE = 'AGENT_SERVICE_UNREACHABLE',
  AGENT_SERVICE_ERROR = 'AGENT_SERVICE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  STREAM_ERROR = 'STREAM_ERROR',
}

const HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.VALIDATION_ERROR]: 422,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.AGENT_SERVICE_UNREACHABLE]: 503,
  [ErrorCode.AGENT_SERVICE_ERROR]: 502,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.STREAM_ERROR]: 500,
}

interface ErrorResponseBody {
  error: {
    code: ErrorCode
    message: string
    details?: unknown
    requestId?: string
  }
}

/**
 * Create a structured JSON error response.
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  options?: { details?: unknown; requestId?: string }
): NextResponse<ErrorResponseBody> {
  const status = HTTP_STATUS[code] || 500
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(options?.details !== undefined && { details: options.details }),
        ...(options?.requestId && { requestId: options.requestId }),
      },
    },
    { status }
  )
}

/**
 * Helper to get requestId from request headers (set by middleware).
 */
export function getRequestId(request: Request): string | undefined {
  return request.headers.get('x-request-id') ?? undefined
}
