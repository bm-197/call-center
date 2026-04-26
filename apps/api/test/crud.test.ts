import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma } from '@call-center/db';
import { app, signUpWithOrg, cleanupAll, type TestUser } from './helpers.js';

let user: TestUser;

beforeAll(async () => {
  user = await signUpWithOrg();
});

afterAll(async () => {
  await cleanupAll([user.email]);
  await prisma.$disconnect();
});

describe('agents CRUD', () => {
  it('create → list → get → patch → delete round trip', async () => {
    const created = await request(app)
      .post('/api/agents')
      .set('Cookie', user.cookie)
      .send({ name: 'Round trip', language: 'am' })
      .expect(201);

    const id = created.body.id;
    expect(created.body.organizationId).toBe(user.orgId);
    expect(created.body.status).toBe('draft');

    const list = await request(app)
      .get('/api/agents')
      .set('Cookie', user.cookie)
      .expect(200);
    expect(list.body.find((a: { id: string }) => a.id === id)).toBeTruthy();

    const got = await request(app)
      .get(`/api/agents/${id}`)
      .set('Cookie', user.cookie)
      .expect(200);
    expect(got.body.name).toBe('Round trip');

    const patched = await request(app)
      .patch(`/api/agents/${id}`)
      .set('Cookie', user.cookie)
      .send({ status: 'active' })
      .expect(200);
    expect(patched.body.status).toBe('active');

    await request(app)
      .delete(`/api/agents/${id}`)
      .set('Cookie', user.cookie)
      .expect(204);

    await request(app)
      .get(`/api/agents/${id}`)
      .set('Cookie', user.cookie)
      .expect(404);
  });

  it('rejects invalid payloads with 400', async () => {
    const res = await request(app)
      .post('/api/agents')
      .set('Cookie', user.cookie)
      .send({ name: '', handoffConfidenceThreshold: 5 });
    expect(res.status).toBe(400);
    expect(res.body.issues).toBeTruthy();
  });
});

describe('contacts CRUD', () => {
  it('create → list → patch → delete', async () => {
    const phone = `91${Date.now()}`.slice(0, 10);
    const created = await request(app)
      .post('/api/contacts')
      .set('Cookie', user.cookie)
      .send({ phoneNumber: phone, firstName: 'Round' })
      .expect(201);

    const id = created.body.id;
    expect(created.body.organizationId).toBe(user.orgId);

    const patched = await request(app)
      .patch(`/api/contacts/${id}`)
      .set('Cookie', user.cookie)
      .send({ lastName: 'Trip' })
      .expect(200);
    expect(patched.body.lastName).toBe('Trip');

    await request(app)
      .delete(`/api/contacts/${id}`)
      .set('Cookie', user.cookie)
      .expect(204);
  });

  it('returns 409 on duplicate phone within an org', async () => {
    const phone = `92${Date.now()}`.slice(0, 10);
    await request(app)
      .post('/api/contacts')
      .set('Cookie', user.cookie)
      .send({ phoneNumber: phone })
      .expect(201);

    const dup = await request(app)
      .post('/api/contacts')
      .set('Cookie', user.cookie)
      .send({ phoneNumber: phone });

    expect(dup.status).toBe(409);
  });
});

describe('phone numbers CRUD', () => {
  it('create → list → patch → delete', async () => {
    const number = `+251911${Date.now()}`.slice(0, 16);
    const created = await request(app)
      .post('/api/phone-numbers')
      .set('Cookie', user.cookie)
      .send({ number, friendlyName: 'Test line' })
      .expect(201);

    const id = created.body.id;
    expect(created.body.status).toBe('active');

    const list = await request(app)
      .get('/api/phone-numbers')
      .set('Cookie', user.cookie)
      .expect(200);
    expect(list.body.find((n: { id: string }) => n.id === id)).toBeTruthy();

    const patched = await request(app)
      .patch(`/api/phone-numbers/${id}`)
      .set('Cookie', user.cookie)
      .send({ status: 'inactive' })
      .expect(200);
    expect(patched.body.status).toBe('inactive');

    await request(app)
      .delete(`/api/phone-numbers/${id}`)
      .set('Cookie', user.cookie)
      .expect(204);
  });

  it('returns 409 on duplicate phone number across system', async () => {
    const number = `+251922${Date.now()}`.slice(0, 16);
    await request(app)
      .post('/api/phone-numbers')
      .set('Cookie', user.cookie)
      .send({ number })
      .expect(201);

    const dup = await request(app)
      .post('/api/phone-numbers')
      .set('Cookie', user.cookie)
      .send({ number });

    expect(dup.status).toBe(409);
  });
});
