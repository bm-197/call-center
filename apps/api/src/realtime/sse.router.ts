import { Router } from 'express';
import type { Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { prisma } from '@call-center/db';
import { auth } from '../modules/auth/auth.js';

const router = Router();

// Store active SSE connections per organization
const connections = new Map<string, Set<Response>>();

export function broadcast(orgId: string, event: string, data: unknown) {
  const orgConnections = connections.get(orgId);
  if (!orgConnections) {
    console.log(`[sse] no subscribers for ${event} in org ${orgId}`);
    return;
  }

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  console.log(
    `[sse] broadcast ${event} to ${orgConnections.size} subscriber(s) in org ${orgId}`,
  );
  for (const res of orgConnections) {
    res.write(payload);
    flush(res);
  }
}

// SSE endpoint — clients connect here for real-time updates
router.get(
  '/:orgId',
  async (req: Request<{ orgId: string }>, res: Response) => {
    const { orgId } = req.params;
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      console.warn(
        `[sse] rejected unauthenticated connection for org ${orgId}`,
      );
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const member = await prisma.member.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: orgId,
        },
      },
      select: { id: true },
    });
    if (!member) {
      console.warn(
        `[sse] rejected non-member user ${session.user.id} for org ${orgId}`,
      );
      res.status(403).json({ error: 'Not a member of this organization' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ orgId })}\n\n`);
    flush(res);
    console.log(`[sse] connected user ${session.user.id} to org ${orgId}`);

    // Register connection
    if (!connections.has(orgId)) {
      connections.set(orgId, new Set());
    }
    connections.get(orgId)!.add(res);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
      flush(res);
    }, 30000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      connections.get(orgId)?.delete(res);
      if (connections.get(orgId)?.size === 0) {
        connections.delete(orgId);
      }
      console.log(
        `[sse] disconnected user ${session.user.id} from org ${orgId}`,
      );
    });
  },
);

function flush(res: Response): void {
  const maybe = res as Response & { flush?: () => void };
  maybe.flush?.();
}

export { router as sseRouter };
