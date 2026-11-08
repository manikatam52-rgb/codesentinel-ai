import type { RawFinding } from './rules';
import type { Severity } from '@prisma/client';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  LOW: 2,
  MEDIUM: 6,
  HIGH: 15,
  CRITICAL: 40,
};

export interface QualityScoreResult {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    bugs: number;
    security: number;
    quality: number;
    filesAnalyzed: number;
    totalFindings: number;
    bySeverity: Record<Severity, number>;
  };
}

/**
 * Computes a 0-100 quality score from findings, normalized by code volume.
 * Deduction per finding weighted by severity, scaled by files analyzed so a
 * single trivial issue in a huge repo doesn't tank the score.
 */
export function computeQualityScore(findings: RawFinding[], filesAnalyzed: number): QualityScoreResult {
  const bySeverity: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  let deductRaw = 0;
  let bugs = 0;
  let security = 0;
  let quality = 0;

  for (const f of findings) {
    bySeverity[f.severity] += 1;
    deductRaw += SEVERITY_WEIGHT[f.severity];
    if (f.category === 'bug') bugs++;
    else if (f.category === 'security') security++;
    else quality++;
  }

  // Volume normalization: findings per file, dampened.
  const files = Math.max(filesAnalyzed, 1);
  const density = deductRaw / files; // weighted findings per file
  // Score: 100 for density 0, ~0 at density 25+.
  const score = Math.max(0, Math.min(100, Math.round(100 - density * 4)));

  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

  return { score, grade, breakdown: { bugs, security, quality, filesAnalyzed: files, totalFindings: findings.length, bySeverity } };
}

/** Classifies a severity when a rule engine isn't authoritative (fallback classifier). */
export function classifySeverity(finding: { category: string; ruleId: string }): Severity {
  if (finding.ruleId.startsWith('SEC')) {
    return finding.ruleId.endsWith('001') || finding.ruleId.endsWith('002') ? 'CRITICAL' : 'HIGH';
  }
  if (finding.ruleId.startsWith('BUG')) return 'MEDIUM';
  return 'LOW';
}
