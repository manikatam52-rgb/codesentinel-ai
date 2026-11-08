import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { resolveProjectAccess } from '../projects/access';
import { db } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';

export const testRunRouter = Router();
testRunRouter.use(requireAuth);

testRunRouter.get(
  '/projects/:projectId/test-runs',
  validate(z.object({ params: z.object({ projectId: z.string().min(1) }) })),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, projectId);
    const runs = await db.testRun.findMany({
      where: { analysis: { projectId } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { analysis: { select: { commitSha: true, branch: true, startedAt: true } } },
    });
    res.json(runs);
  }),
);

testRunRouter.get(
  '/projects/:projectId/test-runs/:runId',
  validate(z.object({ params: z.object({ projectId: z.string().min(1), runId: z.string().min(1) }) })),
  asyncHandler(async (req, res) => {
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, (req.params as { projectId: string }).projectId);
    const run = await db.testRun.findUnique({ where: { id: (req.params as { runId: string }).runId } });
    if (!run) throw NotFoundError('Test run not found');
    res.json(run);
  }),
);
