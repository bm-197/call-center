import { prisma, Prisma } from '@call-center/db';
import {
  CONFIRM_TOOL_NAME,
  buildConfiguredToolDefinition,
  configuredToolEntries,
  getToolDefinition,
  toolDefinitions,
  toFunctionDeclaration,
  type ConfirmInput,
  type ToolDefinition,
  type ToolExecutionContext,
} from './registry.js';
import { executeExternalTool } from './external-integrations.js';

export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly code = 'tool_execution_failed',
  ) {
    super(message);
  }
}

type ExecuteOptions = {
  skipConfirmation?: boolean;
  confirmationId?: string;
};

type IntegrationToolConfig = {
  provider: string;
  config: Prisma.JsonValue | null;
  updatedAt: Date;
};

export async function getEnabledToolDefinitions(opts: {
  organizationId: string;
  agentId: string;
}): Promise<ToolDefinition[]> {
  const grants = await prisma.agentToolGrant.findMany({
    where: {
      organizationId: opts.organizationId,
      agentId: opts.agentId,
    },
  });
  const grantByTool = new Map(grants.map((grant) => [grant.toolName, grant]));
  const availableTools = await getOrganizationToolDefinitions(
    opts.organizationId,
  );

  const enabled = availableTools.filter((tool) => {
    if (tool.name === CONFIRM_TOOL_NAME) return true;
    const grant = grantByTool.get(tool.name);
    if (grant) return grant.status === 'enabled';
    return tool.defaultEnabled;
  });

  const hasConfirmableTool = enabled.some((tool) => tool.requiresConfirmation);
  if (!hasConfirmableTool) {
    return enabled.filter((tool) => tool.name !== CONFIRM_TOOL_NAME);
  }
  return enabled;
}

export async function getGeminiToolConfig(opts: {
  organizationId: string;
  agentId: string;
}) {
  const enabled = await getEnabledToolDefinitions(opts);
  if (enabled.length === 0) return [];
  return [{ functionDeclarations: enabled.map(toFunctionDeclaration) }];
}

export async function listToolsForAgent(opts: {
  organizationId: string;
  agentId: string;
}) {
  const grants = await prisma.agentToolGrant.findMany({
    where: {
      organizationId: opts.organizationId,
      agentId: opts.agentId,
    },
    orderBy: { toolName: 'asc' },
  });
  const grantByTool = new Map(grants.map((grant) => [grant.toolName, grant]));
  const availableTools = await getOrganizationToolDefinitions(
    opts.organizationId,
  );

  return availableTools.map((tool) => {
    const grant = grantByTool.get(tool.name);
    const enabled =
      tool.name === CONFIRM_TOOL_NAME
        ? true
        : grant
          ? grant.status === 'enabled'
          : tool.defaultEnabled;
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      defaultEnabled: tool.defaultEnabled,
      requiresConfirmation: tool.requiresConfirmation,
      enabled,
      grantId: grant?.id ?? null,
      config: grant?.config ?? null,
    };
  });
}

export async function setAgentToolGrant(opts: {
  organizationId: string;
  agentId: string;
  toolName: string;
  status: 'enabled' | 'disabled';
  config?: unknown;
}) {
  if (opts.toolName === CONFIRM_TOOL_NAME) {
    throw new ToolExecutionError('The confirmation tool cannot be disabled');
  }
  const tool = await getOrganizationToolDefinition(
    opts.organizationId,
    opts.toolName,
  );
  if (!tool) throw new ToolExecutionError('Unknown tool', 'unknown_tool');

  return prisma.agentToolGrant.upsert({
    where: {
      agentId_toolName: {
        agentId: opts.agentId,
        toolName: opts.toolName,
      },
    },
    update: {
      status: opts.status,
      ...(opts.config !== undefined
        ? { config: toInputJson(opts.config) }
        : {}),
    },
    create: {
      organizationId: opts.organizationId,
      agentId: opts.agentId,
      toolName: opts.toolName,
      status: opts.status,
      ...(opts.config !== undefined
        ? { config: toInputJson(opts.config) }
        : {}),
    },
  });
}

export async function executeTool(
  name: string,
  args: Record<string, unknown> | undefined,
  context: ToolExecutionContext,
  options: ExecuteOptions = {},
): Promise<Record<string, unknown>> {
  if (name === CONFIRM_TOOL_NAME) {
    return executeConfirmTool(args ?? {}, context);
  }

  const tool = await getOrganizationToolDefinition(
    context.organizationId,
    name,
  );
  if (!tool)
    throw new ToolExecutionError(`Unknown tool: ${name}`, 'unknown_tool');

  const enabled = await isToolEnabled(name, context);
  if (!enabled) {
    throw new ToolExecutionError(
      `Tool is disabled for this agent: ${name}`,
      'tool_disabled',
    );
  }

  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    throw new ToolExecutionError(
      parsed.error.message,
      'invalid_tool_arguments',
    );
  }

  if (
    tool.requiresConfirmation &&
    context.source === 'voice' &&
    !options.skipConfirmation
  ) {
    return createPendingConfirmation(tool, parsed.data, context);
  }

  return executeConfirmedTool(name, parsed.data, context, options);
}

async function executeConfirmTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  const tool = getToolDefinition(CONFIRM_TOOL_NAME);
  if (!tool) throw new ToolExecutionError('Confirmation tool is missing');

  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    throw new ToolExecutionError(
      parsed.error.message,
      'invalid_tool_arguments',
    );
  }

  const start = Date.now();
  const invocation = await prisma.toolInvocation.create({
    data: {
      organizationId: context.organizationId,
      agentId: context.agentId,
      callId: context.callId ?? null,
      contactId: context.contactId ?? null,
      toolName: CONFIRM_TOOL_NAME,
      source: context.source,
      status: 'pending',
      arguments: toInputJson(parsed.data),
    },
  });

  try {
    const result = await resolvePendingConfirmation(
      parsed.data as ConfirmInput,
      context,
    );
    await prisma.toolInvocation.update({
      where: { id: invocation.id },
      data: {
        status: 'success',
        result: toInputJson(result),
        durationMs: Date.now() - start,
      },
    });
    return result;
  } catch (err) {
    await prisma.toolInvocation.update({
      where: { id: invocation.id },
      data: {
        status: 'error',
        errorMessage: errorMessage(err),
        durationMs: Date.now() - start,
      },
    });
    throw err;
  }
}

async function createPendingConfirmation(
  tool: ToolDefinition,
  args: unknown,
  context: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  const prompt =
    tool.confirmationPrompt?.(args, context) ??
    `Confirm with the caller before running ${tool.title}.`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const invocation = await prisma.toolInvocation.create({
    data: {
      organizationId: context.organizationId,
      agentId: context.agentId,
      callId: context.callId ?? null,
      contactId: context.contactId ?? null,
      toolName: tool.name,
      source: context.source,
      status: 'pending_confirmation',
      arguments: toInputJson(args),
    },
  });

  const pending = await prisma.pendingToolConfirmation.create({
    data: {
      organizationId: context.organizationId,
      agentId: context.agentId,
      callId: context.callId ?? null,
      toolName: tool.name,
      arguments: toInputJson(args),
      prompt,
      expiresAt,
      invocationId: invocation.id,
    },
  });

  await prisma.toolInvocation.update({
    where: { id: invocation.id },
    data: { confirmationId: pending.id },
  });

  return {
    status: 'confirmation_required',
    confirmationId: pending.id,
    toolName: tool.name,
    prompt,
    expiresAt: expiresAt.toISOString(),
  };
}

async function resolvePendingConfirmation(
  args: ConfirmInput,
  context: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  const pending = await prisma.pendingToolConfirmation.findFirst({
    where: {
      id: args.confirmationId,
      organizationId: context.organizationId,
      agentId: context.agentId,
      ...(context.callId ? { callId: context.callId } : {}),
    },
  });
  if (!pending) {
    throw new ToolExecutionError(
      'Pending confirmation was not found',
      'confirmation_not_found',
    );
  }
  if (pending.status !== 'pending') {
    return {
      status: pending.status,
      confirmationId: pending.id,
      toolName: pending.toolName,
    };
  }
  if (pending.expiresAt.getTime() < Date.now()) {
    await prisma.pendingToolConfirmation.update({
      where: { id: pending.id },
      data: { status: 'expired' },
    });
    throw new ToolExecutionError(
      'Pending confirmation has expired',
      'confirmation_expired',
    );
  }
  if (!args.confirmed) {
    await markPendingConfirmation(pending.id, 'canceled');
    return {
      status: 'canceled',
      confirmationId: pending.id,
      toolName: pending.toolName,
    };
  }

  await markPendingConfirmation(pending.id, 'confirmed');
  return executeTool(
    pending.toolName,
    pending.arguments as Record<string, unknown>,
    context,
    {
      skipConfirmation: true,
      confirmationId: pending.id,
    },
  );
}

async function executeConfirmedTool(
  name: string,
  args: unknown,
  context: ToolExecutionContext,
  options: ExecuteOptions,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  const invocation = await prisma.toolInvocation.create({
    data: {
      organizationId: context.organizationId,
      agentId: context.agentId,
      callId: context.callId ?? null,
      contactId: context.contactId ?? null,
      toolName: name,
      source: context.source,
      status: 'pending',
      arguments: toInputJson(args),
      confirmationId: options.confirmationId ?? null,
    },
  });

  try {
    const result = await runToolHandler(name, args, context);
    const externalProvider = stringResultField(result, 'externalProvider');
    const externalId = stringResultField(result, 'externalId');
    await prisma.toolInvocation.update({
      where: { id: invocation.id },
      data: {
        status: 'success',
        result: toInputJson(result),
        externalProvider,
        externalId,
        durationMs: Date.now() - start,
      },
    });
    return result;
  } catch (err) {
    await prisma.toolInvocation.update({
      where: { id: invocation.id },
      data: {
        status: 'error',
        errorMessage: errorMessage(err),
        durationMs: Date.now() - start,
      },
    });
    throw err;
  }
}

async function runToolHandler(
  name: string,
  args: unknown,
  context: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  return executeExternalTool(
    name,
    args as Parameters<typeof executeExternalTool>[1],
    context,
  );
}

async function isToolEnabled(
  toolName: string,
  context: ToolExecutionContext,
): Promise<boolean> {
  if (toolName === CONFIRM_TOOL_NAME) return true;
  const tool = await getOrganizationToolDefinition(
    context.organizationId,
    toolName,
  );
  if (!tool) return false;
  const grant = await prisma.agentToolGrant.findUnique({
    where: {
      agentId_toolName: {
        agentId: context.agentId,
        toolName,
      },
    },
  });
  if (grant) return grant.status === 'enabled';
  return tool.defaultEnabled;
}

async function getOrganizationToolDefinition(
  organizationId: string,
  toolName: string,
): Promise<ToolDefinition | undefined> {
  const definitions = await getOrganizationToolDefinitions(organizationId);
  return definitions.find((tool) => tool.name === toolName);
}

async function getOrganizationToolDefinitions(
  organizationId: string,
): Promise<ToolDefinition[]> {
  const byName = new Map<string, ToolDefinition>(
    toolDefinitions.map((tool) => [tool.name, tool]),
  );

  const integrations = await prisma.integrationConnection.findMany({
    where: {
      organizationId,
      status: 'active',
      provider: { in: ['custom_api', 'notion', 'google_calendar'] },
    },
    select: {
      provider: true,
      config: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'asc' },
  });

  for (const integration of integrations.sort(compareIntegrationToolConfig)) {
    applyConfiguredIntegrationTools(byName, integration);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function applyConfiguredIntegrationTools(
  byName: Map<string, ToolDefinition>,
  integration: IntegrationToolConfig,
) {
  for (const [toolName, toolConfig] of configuredToolEntries(
    integration.config,
  )) {
    if (
      integration.provider === 'google_calendar' &&
      toolName !== 'calendar_create_event'
    ) {
      continue;
    }

    const base = byName.get(toolName);
    const definition = buildConfiguredToolDefinition({
      name: toolName,
      provider: integration.provider,
      config: toolConfig,
      ...(base ? { base } : {}),
    });
    if (definition) byName.set(toolName, definition);
  }
}

function compareIntegrationToolConfig(
  a: IntegrationToolConfig,
  b: IntegrationToolConfig,
): number {
  const providerDelta =
    integrationDefinitionRank(a.provider) -
    integrationDefinitionRank(b.provider);
  if (providerDelta !== 0) return providerDelta;
  return a.updatedAt.getTime() - b.updatedAt.getTime();
}

function integrationDefinitionRank(provider: string): number {
  if (provider === 'notion') return 0;
  if (provider === 'custom_api') return 1;
  if (provider === 'google_calendar') return 2;
  return 0;
}

async function markPendingConfirmation(
  id: string,
  status: 'confirmed' | 'canceled' | 'expired',
) {
  const pending = await prisma.pendingToolConfirmation.update({
    where: { id },
    data: { status },
  });
  if (pending.invocationId) {
    await prisma.toolInvocation.update({
      where: { id: pending.invocationId },
      data: { status: status === 'confirmed' ? 'success' : status },
    });
  }
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stringResultField(
  result: Record<string, unknown>,
  key: string,
): string | null {
  const value = result[key];
  return typeof value === 'string' && value ? value : null;
}
