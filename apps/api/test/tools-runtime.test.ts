import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@call-center/db';
import { executeTool } from '../src/tools/runtime.js';
import { cleanupAll, signUpWithOrg } from './helpers.js';

const cleanupEmails: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupAll(cleanupEmails.splice(0));
});

describe('tool runtime external integrations', () => {
  it('executes tools through an external custom API without mutating contacts or appointments', async () => {
    const user = await signUpWithOrg();
    cleanupEmails.push(user.email);

    const agent = await prisma.agent.create({
      data: {
        organizationId: user.orgId,
        name: 'Tool Agent',
        status: 'active',
      },
    });
    await prisma.integrationConnection.create({
      data: {
        organizationId: user.orgId,
        provider: 'custom_api',
        name: 'cms',
        status: 'active',
        config: {
          tools: {
            waitlist_add_contact: {
              url: 'https://cms.example.test/waitlist',
            },
          },
        },
        credentials: { apiKey: 'secret-key' },
      },
    });

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'cms-row-1', ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeTool(
      'waitlist_add_contact',
      {
        name: 'Sara',
        phoneNumber: '911100100',
        feature: 'new feature',
        notes: 'Interested during a phone call',
      },
      {
        organizationId: user.orgId,
        agentId: agent.id,
        source: 'api',
        actorId: user.userId,
      },
    );

    expect(result).toMatchObject({
      status: 'executed',
      externalProvider: 'custom_api',
      externalStatusCode: 200,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      await prisma.contact.count({ where: { organizationId: user.orgId } }),
    ).toBe(0);
    expect(
      await prisma.appointment.count({ where: { organizationId: user.orgId } }),
    ).toBe(0);
    expect(
      await prisma.toolInvocation.count({
        where: {
          organizationId: user.orgId,
          status: 'success',
          externalProvider: 'custom_api',
        },
      }),
    ).toBe(1);
  });

  it('maps waitlist tool fields into Notion database columns', async () => {
    const user = await signUpWithOrg();
    cleanupEmails.push(user.email);

    const agent = await prisma.agent.create({
      data: {
        organizationId: user.orgId,
        name: 'Notion Agent',
        status: 'active',
      },
    });
    await prisma.integrationConnection.create({
      data: {
        organizationId: user.orgId,
        provider: 'notion',
        name: 'waitlist',
        status: 'active',
        config: {
          databaseId: 'notion-db-1',
          titleProperty: 'Name',
          mappings: {
            waitlist_add_contact: {
              title: 'Name',
              phone: 'Phone',
              feature: 'Feature',
              notes: 'Notes',
              callerNumber: 'Caller',
              callId: 'Call ID',
              source: 'Source',
              createdAt: 'Created At',
            },
          },
        },
        credentials: { token: 'secret_test' },
      },
    });
    await prisma.call.create({
      data: {
        id: 'call-1',
        organizationId: user.orgId,
        agentId: agent.id,
        direction: 'inbound',
        callerNumber: '1002',
        calleeNumber: '1000',
      },
    });

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/databases/')) {
          return new Response(
            JSON.stringify({
              properties: {
                Name: { type: 'title' },
                Phone: { type: 'phone_number' },
                Feature: { type: 'rich_text' },
                Notes: { type: 'rich_text' },
                Caller: { type: 'rich_text' },
                'Call ID': { type: 'rich_text' },
                Source: { type: 'select' },
                'Created At': { type: 'date' },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({ id: 'notion-page-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeTool(
      'waitlist_add_contact',
      {
        name: 'ቢስራት ማሩ',
        phoneNumber: '0904447512',
        feature: 'new feature',
        notes: 'Interested in the beta',
      },
      {
        organizationId: user.orgId,
        agentId: agent.id,
        source: 'voice',
        callerNumber: '1002',
        callId: 'call-1',
        actorId: user.userId,
      },
      { skipConfirmation: true },
    );

    expect(result).toMatchObject({
      status: 'executed',
      externalProvider: 'notion',
      externalId: 'notion-page-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const postBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    ) as {
      properties: Record<string, unknown>;
      children: Array<{
        paragraph: { rich_text: Array<{ text: { content: string } }> };
      }>;
    };

    expect(postBody.properties).toMatchObject({
      Name: { title: [{ text: { content: 'ቢስራት ማሩ' } }] },
      Phone: { phone_number: '0904447512' },
      Feature: { rich_text: [{ text: { content: 'new feature' } }] },
      Notes: { rich_text: [{ text: { content: 'Interested in the beta' } }] },
      Caller: { rich_text: [{ text: { content: '1002' } }] },
      'Call ID': { rich_text: [{ text: { content: 'call-1' } }] },
      Source: { select: { name: 'voice' } },
    });
    expect(postBody.properties['Created At']).toHaveProperty('date.start');
    expect(
      postBody.children[0]?.paragraph.rich_text[0]?.text.content,
    ).not.toContain('{"toolName"');
  });
});
