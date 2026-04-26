import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '@call-center/db';
import { app, signUp, cleanupAll } from './helpers.js';

const cleanupEmails: string[] = [];

afterAll(async () => {
  await cleanupAll(cleanupEmails);
  await prisma.$disconnect();
});

type Endpoint = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  body?: object;
};

// Every org-scoped endpoint our app exposes. New routes added here
// are automatically covered by the auth/org guards below.
const ORG_SCOPED_ENDPOINTS: Endpoint[] = [
  { method: 'get', path: '/api/agents' },
  { method: 'post', path: '/api/agents', body: { name: 'x' } },
  { method: 'get', path: '/api/agents/some-id' },
  { method: 'patch', path: '/api/agents/some-id', body: { name: 'y' } },
  { method: 'delete', path: '/api/agents/some-id' },

  { method: 'get', path: '/api/contacts' },
  { method: 'post', path: '/api/contacts', body: { phoneNumber: '911' } },
  { method: 'get', path: '/api/contacts/some-id' },
  { method: 'patch', path: '/api/contacts/some-id', body: { firstName: 'y' } },
  { method: 'delete', path: '/api/contacts/some-id' },

  { method: 'get', path: '/api/phone-numbers' },
  {
    method: 'post',
    path: '/api/phone-numbers',
    body: { number: '+251911000' },
  },
  {
    method: 'patch',
    path: '/api/phone-numbers/some-id',
    body: { status: 'inactive' },
  },
  { method: 'delete', path: '/api/phone-numbers/some-id' },
];

describe('auth gate: protected routes reject unauthenticated requests', () => {
  it.each(ORG_SCOPED_ENDPOINTS)(
    '$method $path returns 401 with no session',
    async ({ method, path, body }) => {
      const res = await request(app)
        [method](path)
        .send(body ?? {});
      expect(res.status).toBe(401);
    },
  );
});

describe('auth gate: org-scoped routes reject sessions with no active org', () => {
  it.each(ORG_SCOPED_ENDPOINTS)(
    '$method $path returns 403 when session has no active org',
    async ({ method, path, body }) => {
      // Sign up but don't create/activate any org
      const u = await signUp();
      cleanupEmails.push(u.email);

      const res = await request(app)
        [method](path)
        .set('Cookie', u.cookie)
        .send(body ?? {});

      expect(res.status).toBe(403);
    },
  );
});
