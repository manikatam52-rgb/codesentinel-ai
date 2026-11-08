import { db } from '../../lib/db';
import { runRules, type RawFinding } from '../analysis/rules';
import { computeQualityScore } from '../analysis/scoring';
import { GitHubClient } from '../github/client';
import { childLogger } from '../../lib/logger';
import { NotFoundError } from '../../lib/errors';

const IGNORE_PATHS = /(^|\/)(node_modules|dist|build|\.next|vendor|__pycache__|package-lock\.json)/i;
const MAX_FILE_SIZE = 200 * 1024;

export interface ReviewInput {
  projectId: string;
  prNumber: number;
  headSha: string;
  title: string;
  author: string;
  client: GitHubClient;
}

/**
 * Automated PR review: fetches the changed files of a pull request, runs the
 * rule engine over the new contents, persists a review with inline comments
 * and posts a review summary back to GitHub.
 */
export async function runPullRequestReview(input: ReviewInput) {
  const log = childLogger({ module: 'pr-review', projectId: input.projectId, pr: input.prNumber });

  const project = await db.project.findUnique({ where: { id: input.projectId } });
  if (!project) throw NotFoundError('Project not found');

  const review = await db.pullRequestReview.upsert({
    where: { projectId_prNumber_headSha: {
      projectId: input.projectId,
      prNumber: input.prNumber,
      headSha: input.headSha,
    } },
    create: {
      projectId: input.projectId,
      prNumber: input.prNumber,
      headSha: input.headSha,
      title: input.title,
      author: input.author,
      status: 'RUNNING' as never,
    },
    update: { status: 'RUNNING' as never },
  });

  try {
    const files = await input.client.listPullRequestFiles(project.repoOwner, project.repoName, input.prNumber);
    const findings: RawFinding[] = [];

    for (const file of files) {
      if (IGNORE_PATHS.test(file.path) || (file.size ?? 0) > MAX_FILE_SIZE) continue;
      const patch = (file as unknown as { patch?: string }).patch;
      if (!patch) continue;

      // Analyze full new content when cheaply available, else the patch itself
      const source = await input.client
        .getFileContent(project.repoOwner, project.repoName, file.path, input.headSha)
        .catch(() => null);

      const target = source ?? patch;
      const patchLines = new Set(parsePatchLineNumbers(patch));
      const fileFindings = runRules(file.path, target).filter((f) => patchLines.has(f.line) || !source);
      findings.push(...(fileFindings.length ? fileFindings : []));
    }

    const scored = computeQualityScore(findings, files.length);
    const summary = buildSummary(input.title, findings, scored);

    const comments = findings.slice(0, 30).map((f) => ({
      filePath: f.filePath,
      line: f.line,
      severity: f.severity,
      body: `**[${f.ruleId}] ${f.title}** (${f.severity})\n\n${f.description}\n\n💡 ${f.suggestion ?? ''}`,
    }));

    const completed = await db.pullRequestReview.update({
      where: { id: review.id },
      data: {
        status: 'COMPLETED',
        qualityScore: scored.score,
        summary,
        completedAt: new Date(),
        comments: { create: comments },
      },
      include: { comments: true },
    });

    // Best-effort: post the summary comment to GitHub
    await input.client
      .createReview(project.repoOwner, project.repoName, input.prNumber, summary)
      .catch((err) => log.warn({ err }, 'Could not post review to GitHub (missing permissions?)'));

    log.info({ score: scored.score, findings: findings.length }, 'PR review completed');
    return completed;
  } catch (err) {
    await db.pullRequestReview
      .update({ where: { id: review.id }, data: { status: 'FAILED', summary: `Review failed: ${String(err)}` } })
      .catch(() => {});
    log.error({ err }, 'PR review failed');
    throw err;
  }
}

/** Extracts new-file line numbers from a unified diff patch. */
export function parsePatchLineNumbers(patch: string): number[] {
  const lines: number[] = [];
  let newLine = 0;
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = parseInt(hunk[1], 10);
      continue;
    }
    if (!newLine) continue;
    if (line.startsWith('+')) lines.push(newLine++);
    else if (line.startsWith('-')) continue;
    else if (line.startsWith(' ') || line === '') newLine++;
  }
  return lines;
}

function buildSummary(title: string, findings: RawFinding[], scored: ReturnType<typeof computeQualityScore>): string {
  const lines = [
    `## 🤖 CodeSentinel AI Review — ${title}`,
    '',
    `**Quality score:** ${scored.score}/100 (grade ${scored.grade})`,
    `**Findings:** ${scored.breakdown.totalFindings} (🚨 ${scored.breakdown.bySeverity.CRITICAL} critical · ⚠️ ${scored.breakdown.bySeverity.HIGH} high · ${scored.breakdown.bySeverity.MEDIUM} medium · ${scored.breakdown.bySeverity.LOW} low)`,
    '',
    '### Categories',
    `- 🐛 Bugs: ${scored.breakdown.bugs}`,
    `- 🔒 Security: ${scored.breakdown.security}`,
    `- ✨ Quality: ${scored.breakdown.quality}`,
    '',
    findings.length === 0
      ? '✅ No issues detected by the automated rule engine. Nice work!'
      : '### Top findings\n' +
        findings
          .slice(0, 10)
          .map((f) => `- \`${f.filePath}:${f.line}\` **${f.severity}** — ${f.title}`)
          .join('\n'),
    '',
    '_Automated review by CodeSentinel AI_',
  ];
  return lines.join('\n');
}
