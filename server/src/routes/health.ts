import { Router } from 'express';
import { db } from '../lib/db';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down', timestamp: new Date().toISOString() });
  }
});

healthRouter.get('/live', (_req, res) => res.json({ status: 'ok' }));
