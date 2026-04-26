import request from 'supertest';
import { prisma } from '@call-center/db';
import { createApp } from '../src/app.js';

export const app = createApp();

export type TestUser = {
  email: string;
  password: string;
  name: string;
  cookie: string;
  userId: string;
  orgId: string;
};

let counter = 0;
function unique() {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

function extractCookie(setCookie: string | string[] | undefined) {
  if (!setCookie) return '';
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map((c) => c.split(';')[0]).join('; ');
}

export async function signUp(): Promise<{
  email: string;
  password: string;
  name: string;
  cookie: string;
  userId: string;
}> {
  const id = unique();
  const email = `vitest+${id}@example.com`;
  const password = 'password12345';
  const name = `Vitest ${id}`;

  const res = await request(app)
    .post('/api/auth/sign-up/email')
    .send({ email, password, name })
    .expect(200);

  return {
    email,
    password,
    name,
    cookie: extractCookie(res.headers['set-cookie']),
    userId: res.body.user.id,
  };
}

export async function createOrg(
  cookie: string,
): Promise<{ id: string; cookie: string }> {
  const id = unique();
  const create = await request(app)
    .post('/api/auth/organization/create')
    .set('Cookie', cookie)
    .send({ name: `Org ${id}`, slug: `org-${id}` })
    .expect(200);

  const orgId = create.body.id as string;

  const setActive = await request(app)
    .post('/api/auth/organization/set-active')
    .set('Cookie', cookie)
    .send({ organizationId: orgId })
    .expect(200);

  // BA may return a fresh cookie; merge
  const fresh = extractCookie(setActive.headers['set-cookie']);
  return { id: orgId, cookie: fresh || cookie };
}

export async function signUpWithOrg(): Promise<TestUser> {
  const u = await signUp();
  const o = await createOrg(u.cookie);
  return { ...u, orgId: o.id, cookie: o.cookie };
}

export async function cleanupUser(email: string) {
  await prisma.user.deleteMany({ where: { email } });
}

export async function cleanupAll(emails: string[]) {
  if (!emails.length) return;
  // Cascade deletes from User → Member → Organization aren't automatic,
  // so we explicitly remove orgs the user owns first via membership join.
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length) {
    const memberships = await prisma.member.findMany({
      where: { userId: { in: userIds } },
      select: { organizationId: true },
    });
    const orgIds = [...new Set(memberships.map((m) => m.organizationId))];
    if (orgIds.length) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
  }
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}
