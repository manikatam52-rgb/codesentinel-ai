import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { resolveProjectAccess } from '../projects/access';
import { db } from '../../lib/db';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

/**
 * Aggregated developer/project analytics: score trend, severity mix,
 * issue throughput, most offending files, top rule triggers.
 */
analyticsRouter.get(
  '/projects/:projectId/analytics',
  validate(z.object({ params: z.object({ projectId: z.string().min(1) }) })),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, projectId);

    const [analyses, issues, reviews, severityCounts, categoryCounts, topFiles, topRules] = await Promise.all([
      db.analysis.findMany({
        where: { projectId, status: 'COMPLETED' },
        orderBy: { startedAt: 'asc' },
        take: 30,
        select: { id: true, qualityScore: true, startedAt: true, commitSha: true },
      }),
      db.issue.groupBy({ by: ['status'], where: { projectId }, _count: true }),
      db.pullRequestReview.aggregate({ where: { projectId }, _count: true, _avg: { qualityScore: true } }),
      db.finding.groupBy({ by: ['severity'], where: { analysis: { projectId } }, _count: true }),
      db.finding.groupBy({ by: ['category'], where: { analysis: { projectId } }, _count: true }),
      db.finding.groupBy({ by: ['filePath'], where: { analysis: { projectId } }, _count: true, orderBy: { _count: { filePath: 'desc' } }, take: 10 }),
      db.finding.groupBy({ by: ['ruleId'], where: { analysis: { projectId } }, _count: true, orderBy: { _count: { ruleId: 'desc' } }, take: 10 }),
    ]);

    res.json({
      scoreTrend: analyses.map((a: { startedAt: Date; qualityScore: number | null; commitSha: string }) => ({
        date: a.startedAt,
        score: a.qualityScore,
        commit: a.commitSha,
      })),
      currentScore: analyses.at(-1)?.qualityScore ?? null,
      issues: Object.fromEntries(issues.map((i: { status: string; _count: number }) => [i.status, i._count])),
      reviews: { total: reviews._count, avgScore: reviews._avg.qualityScore },
      severity: Object.fromEntries(severityCounts.map((s: { severity: string; _count: number }) => [s.severity, s._count])),
      categories: Object.fromEntries(categoryCounts.map((c: { category: string; _count: number }) => [c.category, c._count])),
      topFiles: topFiles.map((f: { filePath: string; _count: number }) => ({ filePath: f.filePath, count: f._count })),
      topRules: topRules.map((r: { ruleId: string; _count: number }) => ({ ruleId: r.ruleId, count: r._count })),
    });
  }),
);

/** Org-level overview across all the user's projects. */
analyticsRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.userId;
    const memberships = await db.membership.findMany({ where: { userId }, select: { orgId: true } });
    const orgIds = memberships.map((m) => m.orgId);
    const projects = await db.project.findMany({
      where: { orgId: { in: orgIds } },
      select: { id: true, name: true, repoOwner: true, repoName: true },
    });
    const projectIds = projects.map((p) => p.id);

    const [openIssues, totalFindings, latestAnalyses, completedReviews] = await Promise.all([
      db.issue.count({ where: { projectId: { in: projectIds }, status: { not: 'RESOLVED' } } }),
      db.finding.count({ where: { analysis: { projectId: { in: projectIds } } } }),
      db.analysis.findMany({
        where: { projectId: { in: projectIds }, status: 'COMPLETED' },
        orderBy: { startedAt: 'desc' },
        distinct: ['projectId'],
        take: projectIds.length,
        select: { projectId: true, qualityScore: true, startedAt: true },
      }),
      db.pullRequestReview.count({ where: { projectId: { in: projectIds }, status: 'COMPLETED' } }),
    ]);

    const avgScore =
      latestAnalyses.length > 0
        ? Math.round(latestAnalyses.reduce((s, a) => s + (a.qualityScore ?? 0), 0) / latestAnalyses.length)
        : null;

    res.json({
      projects: projects.map((p) => ({
        ...p,
        score: latestAnalyses.find((a) => a.projectId === p.id)?.qualityScore ?? null,
      })),
      totals: { projects: projects.length, openIssues, totalFindings, completedReviews, avgScore },
    });
  }),
);
