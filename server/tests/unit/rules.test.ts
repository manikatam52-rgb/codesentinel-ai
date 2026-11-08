import { describe, expect, it } from 'vitest';
import { runRules, RULES } from '../../src/modules/analysis/rules';
import { computeQualityScore } from '../../src/modules/analysis/scoring';

const code = (lines: string[]) => lines.join('\n');

describe('rule engine', () => {
  it('flags hardcoded secrets as CRITICAL security findings', () => {
    const findings = runRules('src/config.ts', code(['const apiKey = "sk-live-1234567890abcdef";']));
    const f = findings.find((x) => x.ruleId === 'SEC-001');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('CRITICAL');
    expect(f!.category).toBe('security');
    expect(f!.line).toBe(1);
  });

  it('flags string-concatenated SQL as SQL injection risk', () => {
    const findings = runRules('db.js', code(["const q = 'SELECT * FROM users WHERE id = ' + userId;"]));
    expect(findings.some((x) => x.ruleId === 'SEC-002')).toBe(true);
  });

  it('flags empty catch blocks', () => {
    const findings = runRules('a.js', code(['try { doIt(); } catch (e) {}']));
    expect(findings.some((x) => x.ruleId === 'BUG-002')).toBe(true);
  });

  it('flags off-by-one loop bound', () => {
    const findings = runRules('a.js', code(['for (let i = 0; i <= arr.length; i++) {}']));
    expect(findings.some((x) => x.ruleId === 'BUG-007')).toBe(true);
  });

  it('flags eval usage', () => {
    const findings = runRules('a.js', code(['eval(userInput);']));
    expect(findings.some((x) => x.ruleId === 'SEC-003')).toBe(true);
  });

  it('does not flag clean code', () => {
    const findings = runRules(
      'clean.ts',
      code([
        'export function add(a: number, b: number): number {',
        '  return a + b;',
        '}',
      ]),
    );
    // QUAL-003 console/print & TODO etc should not fire on this snippet
    expect(findings.filter((f) => f.ruleId.startsWith('SEC')).length).toBe(0);
    expect(findings.filter((f) => f.ruleId === 'BUG-002').length).toBe(0);
  });

  it('reports correct 1-based line numbers', () => {
    const findings = runRules('a.py', code(['import os', '', 'token = "ghp_abcdefghijklmnopqrstuvwxyz"', 'print(token)']));
    const f = findings.find((x) => x.ruleId === 'SEC-001');
    expect(f!.line).toBe(3);
  });

  it('every rule is well-formed', () => {
    for (const rule of RULES) {
      expect(rule.id).toMatch(/^(SEC|BUG|QUAL)-\d{3}$/);
      expect(rule.suggestion.length).toBeGreaterThan(10);
      expect(['bug', 'security', 'quality']).toContain(rule.category);
    }
  });
});

describe('quality scoring', () => {
  it('scores clean code 100/A', () => {
    const result = computeQualityScore([], 10);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('deducts more for critical than low severity', () => {
    const base = { filePath: 'a.ts', line: 1, ruleId: 'X', title: 't', description: 'd', category: 'quality' as const };
    const critical = computeQualityScore([{ ...base, severity: 'CRITICAL' as const }], 10);
    const low = computeQualityScore([{ ...base, severity: 'LOW' as const }], 10);
    expect(critical.score).toBeLessThan(low.score);
  });

  it('normalizes by file count', () => {
    const base = { filePath: 'a.ts', line: 1, ruleId: 'X', title: 't', description: 'd', severity: 'HIGH' as const, category: 'bug' as const };
    const small = computeQualityScore([base], 1);
    const big = computeQualityScore([base], 100);
    expect(big.score).toBeGreaterThan(small.score);
  });

  it('breakdown counts categories', () => {
    const result = computeQualityScore(
      [
        { filePath: 'a', line: 1, ruleId: 'S1', title: 't', description: 'd', severity: 'CRITICAL', category: 'security' },
        { filePath: 'a', line: 2, ruleId: 'B1', title: 't', description: 'd', severity: 'MEDIUM', category: 'bug' },
      ],
      4,
    );
    expect(result.breakdown.security).toBe(1);
    expect(result.breakdown.bugs).toBe(1);
    expect(result.breakdown.totalFindings).toBe(2);
    expect(result.breakdown.bySeverity.CRITICAL).toBe(1);
  });
});
