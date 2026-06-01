import type { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { prisma } from '@call-center/db';
import { auth } from '../../modules/auth/auth.js';
import { AppError } from './error-handler.js';

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      throw new AppError(401, 'Unauthorized');
    }

    req.user = session.user;
    req.session = session.session;
    if (session.session.activeOrganizationId) {
      req.activeOrganizationId = session.session.activeOrganizationId;
    }
    next();
  } catch (err) {
    next(err);
  }
}

type Role = 'owner' | 'admin' | 'member' | 'agent' | 'viewer';

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  member: 1,
  agent: 1,
  admin: 2,
  owner: 3,
};

export function roleMeetsMinimum(memberRole: string, minRole: Role) {
  const memberRank = ROLE_RANK[memberRole as Role] ?? -1;
  return memberRank >= ROLE_RANK[minRole];
}

export function requireOrgMember(minRole: Role = 'viewer') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const orgId = req.activeOrganizationId;
      if (!orgId) throw new AppError(403, 'No active organization');

      const member = await prisma.member.findUnique({
        where: {
          userId_organizationId: { userId: req.user.id, organizationId: orgId },
        },
      });

      if (!member) throw new AppError(403, 'Not a member of this organization');

      if (!roleMeetsMinimum(member.role, minRole)) {
        throw new AppError(403, `Requires ${minRole} role or higher`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
