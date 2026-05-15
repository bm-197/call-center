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

export const integrationKeys = {
  all: ['integrations'] as const,
  list: () => [...integrationKeys.all, 'list'] as const,
  invocations: () => [...integrationKeys.all, 'invocations'] as const,
};

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

export function useToolInvocations() {
  return useQuery({
    queryKey: integrationKeys.invocations(),
    queryFn: () => api<ToolInvocation[]>('/api/tools/invocations'),
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
