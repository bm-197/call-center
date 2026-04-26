import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization } from 'better-auth/plugins';
import { prisma } from '@call-center/db';
import { sendEmail } from '../email/email.js';
import { invitationEmail } from '../email/templates/invitation.js';

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
