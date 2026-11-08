import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { resolveProjectAccess } from '../projects/access';
import { runPullRequestReview } from './service';
import { GitHubClient } from '../github/client';
import { getGithubToken } from '../auth/service';
import { db } from '../../lib/db';

export const reviewRouter = Router();
reviewRouter.use(requireAuth);

const runSchema = z.object({
  params: z.object({ projectId: z.string().min(1) }),
  body: z.object({ prNumber: z.number().int().positive() }),
});

reviewRouter.post(
  '/projects/:projectId/reviews',
  validate(runSchema),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    const ctx = await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, projectId, [
      'OWNER',
      'ADMIN',
      'DEVELOPER',
    ]);
    const { prNumber } = (req.body ?? {}) as { prNumber: number };
    const token = (await getGithubToken((req as AuthenticatedRequest).user!.userId)) ?? process.env.GITHUB_TOKEN ?? undefined;
    const client = new GitHubClient(token);
    const pr = await client.getPullRequest(ctx.repoOwner, ctx.repoName, prNumber);

    const review = await runPullRequestReview({
      projectId,
      prNumber,
      headSha: pr.head.sha,
      title: pr.title,
      author: pr.user?.login ?? 'unknown',
      client,
    });
    res.status(202).json(review);
  }),
);

const listSchema = z.object({ params: z.object({ projectId: z.string().min(1) }) });

reviewRouter.get(
  '/projects/:projectId/reviews',
  validate(listSchema),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, projectId);
    const reviews = await db.pullRequestReview.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { comments: true } } },
    });
    res.json(reviews);
  }),
);

const getSchema = z.object({
  params: z.object({ projectId: z.string().min(1), reviewId: z.string().min(1) }),
});

reviewRouter.get(
  '/projects/:projectId/reviews/:reviewId',
  validate(getSchema),
  asyncHandler(async (req, res) => {
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, (req.params as { projectId: string }).projectId);
    const review = await db.pullRequestReview.findUnique({
      where: { id: (req.params as { reviewId: string }).reviewId },
      include: { comments: true },
    });
    res.json(review);
  }),
);
