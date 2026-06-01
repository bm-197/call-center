import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type IntegrationProvider =
  | 'custom_api'
  | 'notion'
  | 'google_calendar'
  | 'mcp';

export type IntegrationConnection = {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  name: string;
  status: 'inactive' | 'active' | 'error';
  config: Record<string, unknown> | null;
  credentials: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationInput = {
  provider: IntegrationProvider;
  name: string;
  status?: 'inactive' | 'active' | 'error';
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};

export type IntegrationUpdateInput = Partial<IntegrationInput>;

export type ToolInvocation = {
  id: string;
  organizationId: string;
  agentId: string | null;
  callId: string | null;
  contactId: string | null;
  toolName: string;
  source: string;
  status: string;
  arguments: unknown;
  result: unknown;
  errorMessage: string | null;
  confirmationId: string | null;
  externalProvider: string | null;
  externalId: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  defaultEnabled: boolean;
  requiresConfirmation: boolean;
  enabled: boolean;
  grantId: string | null;
  config: unknown;
};

export type ToolInvocationListParams = {
  page?: number;
  pageSize?: number;
};

export type PaginatedToolInvocations = {
  items: ToolInvocation[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

export const integrationKeys = {
  all: ['integrations'] as const,
  list: () => [...integrationKeys.all, 'list'] as const,
  invocations: (params?: ToolInvocationListParams) =>
    [...integrationKeys.all, 'invocations', params] as const,
  tools: (agentId: string) =>
    [...integrationKeys.all, 'tools', agentId] as const,
};

function buildInvocationQuery(params: ToolInvocationListParams | undefined) {
  if (!params) return '';
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export function useIntegrations() {
  return useQuery({
    queryKey: integrationKeys.list(),
    queryFn: () => api<IntegrationConnection[]>('/api/integrations'),
  });
}

export function useSaveIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IntegrationInput) =>
      api<IntegrationConnection>('/api/integrations', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}

export function useUpdateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: IntegrationUpdateInput;
    }) =>
      api<IntegrationConnection>(`/api/integrations/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}

export function useToolInvocations(params?: ToolInvocationListParams) {
  return useQuery({
    queryKey: integrationKeys.invocations(params),
    queryFn: () =>
      api<PaginatedToolInvocations>(
        `/api/tools/invocations${buildInvocationQuery(params)}`,
      ),
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function useAgentTools(agentId: string) {
  return useQuery({
    queryKey: integrationKeys.tools(agentId),
    queryFn: () => api<AgentTool[]>(`/api/tools/agents/${agentId}`),
    enabled: Boolean(agentId),
    retry: false,
  });
}

export function useTestTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      toolName,
      args,
    }: {
      agentId: string;
      toolName: string;
      args: Record<string, unknown>;
    }) =>
      api<Record<string, unknown>>(
        `/api/tools/agents/${agentId}/${toolName}/test`,
        { method: 'POST', body: args },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}
