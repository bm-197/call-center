import { prisma, Prisma } from '@call-center/db';
import type {
  CalendarInput,
  ContactNotesInput,
  ToolExecutionContext,
  WaitlistInput,
} from './registry.js';

type IntegrationConnection = {
  id: string;
  provider: string;
  name: string;
  config: Prisma.JsonValue | null;
  credentials: Prisma.JsonValue | null;
};

type ToolArgs = WaitlistInput | ContactNotesInput | CalendarInput;

type NotionPropertySchema = {
  type?: string;
};

type NotionDatabaseSchema = {
  properties?: Record<string, NotionPropertySchema>;
};

type NotionPropertyValue =
  | { title: Array<{ text: { content: string } }> }
  | { rich_text: Array<{ text: { content: string } }> }
  | { phone_number: string | null }
  | { email: string | null }
  | { url: string | null }
  | { number: number | null }
  | { checkbox: boolean }
  | { date: { start: string } | null }
  | { select: { name: string } | null }
  | { multi_select: Array<{ name: string }> };

const defaultNotionMappings: Record<string, Record<string, string>> = {
  waitlist_add_contact: {
    title: 'Name',
    phone: 'Phone',
    feature: 'Feature',
    notes: 'Notes',
    callerNumber: 'Caller',
    callId: 'Call ID',
    source: 'Source',
    createdAt: 'Created At',
  },
  contact_update_notes: {
    title: 'Name',
    phone: 'Phone',
    notes: 'Notes',
    callerNumber: 'Caller',
    callId: 'Call ID',
    source: 'Source',
    createdAt: 'Created At',
  },
  calendar_create_event: {
    title: 'Name',
    startsAt: 'Start',
    endsAt: 'End',
    notes: 'Notes',
    attendeePhone: 'Phone',
    callerNumber: 'Caller',
    callId: 'Call ID',
    source: 'Source',
    createdAt: 'Created At',
  },
};

export async function executeExternalTool(
  toolName: string,
  args: ToolArgs,
  context: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  const connection = await findConnectionForTool(toolName, context);
  if (!connection) {
    throw new Error(
      `No active external integration is configured for ${toolName}. Connect Notion, Google Calendar, or a custom CMS before enabling this tool.`,
    );
  }

  switch (connection.provider) {
    case 'custom_api':
      return executeCustomApiTool(connection, toolName, args, context);
    case 'notion':
      return executeNotionTool(connection, toolName, args, context);
    case 'google_calendar':
      if (toolName !== 'calendar_create_event') {
        throw new Error('Google Calendar only supports calendar_create_event');
      }
      return executeGoogleCalendarTool(
        connection,
        args as CalendarInput,
        context,
      );
    default:
      throw new Error(
        `Unsupported integration provider: ${connection.provider}`,
      );
  }
}

async function findConnectionForTool(
  toolName: string,
  context: ToolExecutionContext,
): Promise<IntegrationConnection | null> {
  const providerPriority =
    toolName === 'calendar_create_event'
      ? ['google_calendar', 'custom_api', 'notion']
      : ['custom_api', 'notion'];

  const connections = await prisma.integrationConnection.findMany({
    where: {
      organizationId: context.organizationId,
      status: 'active',
      provider: { in: providerPriority },
    },
    orderBy: { updatedAt: 'desc' },
  });

  for (const provider of providerPriority) {
    const match = connections.find(
      (connection) =>
        connection.provider === provider &&
        connectionSupportsTool(connection, toolName),
    );
    if (match) return match;
  }

  return null;
}

function connectionSupportsTool(
  connection: IntegrationConnection,
  toolName: string,
): boolean {
  const config = jsonObject(connection.config);
  const disabledTools = stringArray(config.disabledTools);
  if (disabledTools.includes(toolName)) return false;

  if (connection.provider === 'google_calendar') {
    return toolName === 'calendar_create_event';
  }

  if (connection.provider === 'notion') {
    return Boolean(resolveNotionDatabaseId(config, toolName));
  }

  if (connection.provider === 'custom_api') {
    return Boolean(resolveCustomEndpoint(config, toolName));
  }

  return false;
}

async function executeCustomApiTool(
  connection: IntegrationConnection,
  toolName: string,
  args: ToolArgs,
  context: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  const config = jsonObject(connection.config);
  const credentials = jsonObject(connection.credentials);
  const endpoint = resolveCustomEndpoint(config, toolName);
  if (!endpoint) {
    throw new Error(
      `Custom API integration is missing an endpoint for ${toolName}`,
    );
  }

  const url = requireHttpUrl(endpoint.url);
  const method = endpoint.method ?? 'POST';
  const headers = new Headers({
    'content-type': 'application/json',
    ...recordOfStrings(config.headers),
    ...recordOfStrings(endpoint.headers),
    ...recordOfStrings(credentials.headers),
  });

  const bearerToken = stringValue(credentials.bearerToken);
  if (bearerToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${bearerToken}`);
  }

  const apiKey = stringValue(credentials.apiKey);
  if (apiKey) {
    const headerName =
      stringValue(endpoint.apiKeyHeader) ??
      stringValue(config.apiKeyHeader) ??
      'x-api-key';
    if (!headers.has(headerName)) headers.set(headerName, apiKey);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify({
      toolName,
      arguments: args,
      context: externalContext(context),
      occurredAt: new Date().toISOString(),
    }),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      `Custom API ${method} ${url} failed with ${response.status}: ${stringifyPayload(payload)}`,
    );
  }

  return {
    status: 'executed',
    externalProvider: connection.provider,
    externalIntegrationId: connection.id,
    externalStatusCode: response.status,
    externalResult: payload,
  };
}

async function executeNotionTool(
  connection: IntegrationConnection,
  toolName: string,
  args: ToolArgs,
  context: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  const config = jsonObject(connection.config);
  const credentials = jsonObject(connection.credentials);
  const databaseId = resolveNotionDatabaseId(config, toolName);
  const token =
    stringValue(credentials.token) ??
    stringValue(credentials.accessToken) ??
    stringValue(config.token);

  if (!databaseId) {
    throw new Error(
      `Notion integration is missing a database id for ${toolName}`,
    );
  }
  if (!token) {
    throw new Error('Notion integration is missing credentials.token');
  }

  const notionVersion = stringValue(config.notionVersion) ?? '2022-06-28';
  const titleProperty =
    stringValue(toolConfig(config, toolName).titleProperty) ??
    stringValue(config.titleProperty) ??
    'Name';
  const databaseSchema = await fetchNotionDatabaseSchema(
    databaseId,
    token,
    notionVersion,
  );
  const properties = buildNotionProperties({
    toolName,
    args,
    context,
    config,
    titleProperty,
    databaseSchema,
  });

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'notion-version': notionVersion,
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
      children: buildNotionBlocks(toolName, args, context),
    }),
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      `Notion create page failed with ${response.status}: ${stringifyPayload(payload)}`,
    );
  }

  const externalId =
    payload && typeof payload === 'object' && 'id' in payload
      ? String((payload as { id: unknown }).id)
      : null;

  return {
    status: 'executed',
    externalProvider: connection.provider,
    externalIntegrationId: connection.id,
    externalId,
    externalResult: payload,
  };
}

async function fetchNotionDatabaseSchema(
  databaseId: string,
  token: string,
  notionVersion: string,
): Promise<NotionDatabaseSchema> {
  const response = await fetch(
    `https://api.notion.com/v1/databases/${encodeURIComponent(databaseId)}`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'notion-version': notionVersion,
      },
    },
  );
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      `Notion retrieve database failed with ${response.status}: ${stringifyPayload(payload)}`,
    );
  }
  return jsonObject(payload) as NotionDatabaseSchema;
}

async function executeGoogleCalendarTool(
  connection: IntegrationConnection,
  args: CalendarInput,
  context: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  const config = jsonObject(connection.config);
  const calendarId = encodeURIComponent(
    stringValue(config.calendarId) ?? 'primary',
  );
  const startsAt = new Date(args.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error('Invalid appointment start time');
  }
  const endsAt = new Date(startsAt.getTime() + args.durationMinutes * 60_000);

  const body = {
    summary: args.title,
    description: buildCalendarDescription(args, context),
    start: { dateTime: startsAt.toISOString(), timeZone: args.timezone },
    end: { dateTime: endsAt.toISOString(), timeZone: args.timezone },
  };

  let credentials = jsonObject(connection.credentials);
  let accessToken = await getGoogleAccessToken(connection, credentials);
  let response = await insertGoogleCalendarEvent(calendarId, accessToken, body);

  if (response.status === 401) {
    credentials = jsonObject(
      (
        await prisma.integrationConnection.findUnique({
          where: { id: connection.id },
          select: { credentials: true },
        })
      )?.credentials,
    );
    accessToken = await refreshGoogleAccessToken(connection, credentials);
    response = await insertGoogleCalendarEvent(calendarId, accessToken, body);
  }

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      `Google Calendar event insert failed with ${response.status}: ${stringifyPayload(payload)}`,
    );
  }

  const externalId =
    payload && typeof payload === 'object' && 'id' in payload
      ? String((payload as { id: unknown }).id)
      : null;

  return {
    status: 'executed',
    externalProvider: connection.provider,
    externalIntegrationId: connection.id,
    externalId,
    externalResult: payload,
  };
}

async function insertGoogleCalendarEvent(
  calendarId: string,
  accessToken: string,
  body: Record<string, unknown>,
) {
  return fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
}

async function getGoogleAccessToken(
  connection: IntegrationConnection,
  credentials: Record<string, unknown>,
): Promise<string> {
  const accessToken = stringValue(credentials.accessToken);
  if (accessToken) return accessToken;
  return refreshGoogleAccessToken(connection, credentials);
}

async function refreshGoogleAccessToken(
  connection: IntegrationConnection,
  credentials: Record<string, unknown>,
): Promise<string> {
  const refreshToken = stringValue(credentials.refreshToken);
  const clientId =
    stringValue(credentials.clientId) ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    stringValue(credentials.clientSecret) ?? process.env.GOOGLE_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Google Calendar integration requires accessToken, or refreshToken with clientId/clientSecret',
    );
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const payload = await parseResponse(response);
  if (!response.ok || !payload || typeof payload !== 'object') {
    throw new Error(
      `Google token refresh failed with ${response.status}: ${stringifyPayload(payload)}`,
    );
  }

  const accessToken = stringValue(
    (payload as Record<string, unknown>).access_token,
  );
  if (!accessToken) {
    throw new Error(
      'Google token refresh response did not include access_token',
    );
  }

  await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: {
      credentials: toInputJson({
        ...credentials,
        accessToken,
        tokenType: stringValue((payload as Record<string, unknown>).token_type),
        scope: stringValue((payload as Record<string, unknown>).scope),
        accessTokenExpiresAt: new Date(
          Date.now() +
            Number((payload as Record<string, unknown>).expires_in ?? 3600) *
              1000,
        ).toISOString(),
      }),
    },
  });

  return accessToken;
}

function resolveCustomEndpoint(
  config: Record<string, unknown>,
  toolName: string,
): {
  url: string;
  method?: string;
  headers?: unknown;
  apiKeyHeader?: unknown;
} | null {
  const perTool = toolConfig(config, toolName);
  const explicitUrl = stringValue(perTool.url) ?? stringValue(config.url);
  const baseUrl = stringValue(perTool.baseUrl) ?? stringValue(config.baseUrl);
  const path =
    stringValue(perTool.path) ??
    stringValue(config.path) ??
    `/tools/${toolName}`;

  const url = explicitUrl ?? (baseUrl ? joinUrl(baseUrl, path) : null);
  if (!url) return null;

  const method =
    stringValue(perTool.method)?.toUpperCase() ??
    stringValue(config.method)?.toUpperCase();
  return {
    url,
    ...(method ? { method } : {}),
    ...(perTool.headers !== undefined ? { headers: perTool.headers } : {}),
    ...(perTool.apiKeyHeader !== undefined
      ? { apiKeyHeader: perTool.apiKeyHeader }
      : {}),
  };
}

function resolveNotionDatabaseId(
  config: Record<string, unknown>,
  toolName: string,
): string | null {
  const perTool = toolConfig(config, toolName);
  const databases = jsonObject(config.databases);
  return (
    stringValue(perTool.databaseId) ??
    stringValue(databases[toolName]) ??
    stringValue(config.databaseId) ??
    null
  );
}

function toolConfig(
  config: Record<string, unknown>,
  toolName: string,
): Record<string, unknown> {
  const tools = config.tools;
  if (Array.isArray(tools)) {
    return tools.includes(toolName) ? {} : {};
  }
  const byTool = jsonObject(tools);
  return jsonObject(byTool[toolName]);
}

function buildNotionProperties(opts: {
  toolName: string;
  args: ToolArgs;
  context: ToolExecutionContext;
  config: Record<string, unknown>;
  titleProperty: string;
  databaseSchema: NotionDatabaseSchema;
}): Record<string, NotionPropertyValue> {
  const mapping = resolveNotionMapping(
    opts.config,
    opts.toolName,
    opts.titleProperty,
  );
  const values = notionFieldValues(opts.toolName, opts.args, opts.context);
  const properties: Record<string, NotionPropertyValue> = {};
  const schema = opts.databaseSchema.properties ?? {};

  for (const [field, propertyName] of Object.entries(mapping)) {
    const value = values[field];
    if (!hasNotionValue(value)) continue;

    const propertyType = schema[propertyName]?.type;
    if (!propertyType) {
      if (field === 'title') {
        throw new Error(
          `Notion database is missing required title property "${propertyName}"`,
        );
      }
      continue;
    }

    const propertyValue = toNotionPropertyValue(propertyType, value);
    if (propertyValue) properties[propertyName] = propertyValue;
  }

  const titleName = mapping.title ?? opts.titleProperty;
  if (!properties[titleName]) {
    const propertyType = schema[titleName]?.type;
    if (propertyType !== 'title') {
      throw new Error(
        `Notion database title property "${titleName}" must exist and be type Title`,
      );
    }
    properties[titleName] = {
      title: [
        {
          text: {
            content: buildNotionTitle(opts.toolName, opts.args, opts.context),
          },
        },
      ],
    };
  }

  return properties;
}

function resolveNotionMapping(
  config: Record<string, unknown>,
  toolName: string,
  titleProperty: string,
): Record<string, string> {
  const configuredMappings = jsonObject(config.mappings);
  const configuredToolMapping = recordOfStrings(configuredMappings[toolName]);
  const perTool = toolConfig(config, toolName);
  const perToolMapping = recordOfStrings(perTool.mapping);
  return {
    ...(defaultNotionMappings[toolName] ?? { title: titleProperty }),
    title: titleProperty,
    ...configuredToolMapping,
    ...perToolMapping,
  };
}

function notionFieldValues(
  toolName: string,
  args: ToolArgs,
  context: ToolExecutionContext,
): Record<string, unknown> {
  const common = {
    callerNumber: context.callerNumber,
    callId: context.callId,
    source: context.source,
    createdAt: new Date().toISOString(),
  };

  if (toolName === 'waitlist_add_contact') {
    const input = args as WaitlistInput;
    const phone = input.phoneNumber ?? context.callerNumber;
    return {
      ...common,
      title: input.name ?? phone ?? 'Waitlist contact',
      name: input.name,
      phone,
      feature: input.feature ?? 'general',
      notes: input.notes,
    };
  }

  if (toolName === 'contact_update_notes') {
    const input = args as ContactNotesInput;
    const phone = input.phoneNumber ?? context.callerNumber;
    return {
      ...common,
      title: `Contact note - ${phone ?? input.contactId ?? 'caller'}`,
      contactId: input.contactId,
      phone,
      notes: input.notes,
    };
  }

  const input = args as CalendarInput;
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  return {
    ...common,
    title: input.title,
    startsAt: Number.isNaN(startsAt.getTime()) ? input.startsAt : startsAt,
    endsAt: Number.isNaN(endsAt.getTime()) ? undefined : endsAt,
    notes: input.notes,
    attendeeName: input.attendeeName,
    attendeePhone: input.attendeePhone ?? context.callerNumber,
  };
}

function toNotionPropertyValue(
  propertyType: string,
  value: unknown,
): NotionPropertyValue | null {
  const text = notionText(value);

  switch (propertyType) {
    case 'title':
      return { title: richText(text) };
    case 'rich_text':
      return { rich_text: richText(text) };
    case 'phone_number':
      return { phone_number: text || null };
    case 'email':
      return { email: text || null };
    case 'url':
      return { url: text || null };
    case 'number': {
      const number =
        typeof value === 'number' ? value : Number.parseFloat(String(value));
      return { number: Number.isFinite(number) ? number : null };
    }
    case 'checkbox':
      return { checkbox: Boolean(value) };
    case 'date': {
      const date = notionDate(value);
      return { date: date ? { start: date } : null };
    }
    case 'select':
      return text ? { select: { name: text } } : { select: null };
    case 'multi_select': {
      const values = Array.isArray(value)
        ? value.map(notionText)
        : text.split(',').map((item) => item.trim());
      return {
        multi_select: values.filter(Boolean).map((item) => ({ name: item })),
      };
    }
    default:
      return null;
  }
}

function hasNotionValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function richText(content: string): Array<{ text: { content: string } }> {
  return content ? [{ text: { content } }] : [];
}

function notionText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function notionDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function buildNotionTitle(
  toolName: string,
  args: ToolArgs,
  context: ToolExecutionContext,
): string {
  if (toolName === 'waitlist_add_contact') {
    const input = args as WaitlistInput;
    return `${input.name ?? context.callerNumber ?? 'Caller'} - ${input.feature ?? 'Waitlist'}`;
  }
  if (toolName === 'contact_update_notes') {
    const input = args as ContactNotesInput;
    return `Contact note - ${input.phoneNumber ?? context.callerNumber ?? input.contactId ?? 'caller'}`;
  }
  const input = args as CalendarInput;
  return `Appointment - ${input.title}`;
}

function buildNotionBlocks(
  toolName: string,
  args: ToolArgs,
  context: ToolExecutionContext,
) {
  const content =
    toolName === 'calendar_create_event'
      ? buildCalendarDescription(args as CalendarInput, context)
      : buildNotionSummary(toolName, args, context);

  return chunkText(content, 1800).map((text) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  }));
}

function buildNotionSummary(
  toolName: string,
  args: ToolArgs,
  context: ToolExecutionContext,
): string {
  if (toolName === 'waitlist_add_contact') {
    const input = args as WaitlistInput;
    return [
      `Tool: ${toolName}`,
      input.name ? `Name: ${input.name}` : null,
      input.phoneNumber ? `Phone: ${input.phoneNumber}` : null,
      input.feature ? `Feature: ${input.feature}` : null,
      input.notes ? `Notes: ${input.notes}` : null,
      context.callerNumber ? `Caller: ${context.callerNumber}` : null,
      context.callId ? `Call ID: ${context.callId}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  const input = args as ContactNotesInput;
  return [
    `Tool: ${toolName}`,
    input.phoneNumber ? `Phone: ${input.phoneNumber}` : null,
    input.contactId ? `Contact ID: ${input.contactId}` : null,
    `Notes: ${input.notes}`,
    context.callerNumber ? `Caller: ${context.callerNumber}` : null,
    context.callId ? `Call ID: ${context.callId}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildCalendarDescription(
  args: CalendarInput,
  context: ToolExecutionContext,
): string {
  return [
    args.notes,
    args.attendeeName ? `Attendee: ${args.attendeeName}` : null,
    (args.attendeePhone ?? context.callerNumber)
      ? `Phone: ${args.attendeePhone ?? context.callerNumber}`
      : null,
    context.callId ? `Call ID: ${context.callId}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function externalContext(context: ToolExecutionContext) {
  return {
    organizationId: context.organizationId,
    agentId: context.agentId,
    callId: context.callId ?? null,
    contactId: context.contactId ?? null,
    callerNumber: context.callerNumber ?? null,
    calleeNumber: context.calleeNumber ?? null,
    source: context.source,
    actorId: context.actorId ?? null,
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }
  return text;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function recordOfStrings(value: unknown): Record<string, string> {
  const object = jsonObject(value);
  return Object.fromEntries(
    Object.entries(object).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function requireHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported integration URL protocol: ${url.protocol}`);
  }
  return url.toString();
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(cleanPath, base).toString();
}

function chunkText(value: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload.slice(0, 1000);
  return JSON.stringify(payload).slice(0, 1000);
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
