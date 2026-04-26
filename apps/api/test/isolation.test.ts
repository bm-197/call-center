import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '@call-center/db';
import { app, signUpWithOrg, cleanupAll, type TestUser } from './helpers.js';

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  alice = await signUpWithOrg();
  bob = await signUpWithOrg();
});

afterAll(async () => {
  await cleanupAll([alice.email, bob.email]);
  await prisma.$disconnect();
});

/**
 * Tenant isolation guarantees: a user in Org A must not be able to
 * read, write, or delete resources owned by Org B — even when they
 * know the resource's id.
 */
describe('tenant isolation', () => {
  describe('agents', () => {
    it('cross-org GET / PATCH / DELETE all return 404', async () => {
      // Alice creates an agent in her org
      const created = await request(app)
        .post('/api/agents')
        .set('Cookie', alice.cookie)
        .send({ name: 'Alice agent' })
        .expect(201);
      const agentId = created.body.id;

      // Bob (different org) tries to access
      await request(app)
        .get(`/api/agents/${agentId}`)
        .set('Cookie', bob.cookie)
        .expect(404);

      await request(app)
        .patch(`/api/agents/${agentId}`)
        .set('Cookie', bob.cookie)
        .send({ name: 'hijacked' })
        .expect(404);

      await request(app)
        .delete(`/api/agents/${agentId}`)
        .set('Cookie', bob.cookie)
        .expect(404);

      // Alice's resource is still intact
      const after = await request(app)
        .get(`/api/agents/${agentId}`)
        .set('Cookie', alice.cookie)
        .expect(200);
      expect(after.body.name).toBe('Alice agent');
    });

    it('list only returns resources for the active org', async () => {
      await request(app)
        .post('/api/agents')
        .set('Cookie', alice.cookie)
        .send({ name: 'Alice list test' })
        .expect(201);

      const aliceList = await request(app)
        .get('/api/agents')
        .set('Cookie', alice.cookie)
        .expect(200);
      const bobList = await request(app)
        .get('/api/agents')
        .set('Cookie', bob.cookie)
        .expect(200);

      const aliceNames = aliceList.body.map((a: { name: string }) => a.name);
      const bobNames = bobList.body.map((a: { name: string }) => a.name);

      expect(aliceNames).toContain('Alice list test');
      expect(bobNames).not.toContain('Alice list test');
    });
  });

  describe('contacts', () => {
    it('cross-org access blocked + list scoped', async () => {
      const created = await request(app)
        .post('/api/contacts')
        .set('Cookie', alice.cookie)
        .send({ phoneNumber: '911000001', firstName: 'AliceContact' })
        .expect(201);
      const id = created.body.id;

      await request(app)
        .get(`/api/contacts/${id}`)
        .set('Cookie', bob.cookie)
        .expect(404);
      await request(app)
        .delete(`/api/contacts/${id}`)
        .set('Cookie', bob.cookie)
        .expect(404);

      const bobList = await request(app)
        .get('/api/contacts')
        .set('Cookie', bob.cookie)
        .expect(200);
      expect(
        bobList.body.find((c: { id: string }) => c.id === id),
      ).toBeUndefined();
    });
  });

  describe('phone numbers', () => {
    it('cross-org access blocked', async () => {
      const created = await request(app)
        .post('/api/phone-numbers')
        .set('Cookie', alice.cookie)
        .send({ number: `+251911${Date.now()}`.slice(0, 16) })
        .expect(201);
      const id = created.body.id;

      await request(app)
        .patch(`/api/phone-numbers/${id}`)
        .set('Cookie', bob.cookie)
        .send({ status: 'inactive' })
        .expect(404);
      await request(app)
        .delete(`/api/phone-numbers/${id}`)
        .set('Cookie', bob.cookie)
        .expect(404);
    });

    it('cannot route to an agent owned by another org', async () => {
      const aliceAgent = await request(app)
        .post('/api/agents')
        .set('Cookie', alice.cookie)
        .send({ name: 'Alice routable' })
        .expect(201);

      // Bob creates a phone number trying to route to Alice's agent
      const res = await request(app)
        .post('/api/phone-numbers')
        .set('Cookie', bob.cookie)
        .send({
          number: `+251911${Date.now()}`.slice(0, 16),
          agentId: aliceAgent.body.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/agent/i);
    });
  });

  describe('create payload spoofing', () => {
    it("ignores organizationId in body — always uses session's active org", async () => {
      const res = await request(app)
        .post('/api/agents')
        .set('Cookie', bob.cookie)
        .send({ name: 'Spoof test', organizationId: alice.orgId })
        .expect(201);

      expect(res.body.organizationId).toBe(bob.orgId);
      expect(res.body.organizationId).not.toBe(alice.orgId);
    });
  });
});
