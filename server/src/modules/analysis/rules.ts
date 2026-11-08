import type { Severity } from '@prisma/client';

export interface RawFinding {
  filePath: string;
  line: number;
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  category: 'bug' | 'security' | 'quality';
  suggestion?: string;
}

export interface Rule {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  category: RawFinding['category'];
  suggestion: string;
  /** Return matching line numbers (1-based) for the given source. */
  test: (source: string) => number[];
}

const linesOf = (source: string, regex: RegExp): number[] => {
  const lines = source.split('\n');
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (regex.test(line)) hits.push(i + 1);
  });
  return hits;
};

/** Curated rule set covering bugs, security and quality across common languages. */
export const RULES: Rule[] = [
  {
    id: 'SEC-001',
    title: 'Hardcoded credential or secret',
    description: 'Possible hardcoded API key, token or password in source code.',
    severity: 'CRITICAL',
    category: 'security',
    suggestion:
      'Move the secret to an environment variable or a secrets manager. Never commit credentials to version control.',
    test: (s) =>
      linesOf(
        s,
        /(api[_-]?key|secret|password|passwd|token|auth)\s*[:=]\s*['"][A-Za-z0-9_\-/~+]{16,}['"]/i,
      ),
  },
  {
    id: 'SEC-002',
    title: 'SQL injection risk (string-built query)',
    description: 'SQL query appears to be built by concatenating variables, which allows SQL injection.',
    severity: 'CRITICAL',
    category: 'security',
    suggestion: 'Use parameterized queries or an ORM (Prisma, SQLAlchemy) with bound parameters.',
    test: (s) =>
      linesOf(s, /(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)[^\n;]*['"`]\s*\+|execute\(\s*f?['"`].*(?:SELECT|INSERT|UPDATE|DELETE)/i),
  },
  {
    id: 'SEC-003',
    title: 'Use of eval() / exec()',
    description: 'eval or exec executes arbitrary code and is a common vector for code injection.',
    severity: 'HIGH',
    category: 'security',
    suggestion: 'Refactor to avoid dynamic evaluation; use safer parsing (JSON.parse, ast.literal_eval of validated input).',
    test: (s) => linesOf(s, /\b(evals?\s*\(|exec\s*\()/),
  },
  {
    id: 'SEC-004',
    title: 'TLS verification disabled',
    description: 'Certificate verification disabled (verify=False, rejectUnauthorized:false, check=False).',
    severity: 'HIGH',
    category: 'security',
    suggestion: 'Keep TLS verification enabled; pin certificates or configure a trust store if needed.',
    test: (s) => linesOf(s, /(verify\s*=\s*False|rejectUnauthorized\s*:\s*false|ssl_verify\s*=\s*false|check\s*=\s*False)/i),
  },
  {
    id: 'SEC-005',
    title: 'Weak cryptographic hash',
    description: 'Use of MD5 or SHA1 for security purposes is considered broken.',
    severity: 'MEDIUM',
    category: 'security',
    suggestion: 'Use bcrypt, scrypt, argon2 for passwords, or SHA-256+ for digests.',
    test: (s) => linesOf(s, /\b(md5|sha1)\s*\(/i),
  },
  {
    id: 'SEC-006',
    title: 'Dangerous deserialization',
    description: 'Pickle/yaml.load on untrusted input can execute arbitrary code.',
    severity: 'HIGH',
    category: 'security',
    suggestion: 'Use json, or yaml.safe_load; avoid pickle for untrusted data.',
    test: (s) => linesOf(s, /(pickle\.loads?\s*\(|yaml\.load\s*\((?![^)]*Loader))/),
  },
  {
    id: 'BUG-001',
    title: 'Ignored promise rejection',
    description: 'A promise appears to be created without await or .catch, swallowing rejections.',
    severity: 'MEDIUM',
    category: 'bug',
    suggestion: 'Await the promise or attach a .catch handler.',
    test: (s) => linesOf(s, /^\s*(?:const|let)?\s*\w*\s*=\s*(?!await\s)(?!.*\.(?:then|catch|finally)\s*\()[\w.]+\(.*\)\s*;?\s*\/\/\s*eslint-disable/),
  },
  {
    id: 'BUG-002',
    title: 'Catch block swallows error silently',
    description: 'Empty catch/except block hides failures making debugging hard.',
    severity: 'MEDIUM',
    category: 'bug',
    suggestion: 'Log the error or rethrow; never leave catch bodies empty.',
    test: (s) => linesOf(s, /(catch\s*\([^)]*\)\s*\{\s*\}|except\s*[^:]*:\s*pass)/),
  },
  {
    id: 'BUG-003',
    title: 'Loose equality with null/undefined risk',
    description: 'Use of == can cause coercion bugs; prefer === / !==.',
    severity: 'LOW',
    category: 'bug',
    suggestion: 'Use strict equality operators.',
    test: (s) => linesOf(s, /[=!]==?/),
  },
  {
    id: 'BUG-004',
    title: 'Mutation after shared-state assignment',
    description: 'Module-level mutable shared state (let x = [] / {}) is prone to cross-request leaks in servers.',
    severity: 'MEDIUM',
    category: 'bug',
    suggestion: 'Create state per request/handler; avoid module-level mutable variables.',
    test: (s) => linesOf(s, /^(let|var)\s+\w+\s*=\s*(\[\]|\{\})\s*;?\s*$/),
  },
  {
    id: 'BUG-005',
    title: 'Bare except or broad catch',
    description: 'Catching all exceptions (except: / catch (e) {}) without handling hides real bugs.',
    severity: 'LOW',
    category: 'bug',
    suggestion: 'Catch specific exception types and handle them.',
    test: (s) => linesOf(s, /(except\s*:|catch\s*\(\s*\)\s*\{|catch\s*\{\s*$)/),
  },
  {
    id: 'BUG-006',
    title: 'Infinite loop without break/timeout',
    description: 'while True / while(true) loops should have a guard or cancellation mechanism.',
    severity: 'MEDIUM',
    category: 'bug',
    suggestion: 'Add a maximum iteration count or cancellation check.',
    test: (s) => linesOf(s, /while\s*(True|true)\s*[:{]?/),
  },
  {
    id: 'BUG-007',
    title: 'Off-by-one risk: <= in loop bound with .length',
    description: 'Loop condition `i <= arr.length` reads one past the end.',
    severity: 'MEDIUM',
    category: 'bug',
    suggestion: 'Use `<` instead of `<=` when indexing from 0.',
    test: (s) => linesOf(s, /<=\s*\w+\.length\b/),
  },
  {
    id: 'QUAL-001',
    title: 'Very long function body',
    description: 'Functions longer than ~80 lines are hard to test and review.',
    severity: 'LOW',
    category: 'quality',
    suggestion: 'Extract cohesive blocks into smaller named functions.',
    test: detectLongFunctions,
  },
  {
    id: 'QUAL-002',
    title: 'TODO / FIXME left in code',
    description: 'Unresolved TODO/FIXME comments indicate incomplete work.',
    severity: 'LOW',
    category: 'quality',
    suggestion: 'Resolve or convert to tracked issues.',
    test: (s) => linesOf(s, /(TODO|FIXME|HACK|XXX)\b/),
  },
  {
    id: 'QUAL-003',
    title: 'Console/print debugging left in code',
    description: 'Debug output left in production code paths.',
    severity: 'LOW',
    category: 'quality',
    suggestion: 'Replace with a structured logger.',
    test: (s) => linesOf(s, /^\s*console\.(log|debug|info)\s*\(|^\s*print\s*\(/),
  },
  {
    id: 'QUAL-004',
    title: 'Nested callbacks (callback hell) or very deep indentation',
    description: 'Deeply nested code reduces readability and increases bug risk.',
    severity: 'LOW',
    category: 'quality',
    suggestion: 'Use async/await or early returns to flatten control flow.',
    test: (s) =>
      s
        .split('\n')
        .map((line, i) => (line.match(/^(?:\t| {8,})\S/) ? i + 1 : 0))
        .filter(Boolean),
  },
  {
    id: 'QUAL-005',
    title: 'Duplicated magic number/string',
    description: 'The same literal appears many times; extract to a named constant.',
    severity: 'LOW',
    category: 'quality',
    suggestion: 'Define a named constant for repeated literals.',
    test: detectRepeatedLiterals,
  },
];

function detectLongFunctions(source: string): number[] {
  const lines = source.split('\n');
  const starts: number[] = [];
  const fnStart = /(?:function\s+\w+|def\s+\w+|=>\s*\{|(?:async\s+)?\w+\s*\([^)]*\)\s*\{)/;
  let inFn = false;
  let depth = 0;
  let fnStartLine = 0;
  lines.forEach((line, i) => {
    if (!inFn && fnStart.test(line)) {
      inFn = true;
      fnStartLine = i + 1;
      depth = (line.match(/[{(:]/g) ?? []).length - (line.match(/[})]/g) ?? []).length;
      return;
    }
    if (inFn) {
      depth += (line.match(/[{(:]/g) ?? []).length - (line.match(/[})]/g) ?? []).length;
      if (depth <= 0) {
        if (i + 1 - fnStartLine > 80) starts.push(fnStartLine);
        inFn = false;
      }
    }
  });
  return starts;
}

function detectRepeatedLiterals(source: string): number[] {
  const counts = new Map<string, number[]>();
  source.split('\n').forEach((line, i) => {
    const matches = line.matchAll(/['"]([^'"\n]{3,40})['"]/g);
    for (const m of matches) {
      const key = m[1];
      if (!counts.has(key)) counts.set(key, []);
      counts.get(key)!.push(i + 1);
    }
  });
  const hits: number[] = [];
  for (const occurrences of counts.values()) {
    if (occurrences.length >= 5) hits.push(...occurrences.slice(0, 1));
  }
  return hits;
}

/** Runs all rules against one file's source. */
export function runRules(filePath: string, source: string): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const rule of RULES) {
    for (const line of rule.test(source)) {
      findings.push({
        filePath,
        line,
        ruleId: rule.id,
        title: rule.title,
        description: rule.description,
        severity: rule.severity,
        category: rule.category,
        suggestion: rule.suggestion,
      });
    }
  }
  return findings;
}
