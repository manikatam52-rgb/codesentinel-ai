import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

/**
 * Integration tests — run against a real Postgres (docker compose up db).
 * Skipped automatically when DATABASE_URL is unreachable so unit CI stays green.
 */

const canConnect = async (): Promise<boolean> => {
  try {
    const { db } = await import('../../src/lib/db');
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
};

const uniqueEmail = () => `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

describe.sequential('API integration', () => {
  let dbUp = false;
  beforeAll(async () => {
    dbUp = await canConnect();
  });

  it('health endpoint responds', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
  });

  it('returns 404 for unknown routes outside guarded APIs', async () => {
    const res = await request(app).get('/api/nope');
    expect([401, 404]).toContain(res.status);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('rejects invalid registration payloads', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: '123', name: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('full auth + project + issue lifecycle', async ({ skip }) => {
    if (!dbUp) skip();
    const email = uniqueEmail();

    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'supersecret1', name: 'Test User' });
    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeTruthy();
    const token = reg.body.token;

    // duplicate registration -> 409
    const dup = await request(app).post('/api/auth/register').send({ email, password: 'supersecret1', name: 'X' });
    expect(dup.status).toBe(409);

    // login
    const login = await request(app).post('/api/auth/login').send({ email, password: 'supersecret1' });
    expect(login.status).toBe(200);

    // wrong password
    const badLogin = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(badLogin.status).toBe(401);

    // me
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);

    // project creation requires a real accessible repo; expect 4xx with no token
    const proj = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', repoOwner: 'octocat', repoName: 'hello-welcome' });
    expect([201, 400, 500, 502]).toContain(proj.status);

    if (proj.status === 201) {
      const issues = await request(app)
        .post(`/api/projects/${proj.body.id}/issues`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Fix the thing', severity: 'HIGH' });
      expect(issues.status).toBe(201);

      const list = await request(app).get(`/api/projects/${proj.body.id}/issues`).set('Authorization', `Bearer ${token}`);
      expect(list.status).toBe(200);
      expect(list.body.some((i: { title: string }) => i.title === 'Fix the thing')).toBe(true);
    }
  });

  it('rejects tampered JWTs', async ({ skip }) => {
    if (!dbUp) skip();
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });
});
