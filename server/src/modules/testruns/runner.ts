import { spawn } from 'child_process';
import { db } from '../../lib/db';
import { childLogger } from '../../lib/logger';
import { NotFoundError } from '../../lib/errors';

const log = childLogger({ module: 'test-runner' });

export interface TestRunResult {
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  log: string;
}

/**
 * Parses JSON output from common test runners (jest --json, pytest --json-report,
 * go test -json simplified). Falls back to regex counting.
 */
export function parseTestOutput(stdout: string): Omit<TestRunResult, 'log'> {
  // Jest JSON
  const jsonMatch = stdout.match(/\{"numTotalTests":[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      return {
        passed: data.numPassedTests ?? 0,
        failed: data.numFailedTests ?? 0,
        skipped: data.numPendingTests ?? 0,
        durationMs: Math.round(data.testResults?.reduce?.((s: number, r: { perfStats?: { runtime?: number } }) => s + (r.perfStats?.runtime ?? 0), 0) ?? 0),
      };
    } catch {
      /* fall through */
    }
  }
  // pytest-json-report
  try {
    const data = JSON.parse(stdout);
    if (data?.summary && typeof data.summary.passed !== 'undefined') {
      return {
        passed: data.summary.passed ?? 0,
        failed: (data.summary.failed ?? 0) + (data.summary.error ?? 0),
        skipped: data.summary.skipped ?? 0,
        durationMs: Math.round((data.duration ?? 0) * 1000),
      };
    }
  } catch {
    /* fall through */
  }
  // Regex fallback
  const passed = (stdout.match(/(\d+)\s+(?:passed|passing|PASS)/g) ?? []).reduce((s, m) => s + parseInt(m, 10) || 0, 0);
  const failed = (stdout.match(/(\d+)\s+(?:failed|failing|FAIL)/g) ?? []).reduce((s, m) => s + parseInt(m, 10) || 0, 0);
  const skipped = (stdout.match(/(\d+)\s+(?:skipped|pending)/g) ?? []).reduce((s, m) => s + parseInt(m, 10) || 0, 0);
  return { passed, failed, skipped, durationMs: 0 };
}

/** Executes a command with a hard timeout and captured output. */
export function execCommand(cmd: string, args: string[], cwd: string, timeoutMs = 10 * 60 * 1000): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, CI: '1' }, shell: process.platform === 'win32' });
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stdout += d.toString()));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, code });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      stdout += String(err);
      resolve({ stdout, code: 1 });
    });
  });
}

/**
 * Runs tests for an analysis. Requires a local clone path of the repository
 * (the analysis pipeline clones repos into WORKSPACE_DIR).
 */
export async function runTestsForAnalysis(analysisId: string, clonePath: string): Promise<TestRunResult> {
  const analysis = await db.analysis.findUnique({ where: { id: analysisId } });
  if (!analysis) throw NotFoundError('Analysis not found');

  // Detect the test runner from files in the clone
  const commands = detectTestCommand(clonePath);
  let result: TestRunResult = { passed: 0, failed: 0, skipped: 0, durationMs: 0, log: 'No test runner detected' };

  for (const { cmd, args } of commands) {
    log.info({ cmd, args }, 'Running tests');
    const { stdout } = await execCommand(cmd, args, clonePath);
    const parsed = parseTestOutput(stdout);
    result = { ...parsed, log: stdout.slice(-50_000) };
    if (parsed.passed > 0 || parsed.failed > 0) break;
  }

  await db.testRun.create({ data: { analysisId, passed: result.passed, failed: result.failed, skipped: result.skipped, durationMs: result.durationMs, log: result.log } });
  return result;
}

function detectTestCommand(clonePath: string): { cmd: string; args: string[] }[] {
  const fs = require('fs') as typeof import('fs');
  const cmds: { cmd: string; args: string[] }[] = [];
  if (fs.existsSync(`${clonePath}/package.json`)) {
    cmds.push({ cmd: 'npm', args: ['test', '--', '--json', '--outputFile=', '--passWithNoTests'] });
  }
  if (fs.existsSync(`${clonePath}/requirements.txt`) || fs.existsSync(`${clonePath}/pyproject.toml`)) {
    cmds.push({ cmd: process.platform === 'win32' ? 'python' : 'python3', args: ['-m', 'pytest', '--json-report', '--json-report-file=report.json', '-q'] });
  }
  if (fs.existsSync(`${clonePath}/go.mod`)) {
    cmds.push({ cmd: 'go', args: ['test', './...'] });
  }
  return cmds;
}
