import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { db } from '../../lib/db';
import { GitHubClient } from '../github/client';
import { getGithubToken } from '../auth/service';
import { NotFoundError, ForbiddenError } from '../../lib/errors';

export const projectRouter = Router();
projectRouter.use(requireAuth);

const createSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    repoOwner: z.string().min(1).max(120).regex(/^[A-Za-z0-9_.-]+$/, 'Invalid GitHub owner'),
    repoName: z.string().min(1).max(120).regex(/^[A-Za-z0-9_.-]+$/, 'Invalid GitHub repo name'),
    defaultBranch: z.string().max(200).default('main'),
  }),
});

projectRouter.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.userId;
    // Use the user's primary org (first membership)
    const membership = await db.membership.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    if (!membership) throw ForbiddenError('No organization membership found');

    // Verify the repository exists & is accessible
    const token = (await getGithubToken(userId)) ?? process.env.GITHUB_TOKEN ?? undefined;
    const client = new GitHubClient(token);
    await client.getRepo((req.body as { repoOwner: string }).repoOwner, (req.body as { repoName: string }).repoName);

    const project = await db.project.create({ data: { orgId: membership.orgId, ...req.body } });
    res.status(201).json(project);
  }),
);

projectRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.userId;
    const memberships = await db.membership.findMany({ where: { userId }, select: { orgId: true } });
    const projects = await db.project.findMany({
      where: { orgId: { in: memberships.map((m) => m.orgId) } },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { analyses: true, issues: true, reviews: true } },
        analyses: { orderBy: { startedAt: 'desc' }, take: 1, select: { qualityScore: true, status: true } },
      },
    });
    res.json(projects);
  }),
);

const getSchema = z.object({ params: z.object({ projectId: z.string().min(1) }) });

projectRouter.get(
  '/:projectId',
  validate(getSchema),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    const userId = (req as AuthenticatedRequest).user!.userId;
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        analyses: { orderBy: { startedAt: 'desc' }, take: 10 },
        reviews: { orderBy: { createdAt: 'desc' }, take: 10 },
        issues: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!project) throw NotFoundError('Project not found');
    const membership = await db.membership.findUnique({
      where: { userId_orgId: { userId, orgId: project.orgId } },
    });
    if (!membership) throw ForbiddenError('No access to this project');
    res.json(project);
  }),
);
