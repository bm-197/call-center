import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '@call-center/db';
import { app, signUp, cleanupUser } from './helpers.js';

const emails: string[] = [];

afterAll(async () => {
  for (const email of emails) await cleanupUser(email);
  await prisma.$disconnect();
});

describe('auth flow', () => {
  it('signs up, returns session, and signs out', async () => {
    const u = await signUp();
    emails.push(u.email);

    const session = await request(app)
      .get('/api/auth/get-session')
      .set('Cookie', u.cookie);
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe(u.email);
    expect(session.body.session.userId).toBe(u.userId);

    const out = await request(app)
      .post('/api/auth/sign-out')
      .set('Cookie', u.cookie)
      .send({});
    expect(out.status).toBe(200);

    const after = await request(app)
      .get('/api/auth/get-session')
      .set('Cookie', u.cookie);
    expect(after.body).toBeFalsy();
  });

  it('creates an organization and sets it active', async () => {
    const u = await signUp();
    emails.push(u.email);

    const create = await request(app)
      .post('/api/auth/organization/create')
      .set('Cookie', u.cookie)
      .send({ name: 'Vitest Org', slug: `vitest-${Date.now()}` });
    expect(create.status).toBe(200);
    const orgId = create.body.id as string;

    const setActive = await request(app)
      .post('/api/auth/organization/set-active')
      .set('Cookie', u.cookie)
      .send({ organizationId: orgId });
    expect(setActive.status).toBe(200);

    const session = await request(app)
      .get('/api/auth/get-session')
      .set('Cookie', u.cookie);
    expect(session.body.session.activeOrganizationId).toBe(orgId);
  });
});
