import { Router } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../lib/asyncHandler';
import { GitHubClient } from './client';
import { getGithubToken } from '../auth/service';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { db } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';

export const githubRouter = Router();

githubRouter.use(requireAuth);

async function clientFor(userId: string): Promise<GitHubClient> {
  const token = (await getGithubToken(userId)) ?? process.env.GITHUB_TOKEN ?? undefined;
  return new GitHubClient(token);
}

const listSchema = z.object({ query: z.object({}).passthrough().optional() });

githubRouter.get(
  '/repos',
  validate(listSchema),
  asyncHandler(async (req, res) => {
    const client = await clientFor((req as AuthenticatedRequest).user!.userId);
    const repos = await client.listUserRepos();
    res.json(
      repos.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        owner: r.owner.login,
        name: r.name,
        private: r.private,
        defaultBranch: r.default_branch,
        language: r.language,
        stars: r.stargazers_count,
        url: r.html_url,
      })),
    );
  }),
);

const prParams = z.object({
  params: z.object({ owner: z.string().min(1), repo: z.string().min(1) }),
});

githubRouter.get(
  '/repos/:owner/:repo/pulls',
  validate(prParams),
  asyncHandler(async (req, res) => {
    const { owner, repo } = req.params as { owner: string; repo: string };
    const client = await clientFor((req as AuthenticatedRequest).user!.userId);
    const pulls = await client.listPullRequests(owner, repo);
    res.json(
      pulls.map((p) => ({
        number: p.number,
        title: p.title,
        author: p.user?.login ?? 'unknown',
        headSha: p.head.sha,
        url: p.html_url,
      })),
    );
  }),
);

const projectReposSchema = z.object({
  params: z.object({ projectId: z.string().cuid() }),
});

// List open PRs for a project the user has access to
githubRouter.get(
  '/projects/:projectId/pulls',
  validate(projectReposSchema),
  asyncHandler(async (req, res) => {
    const projectId = (req.params as { projectId: string }).projectId;
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) throw NotFoundError('Project not found');
    const membership = await db.membership.findUnique({
      where: { userId_orgId: { userId: (req as AuthenticatedRequest).user!.userId, orgId: project.orgId } },
    });
    if (!membership) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No access' } });
      return;
    }
    const client = await clientFor((req as AuthenticatedRequest).user!.userId);
    const pulls = await client.listPullRequests(project.repoOwner, project.repoName);
    res.json(
      pulls.map((p) => ({
        number: p.number,
        title: p.title,
        author: p.user?.login ?? 'unknown',
        headSha: p.head.sha,
      })),
    );
  }),
);
