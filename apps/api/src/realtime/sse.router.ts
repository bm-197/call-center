import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

// Store active SSE connections per organization
const connections = new Map<string, Set<Response>>();

export function broadcast(orgId: string, event: string, data: unknown) {
  const orgConnections = connections.get(orgId);
  if (!orgConnections) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of orgConnections) {
    res.write(payload);
  }
}

// SSE endpoint — clients connect here for real-time updates
router.get("/:orgId", (req: Request<{ orgId: string }>, res: Response) => {
  const { orgId } = req.params;

  // TODO: add auth middleware to verify user belongs to org

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ orgId })}\n\n`);

  // Register connection
  if (!connections.has(orgId)) {
    connections.set(orgId, new Set());
  }
  connections.get(orgId)!.add(res);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    connections.get(orgId)?.delete(res);
    if (connections.get(orgId)?.size === 0) {
      connections.delete(orgId);
    }
  });
});

export { router as sseRouter };
