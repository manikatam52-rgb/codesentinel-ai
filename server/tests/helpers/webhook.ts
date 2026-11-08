import crypto from 'crypto';

export async function verifyGithubSignatureFactory(secret: string, rawBody: string) {
  process.env.GITHUB_WEBHOOK_SECRET = secret;
  const mod = await import('../../src/modules/webhooks/handler');
  const savedRaw = (global as any).__rawBodyForTest;
  void savedRaw;
  const raw = Buffer.from(rawBody);
  return (signature: string) => {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
}
