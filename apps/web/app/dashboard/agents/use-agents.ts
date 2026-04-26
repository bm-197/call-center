import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type Agent = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  language: 'am' | 'en' | 'am+en';
  status: 'draft' | 'active' | 'paused';
  systemPrompt: string;
  llmProvider: 'openai' | 'google';
  llmModel: string;
  sttProvider: 'google' | 'whisper';
  ttsProvider: 'google';
  ttsVoice: string;
  handoffEnabled: boolean;
  handoffConfidenceThreshold: number;
  handoffMaxFailedAttempts: number;
  handoffMessage: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentInput = Partial<
  Omit<Agent, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
> & {
  name: string;
};

export const agentsKeys = {
  all: ['agents'] as const,
  list: () => [...agentsKeys.all, 'list'] as const,
  detail: (id: string) => [...agentsKeys.all, 'detail', id] as const,
};

export function useAgents() {
  return useQuery({
    queryKey: agentsKeys.list(),
    queryFn: () => api<Agent[]>('/api/agents'),
  });
}

export function useAgent(id: string | undefined) {
  return useQuery({
    queryKey: agentsKeys.detail(id ?? ''),
    queryFn: () => api<Agent>(`/api/agents/${id}`),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AgentInput) =>
      api<Agent>('/api/agents', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentsKeys.all }),
  });
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AgentInput>) =>
      api<Agent>(`/api/agents/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentsKeys.all });
      qc.invalidateQueries({ queryKey: agentsKeys.detail(id) });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentsKeys.all }),
  });
}
