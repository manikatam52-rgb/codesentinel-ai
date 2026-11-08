import crypto from 'crypto';
import type { Request, RequestHandler, Response } from 'express';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { db } from '../../lib/db';
import { GitHubClient } from '../github/client';
import { runPullRequestReview } from '../reviews/service';

/**
 * Verifies the X-Hub-Signature-256 header using the configured webhook secret.
 * Timing-safe comparison.
 */
export function verifyGithubSignature(req: Request): boolean {
  const secret = config.githubWebhookSecret;
  if (!secret) return true; // not configured; accept (dev mode)

  const signature = req.headers['x-hub-signature-256'];
  if (typeof signature !== 'string') return false;

  const raw = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from('');
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const webhookHandler: RequestHandler = (req: Request, res) => {
  const event = req.headers['x-github-event'];
  const delivery = req.headers['x-github-delivery'];

  if (!verifyGithubSignature(req)) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } });
    return;
  }

  const payload = req.body as {
    action?: string;
    pull_request?: { number: number; head?: { sha?: string }; title?: string; user?: { login?: string } };
    repository?: { owner?: { login?: string }; name?: string };
  };

  // Persist delivery for idempotency + audit
  db.webhookEvent
    .create({
      data: {
        deliveryId: typeof delivery === 'string' ? delivery : crypto.randomUUID(),
        event: typeof event === 'string' ? event : 'unknown',
        payload: payload as object,
      },
    })
    .catch((err) => logger.error({ err }, 'Failed to persist webhook event'));

  // Respond fast, process async
  res.status(202).json({ accepted: true });

  if (event === 'pull_request' && payload.action === 'opened' && payload.repository && payload.pull_request) {
    const owner = payload.repository.owner?.login;
    const repo = payload.repository.name;
    const pr = payload.pull_request;
    const headSha = pr?.head?.sha;
    if (!owner || !headSha || !repo) return;

    void (async () => {
      try {
        const project = await db.project.findFirst({
          where: { repoOwner: owner!, repoName: repo! },
        });
        if (!project) {
          logger.info({ owner, repo }, 'Webhook for untracked repository, ignoring');
          return;
        }
        const client = new GitHubClient(config.githubToken);
        await runPullRequestReview({
          projectId: project.id,
          prNumber: pr.number,
          headSha,
          title: pr.title ?? `PR #${pr.number}`,
          author: pr.user?.login ?? 'unknown',
          client,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to process pull_request webhook');
      }
    })();
  }
};
