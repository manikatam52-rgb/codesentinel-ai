import { describe, expect, it } from 'vitest';
import { parsePatchLineNumbers } from '../../src/modules/reviews/service';
import { parseTestOutput } from '../../src/modules/testruns/runner';
import { encrypt, decrypt } from '../../src/modules/auth/service';
import { verifyGithubSignatureFactory } from '../helpers/webhook';

describe('PR patch parsing', () => {
  it('extracts added line numbers from a unified diff', () => {
    const patch = [
      '@@ -10,4 +10,5 @@ context',
      ' unchanged',
      '-removed',
      '+const added1 = 1;',
      ' unchanged2',
      '+const added2 = 2;',
    ].join('\n');
    expect(parsePatchLineNumbers(patch)).toEqual([11, 13]);
  });
});

describe('test output parsing', () => {
  it('parses jest JSON output', () => {
    const out = JSON.stringify({
      numTotalTests: 10,
      numPassedTests: 8,
      numFailedTests: 1,
      numPendingTests: 1,
      testResults: [{ perfStats: { runtime: 1500 } }],
    });
    const r = parseTestOutput(`some log\n${out}\nmore log`);
    expect(r.passed).toBe(8);
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it('falls back to regex counting', () => {
    const r = parseTestOutput('Tests: 5 passed, 2 failed, 1 skipped');
    expect(r.passed).toBe(5);
    expect(r.failed).toBe(2);
    expect(r.skipped).toBe(1);
  });
});

describe('token encryption', () => {
  it('round-trips a token', () => {
    const secret = 'ghp_testtoken123456';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it('produces different ciphertexts (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });
});

describe('webhook signature verification', () => {
  it('rejects a bad signature', async () => {
    const verify = await verifyGithubSignatureFactory('whsec_test', '{"action":"opened"}');
    expect(verify('sha256=deadbeef')).toBe(false);
  });

  it('accepts a valid signature', async () => {
    const verify = await verifyGithubSignatureFactory('whsec_test', '{"action":"opened"}');
    const crypto = await import('crypto');
    const sig = 'sha256=' + crypto.createHmac('sha256', 'whsec_test').update('{"action":"opened"}').digest('hex');
    expect(verify(sig)).toBe(true);
  });
});
