import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.logLevel,
  base: { service: 'codesentinel-api' },
  redact: ['req.headers.authorization', 'password', 'passwordHash', 'token'],
});

export const childLogger = (bindings: Record<string, unknown>) => logger.child(bindings);
