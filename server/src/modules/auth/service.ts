import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../lib/db';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../lib/errors';
import { signToken } from '../../middleware/auth';

const SALT_ROUNDS = 12;

export interface AuthResult {
  token: string;
  user: { id: string; email: string; name: string };
  orgId: string;
}

export async function register(input: {
  email: string;
  password: string;
  name: string;
  orgName?: string;
}): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const orgName = input.orgName?.trim() || `${input.name}'s workspace`;

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name: input.name.trim(), passwordHash } });
    const org = await tx.organization.create({ data: { name: orgName } });
    await tx.membership.create({
      data: { userId: user.id, orgId: org.id, role: 'OWNER' },
    });
    return { user, org };
  });

  return {
    token: signToken({ userId: result.user.id, email: result.user.email }),
    user: { id: result.user.id, email: result.user.email, name: result.user.name },
    orgId: result.org.id,
  };
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const user = await db.user.findUnique({
    where: { email: input.email.toLowerCase().trim() },
    include: { memberships: true },
  });
  if (!user) {
    throw UnauthorizedError('Invalid email or password');
  }
  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw UnauthorizedError('Invalid email or password');
  }
  const orgId = user.memberships[0]?.orgId ?? '';
  return {
    token: signToken({ userId: user.id, email: user.email }),
    user: { id: user.id, email: user.email, name: user.name },
    orgId,
  };
}

export async function updateGithubToken(userId: string, token: string | null): Promise<void> {
  if (token === null) {
    await db.user.update({ where: { id: userId }, data: { githubToken: null } });
    return;
  }
  const encrypted = encrypt(token);
  await db.user.update({ where: { id: userId }, data: { githubToken: encrypted } });
}

export async function getGithubToken(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { githubToken: true } });
  if (!user?.githubToken) return null;
  return decrypt(user.githubToken);
}

/** AES-256-GCM encryption for tokens at rest. Format: iv:tag:ciphertext (hex). */
export function encrypt(plain: string): string {
  const key = keyBytes();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed encrypted payload');
  const key = keyBytes();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

function keyBytes(): Buffer {
  const key = process.env.ENCRYPTION_KEY ?? 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
  const buf = Buffer.from(key, 'hex');
  if (buf.length === 32) return buf;
  return crypto.createHash('sha256').update(key).digest();
}

export async function getProfile(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      memberships: { include: { org: true } },
    },
  });
  if (!user) throw NotFoundError('User not found');
  return user;
}
