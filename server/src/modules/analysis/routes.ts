import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { resolveProjectAccess } from '../projects/access';
import { runAnalysis } from './service';
import { GitHubClient } from '../github/client';
import { getGithubToken } from '../auth/service';
import { db } from '../../lib/db';

export const analysisRouter = Router();
analysisRouter.use(requireAuth);

async function clientFor(userId: string): Promise<GitHubClient> {
  const token = (await getGithubToken(userId)) ?? process.env.GITHUB_TOKEN ?? undefined;
  return new GitHubClient(token);
}

const runSchema = z.object({
  params: z.object({ projectId: z.string().min(1) }),
  body: z.object({
    branch: z.string().max(200).optional(),
    commitSha: z.string().max(64).optional(),
  }),
});

analysisRouter.post(
  '/projects/:projectId/analyses',
  validate(runSchema),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, projectId, ['OWNER', 'ADMIN', 'DEVELOPER']);
    const { branch, commitSha } = (req.body ?? {}) as { branch?: string; commitSha?: string };
    const result = await runAnalysis({ projectId, branch, commitSha, client: await clientFor((req as AuthenticatedRequest).user!.userId) });
    res.status(202).json(result);
  }),
);

const listSchema = z.object({ params: z.object({ projectId: z.string().min(1) }) });

analysisRouter.get(
  '/projects/:projectId/analyses',
  validate(listSchema),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, projectId);
    const analyses = await db.analysis.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: { _count: { select: { findings: true } } },
    });
    res.json(analyses);
  }),
);

const getSchema = z.object({ params: z.object({ projectId: z.string().min(1), analysisId: z.string().min(1) }) });

analysisRouter.get(
  '/projects/:projectId/analyses/:analysisId',
  validate(getSchema),
  asyncHandler(async (req, res) => {
    const { analysisId } = req.params as { analysisId: string };
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, (req.params as { projectId: string }).projectId);
    const analysis = await db.analysis.findUnique({
      where: { id: analysisId },
      include: { findings: { orderBy: [{ severity: 'desc' }, { filePath: 'asc' }] } },
    });
    res.json(analysis);
  }),
);
