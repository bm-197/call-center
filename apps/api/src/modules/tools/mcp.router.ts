import { Router } from 'express';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { prisma } from '@call-center/db';
import { auth } from '../auth/auth.js';
import { executeTool, getEnabledToolDefinitions } from '../../tools/runtime.js';
import type { ToolExecutionContext } from '../../tools/registry.js';

const router = Router();

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

router.get('/', (_req, res) => {
  res.status(405).json({
    error: 'method_not_allowed',
    message: 'Use POST for MCP Streamable HTTP requests.',
  });
});

router.post('/', async (req, res) => {
  const message = req.body as JsonRpcRequest;
  const id = message.id ?? null;

  try {
    switch (message.method) {
      case 'initialize':
        res.json(
          rpcResult(id, {
            protocolVersion: '2025-06-18',
            capabilities: { tools: { listChanged: true } },
            serverInfo: {
              name: 'call-center-tools',
              version: '0.1.0',
            },
          }),
        );
        return;

      case 'notifications/initialized':
        res.status(202).send();
        return;

      case 'tools/list': {
        const context = await resolveMcpContext(req);
        const tools = await getEnabledToolDefinitions({
          organizationId: context.organizationId,
          agentId: context.agentId,
        });
        res.json(
          rpcResult(id, {
            tools: tools.map((tool) => ({
              name: tool.name,
              title: tool.title,
              description: tool.description,
              inputSchema: tool.inputSchema,
              outputSchema: tool.outputSchema,
            })),
          }),
        );
        return;
      }

      case 'tools/call': {
        const context = await resolveMcpContext(req);
        const params = message.params ?? {};
        const name = typeof params.name === 'string' ? params.name : '';
        const args =
          params.arguments && typeof params.arguments === 'object'
            ? (params.arguments as Record<string, unknown>)
            : {};
        const output = await executeTool(name, args, context);
        res.json(
          rpcResult(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(output),
              },
            ],
            structuredContent: output,
          }),
        );
        return;
      }

      default:
        res
          .status(400)
          .json(rpcError(id, -32601, `Unknown MCP method: ${message.method}`));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json(rpcError(id, -32000, message));
  }
});

async function resolveMcpContext(req: Request): Promise<ToolExecutionContext> {
  const headers = fromNodeHeaders(req.headers);
  const agentSession = await auth.api
    .getAgentSession({ headers })
    .catch(() => null);

  if (agentSession) {
    const metadata = agentSession.agent.metadata ?? {};
    const organizationId =
      typeof metadata.organizationId === 'string'
        ? metadata.organizationId
        : null;
    const agentId =
      typeof metadata.voiceAgentId === 'string' ? metadata.voiceAgentId : null;
    if (!organizationId || !agentId) {
      throw new Error(
        'Agent Auth metadata must include organizationId and voiceAgentId',
      );
    }
    return {
      organizationId,
      agentId,
      source: 'mcp',
      actorId: agentSession.agent.id,
    };
  }

  const session = await auth.api.getSession({ headers });
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) {
    throw new Error('MCP tools require an authenticated organization session');
  }

  const requestedAgentId = headerOrQuery(req, 'agentId');
  const agentId = await resolveVoiceAgentId(organizationId, requestedAgentId);
  return {
    organizationId,
    agentId,
    source: 'mcp',
    actorId: session.user.id,
  };
}

async function resolveVoiceAgentId(
  organizationId: string,
  requestedAgentId: string | null,
): Promise<string> {
  if (requestedAgentId) {
    const agent = await prisma.agent.findFirst({
      where: { id: requestedAgentId, organizationId },
      select: { id: true },
    });
    if (!agent) throw new Error('Agent not found for MCP tool session');
    return agent.id;
  }

  const agent = await prisma.agent.findFirst({
    where: { organizationId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (agent) return agent.id;

  const fallback = await prisma.agent.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!fallback) throw new Error('No agent exists for MCP tool session');
  return fallback.id;
}

function headerOrQuery(req: Request, name: string): string | null {
  const query = req.query[name];
  if (typeof query === 'string' && query.trim()) return query.trim();
  const header = req.header(`x-call-center-${name.toLowerCase()}`);
  return header?.trim() || null;
}

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
}

export { router as mcpRouter };
