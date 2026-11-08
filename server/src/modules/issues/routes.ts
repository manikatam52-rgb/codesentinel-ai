import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { resolveProjectAccess } from '../projects/access';
import { db } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';

export const issueRouter = Router();
issueRouter.use(requireAuth);

const createSchema = z.object({
  params: z.object({ projectId: z.string().min(1) }),
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).default(''),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    filePath: z.string().max(500).optional(),
    line: z.number().int().nonnegative().optional(),
    assigneeId: z.string().optional(),
  }),
});

issueRouter.post(
  '/projects/:projectId/issues',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, projectId, ['OWNER', 'ADMIN', 'DEVELOPER']);
    const issue = await db.issue.create({ data: { projectId, ...req.body } });
    res.status(201).json(issue);
  }),
);

const listSchema = z.object({
  params: z.object({ projectId: z.string().min(1) }),
  query: z
    .object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    })
    .optional(),
});

issueRouter.get(
  '/projects/:projectId/issues',
  validate(listSchema),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, projectId);
    const { status, severity } = (req.query ?? {}) as { status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'; severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' };
    const issues = await db.issue.findMany({
      where: { projectId, ...(status ? { status } : {}), ...(severity ? { severity } : {}) },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });
    res.json(issues);
  }),
);

const updateSchema = z.object({
  params: z.object({ projectId: z.string().min(1), issueId: z.string().min(1) }),
  body: z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    assigneeId: z.string().nullable().optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
  }),
});

issueRouter.patch(
  '/projects/:projectId/issues/:issueId',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, (req.params as { projectId: string }).projectId, [
      'OWNER',
      'ADMIN',
      'DEVELOPER',
    ]);
    const issueId = (req.params as { issueId: string }).issueId;
    const existing = await db.issue.findUnique({ where: { id: issueId } });
    if (!existing) throw NotFoundError('Issue not found');
    const updated = await db.issue.update({ where: { id: issueId }, data: req.body });
    res.json(updated);
  }),
);

issueRouter.delete(
  '/projects/:projectId/issues/:issueId',
  asyncHandler(async (req, res) => {
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, (req.params as { projectId: string }).projectId, [
      'OWNER',
      'ADMIN',
    ]);
    const issueId = (req.params as { issueId: string }).issueId;
    await db.issue.delete({ where: { id: issueId } });
    res.status(204).end();
  }),
);
