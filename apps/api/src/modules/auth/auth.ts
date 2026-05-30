import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization } from 'better-auth/plugins';
import { agentAuth } from '@better-auth/agent-auth';
import { prisma } from '@call-center/db';
import { sendEmail } from '../email/email.js';
import { invitationEmail } from '../email/templates/invitation.js';
import { executeTool } from '../../tools/runtime.js';
import { agentAuthCapabilities } from '../../tools/registry.js';

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [frontendUrl],
  rateLimit: {
    enabled: process.env.NODE_ENV !== 'test',
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day
  },
  plugins: [
    agentAuth({
      providerName: 'Call Center Tools',
      providerDescription:
        'Scoped call-center actions for voice agents, MCP clients, and tenant integrations.',
      modes: ['delegated', 'autonomous'],
      approvalMethods: ['device_authorization'],
      deviceAuthorizationPage: '/device/capabilities',
      trustProxy: true,
      requireAuthForCapabilities: false,
      capabilities: agentAuthCapabilities,
      validateCapabilities: (capabilities) => {
        const known = new Set(agentAuthCapabilities.map((cap) => cap.name));
        return capabilities.every((capability) => known.has(capability));
      },
      schema: {
        agentHost: { modelName: 'authAgentHost' },
        agent: { modelName: 'authAgent' },
        agentCapabilityGrant: { modelName: 'authAgentCapabilityGrant' },
        approvalRequest: { modelName: 'authApprovalRequest' },
      },
      onExecute: async ({ capability, arguments: args, agentSession }) => {
        const metadata = agentSession.agent.metadata ?? {};
        const organizationId =
          typeof metadata.organizationId === 'string'
            ? metadata.organizationId
            : null;
        const voiceAgentId =
          typeof metadata.voiceAgentId === 'string'
            ? metadata.voiceAgentId
            : null;
        if (!organizationId || !voiceAgentId) {
          throw new Error(
            'Agent Auth metadata must include organizationId and voiceAgentId',
          );
        }

        return executeTool(capability, args ?? {}, {
          organizationId,
          agentId: voiceAgentId,
          source: 'agent-auth',
          actorId: agentSession.agent.id,
        });
      },
      onEvent: async (event) => {
        console.log('[agent-auth]', event.type, {
          agentId: event.agentId,
          hostId: event.hostId,
          capability: 'capability' in event ? event.capability : event.targetId,
          status: 'status' in event ? event.status : undefined,
        });
      },
    }),
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
      membershipLimit: 100,
      creatorRole: 'owner',
      invitationExpiresIn: 60 * 60 * 24 * 7, // 7 days
      invitationLimit: 50,
      cancelPendingInvitationsOnReInvite: true,
      sendInvitationEmail: async ({
        email,
        organization,
        inviter,
        invitation,
        role,
      }) => {
        const acceptUrl = `${frontendUrl}/accept-invite?id=${invitation.id}`;
        const { subject, html, text } = invitationEmail({
          organizationName: organization.name,
          inviterName: inviter.user.name ?? inviter.user.email,
          inviterEmail: inviter.user.email,
          role,
          acceptUrl,
        });
        await sendEmail({ to: email, subject, html, text });
      },
    }),
  ],
});

export type Auth = typeof auth;
