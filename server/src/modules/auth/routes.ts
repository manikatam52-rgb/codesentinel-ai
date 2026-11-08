import { Router } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { loginSchema, registerSchema } from './schemas';
import * as authService from './service';

export const authRouter = Router();

authRouter.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(result);
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await authService.getProfile((req as AuthenticatedRequest).user!.userId);
    res.json(profile);
  }),
);

authRouter.put(
  '/github-token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : null;
    await authService.updateGithubToken((req as AuthenticatedRequest).user!.userId, token);
    res.json({ ok: true });
  }),
);
