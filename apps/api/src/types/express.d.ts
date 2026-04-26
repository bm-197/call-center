import type { Auth } from '../modules/auth/auth.js';

type AuthSession = Awaited<ReturnType<Auth['api']['getSession']>>;

declare global {
  namespace Express {
    interface Request {
      user?: NonNullable<AuthSession>['user'];
      session?: NonNullable<AuthSession>['session'];
      activeOrganizationId?: string;
    }
  }
}

export {};
