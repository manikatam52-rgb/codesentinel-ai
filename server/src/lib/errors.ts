export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export const BadRequestError = (message = 'Bad request', details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const UnauthorizedError = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const ForbiddenError = (message = 'Insufficient permissions') =>
  new AppError(403, 'FORBIDDEN', message);

export const NotFoundError = (message = 'Resource not found') =>
  new AppError(404, 'NOT_FOUND', message);

export const ConflictError = (message = 'Resource already exists') =>
  new AppError(409, 'CONFLICT', message);
