import { z } from 'zod';
import type { Capability } from '@better-auth/agent-auth';
import type { FunctionDeclaration } from '@google/genai';

export const CONFIRM_TOOL_NAME = 'confirm_tool_action';

export type JsonSchema = Record<string, unknown>;

export type ToolExecutionContext = {
  organizationId: string;
  agentId: string;
  callId?: string | null;
  contactId?: string | null;
  callerNumber?: string | null;
  calleeNumber?: string | null;
  source: 'voice' | 'mcp' | 'agent-auth' | 'api';
  actorId?: string | null;
};

export type ToolHandler<TInput> = (
  args: TInput,
  context: ToolExecutionContext,
) => Promise<Record<string, unknown>>;

export type ToolDefinition<TInput = unknown> = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  schema: z.ZodType<TInput>;
  defaultEnabled: boolean;
  requiresConfirmation: boolean;
  confirmationPrompt?: (args: TInput, context: ToolExecutionContext) => string;
  handler: ToolHandler<TInput>;
};

export type ConfiguredToolOptions = {
  name: string;
  provider: string;
  config: unknown;
  base?: ToolDefinition;
};

const waitlistInput = z.object({
  name: z.string().min(1).max(160).optional(),
  phoneNumber: z.string().min(3).max(40).optional(),
  email: z.string().email().optional(),
  feature: z.string().min(1).max(160).optional(),
  notes: z.string().max(2000).optional(),
});

const contactNotesInput = z.object({
  contactId: z.string().min(1).optional(),
  phoneNumber: z.string().min(3).max(40).optional(),
  notes: z.string().min(1).max(4000),
});

const calendarInput = z.object({
  title: z.string().min(1).max(200),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(480).default(30),
  timezone: z.string().min(1).max(80).default('Africa/Addis_Ababa'),
  attendeeName: z.string().min(1).max(160).optional(),
  attendeePhone: z.string().min(3).max(40).optional(),
  notes: z.string().max(2000).optional(),
});

const confirmInput = z.object({
  confirmationId: z.string().min(1),
  confirmed: z.boolean(),
  callerResponse: z.string().max(1000).optional(),
});

export type WaitlistInput = z.infer<typeof waitlistInput>;
export type ContactNotesInput = z.infer<typeof contactNotesInput>;
export type CalendarInput = z.infer<typeof calendarInput>;
export type ConfirmInput = z.infer<typeof confirmInput>;

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'waitlist_add_contact',
    title: 'Add Contact To Waitlist',
    description:
      'Add the caller or a named customer to an external waitlist in the connected CMS, CRM, or Notion workspace.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', description: 'Customer name, if known.' },
        phoneNumber: {
          type: 'string',
          description:
            'Customer phone number. Omit when the current caller should be used.',
        },
        email: { type: 'string', format: 'email' },
        feature: {
          type: 'string',
          description: 'Feature, product, service, or waitlist name.',
        },
        notes: { type: 'string', description: 'Extra caller details.' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        externalProvider: { type: 'string' },
        externalId: { type: 'string' },
      },
    },
    schema: waitlistInput,
    defaultEnabled: true,
    requiresConfirmation: true,
    confirmationPrompt: (args) => {
      const input = args as WaitlistInput;
      const target = input.name ? `${input.name}` : 'the caller';
      const feature = input.feature ? ` for ${input.feature}` : '';
      return `Confirm with the caller before adding ${target}${feature} to the waitlist.`;
    },
    handler: async () => {
      throw new Error('waitlist_add_contact handler is not attached');
    },
  },
  {
    name: 'contact_update_notes',
    title: 'Update Contact Notes',
    description:
      'Send a customer note to the connected external CMS, CRM, or Notion workspace after the caller provides information.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        contactId: { type: 'string' },
        phoneNumber: {
          type: 'string',
          description:
            'Customer phone number. Omit when the current caller should be used.',
        },
        notes: { type: 'string', description: 'Notes to append.' },
      },
      required: ['notes'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        externalProvider: { type: 'string' },
        externalId: { type: 'string' },
      },
    },
    schema: contactNotesInput,
    defaultEnabled: true,
    requiresConfirmation: true,
    confirmationPrompt: () =>
      'Confirm with the caller before saving this note to their contact record.',
    handler: async () => {
      throw new Error('contact_update_notes handler is not attached');
    },
  },
  {
    name: 'calendar_create_event',
    title: 'Create Appointment',
    description:
      'Create an appointment or callback in the connected external calendar, CMS, or scheduling system.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        startsAt: {
          type: 'string',
          format: 'date-time',
          description: 'Appointment start time as an ISO date-time string.',
        },
        durationMinutes: {
          type: 'integer',
          minimum: 5,
          maximum: 480,
          default: 30,
        },
        timezone: {
          type: 'string',
          default: 'Africa/Addis_Ababa',
        },
        attendeeName: { type: 'string' },
        attendeePhone: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['title', 'startsAt'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        externalProvider: { type: 'string' },
        externalId: { type: 'string' },
      },
    },
    schema: calendarInput,
    defaultEnabled: true,
    requiresConfirmation: true,
    confirmationPrompt: (args) => {
      const input = args as CalendarInput;
      return `Confirm with the caller before scheduling "${input.title}" at ${input.startsAt}.`;
    },
    handler: async () => {
      throw new Error('calendar_create_event handler is not attached');
    },
  },
  {
    name: CONFIRM_TOOL_NAME,
    title: 'Confirm Tool Action',
    description:
      'Complete or cancel a pending action after the caller clearly confirms or rejects it.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        confirmationId: {
          type: 'string',
          description: 'The confirmation id returned by the pending action.',
        },
        confirmed: {
          type: 'boolean',
          description: 'True only when the caller explicitly confirmed.',
        },
        callerResponse: {
          type: 'string',
          description: 'Short summary of what the caller said.',
        },
      },
      required: ['confirmationId', 'confirmed'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
      },
    },
    schema: confirmInput,
    defaultEnabled: true,
    requiresConfirmation: false,
    handler: async () => {
      throw new Error('confirm_tool_action handler is not attached');
    },
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find((tool) => tool.name === name);
}

const dynamicToolSchema = z.record(z.string(), z.unknown());
const toolNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const defaultDynamicInputSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {},
} satisfies JsonSchema;

export function isValidToolName(name: string): boolean {
  return toolNamePattern.test(name);
}

export function configuredToolEntries(
  integrationConfig: unknown,
): Array<[string, unknown]> {
  const config = jsonObject(integrationConfig);
  const tools = config.tools;
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) return [];
  return Object.entries(tools).filter(([name]) => isValidToolName(name));
}

export function buildConfiguredToolDefinition(
  opts: ConfiguredToolOptions,
): ToolDefinition | null {
  if (!isValidToolName(opts.name)) return null;

  const config = jsonObject(opts.config);
  const title =
    stringValue(config.title) ??
    opts.base?.title ??
    humanizeToolName(opts.name);
  const description =
    stringValue(config.description) ??
    opts.base?.description ??
    `Call the connected ${providerLabel(opts.provider)} integration for ${title}.`;
  const inputSchema =
    jsonSchemaValue(config.inputSchema) ??
    opts.base?.inputSchema ??
    defaultDynamicInputSchema;
  const outputSchema =
    jsonSchemaValue(config.outputSchema) ?? opts.base?.outputSchema;
  const defaultEnabled =
    booleanValue(config.defaultEnabled) ?? opts.base?.defaultEnabled ?? true;
  const requiresConfirmation =
    booleanValue(config.requiresConfirmation) ??
    opts.base?.requiresConfirmation ??
    true;
  const prompt = stringValue(config.confirmationPrompt);

  return {
    name: opts.name,
    title,
    description,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    schema: opts.base?.schema ?? dynamicToolSchema,
    defaultEnabled,
    requiresConfirmation,
    ...(prompt
      ? { confirmationPrompt: () => prompt }
      : opts.base?.confirmationPrompt
        ? { confirmationPrompt: opts.base.confirmationPrompt }
        : {}),
    handler:
      opts.base?.handler ??
      (async () => {
        throw new Error(`${opts.name} handler is not attached`);
      }),
  };
}

export function toFunctionDeclaration(
  tool: ToolDefinition,
): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.inputSchema,
    responseJsonSchema: tool.outputSchema,
  };
}

export function toAgentAuthCapability(tool: ToolDefinition): Capability {
  const capability: Capability = {
    name: tool.name,
    description: tool.description,
    input: tool.inputSchema,
    approvalStrength: tool.requiresConfirmation ? 'session' : 'none',
  };
  if (tool.outputSchema) capability.output = tool.outputSchema;
  return capability;
}

export const agentAuthCapabilities = toolDefinitions.map(toAgentAuthCapability);

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function jsonSchemaValue(value: unknown): JsonSchema | null {
  const object = jsonObject(value);
  if (Object.keys(object).length === 0) return null;
  return object;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function humanizeToolName(name: string): string {
  return name
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function providerLabel(provider: string): string {
  if (provider === 'custom_api') return 'custom API';
  if (provider === 'google_calendar') return 'Google Calendar';
  return provider.replaceAll('_', ' ');
}
