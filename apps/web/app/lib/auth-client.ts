import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL:
    typeof window === 'undefined'
      ? (process.env.API_URL ?? 'http://localhost:4000')
      : '', // same-origin in browser; proxy.ts forwards /api/auth/* to the API
  plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession, organization } = authClient;
