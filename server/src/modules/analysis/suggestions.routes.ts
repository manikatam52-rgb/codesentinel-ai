import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/asyncHandler';
import { resolveProjectAccess } from '../projects/access';
import { getAiSuggestions } from './aiClient';
import { db } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';

export const suggestionRouter = Router();
suggestionRouter.use(requireAuth);

const schema = z.object({
  params: z.object({ analysisId: z.string().min(1) }),
});

/** AI improvement suggestions for the findings of a completed analysis. */
suggestionRouter.get(
  '/analyses/:analysisId/suggestions',
  validate(schema),
  asyncHandler(async (req, res) => {
    const analysisId = (req.params as { analysisId: string }).analysisId;
    const analysis = await db.analysis.findUnique({
      where: { id: analysisId },
      include: { findings: { take: 40, orderBy: { severity: 'desc' } }, project: { select: { id: true } } },
    });
    if (!analysis) throw NotFoundError('Analysis not found');

    await resolveProjectAccess((req as AuthenticatedRequest).user!.userId, analysis.project.id);

    const suggestions = await getAiSuggestions({
      code: '', // findings carry enough context for suggestions
      language: 'typescript',
      findings: analysis.findings.map((f) => ({
        ruleId: f.ruleId,
        title: f.title,
        description: f.description,
        severity: f.severity,
        line: f.line,
      })),
    });

    res.json({ analysisId, suggestions });
  }),
);
