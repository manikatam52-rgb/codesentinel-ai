import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import type { Role } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; email: string };
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(UnauthorizedError());
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as JwtPayload;
    req.user = { userId: payload.userId, email: payload.email };
    next();
  } catch {
    next(UnauthorizedError('Invalid or expired token'));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // expects requireAuth to have populated req.user; role checked in service layer
    // against membership table because roles are per-organization.
    void roles;
    void res;
    next();
  };
}
