import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CampaignStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'completed'
  | 'canceled';

export type Campaign = {
  id: string;
  organizationId: string;
  agentId: string;
  phoneNumberId: string | null;
  name: string;
  description: string | null;
  status: CampaignStatus;
  openingMessage: string;
  campaignPrompt: string;
  maxConcurrency: number;
  maxAttempts: number;
  retryDelayMinutes: number;
  callTimeoutSeconds: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
  startedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; name: string };
  phoneNumber?: {
    id: string;
    number: string;
    friendlyName: string | null;
  } | null;
  _count?: { recipients: number; calls: number };
  summary?: CampaignSummary;
};

export type CampaignSummary = {
  total: number;
  queued: number;
  dialing: number;
  inCall: number;
  completed: number;
  skipped: number;
  canceled: number;
  answered: number;
  failed: number;
  optOuts: number;
};

export type CampaignInput = {
  name: string;
  description?: string | null;
  agentId: string;
  phoneNumberId?: string | null;
  openingMessage: string;
  campaignPrompt?: string;
  maxConcurrency?: number;
  maxAttempts?: number;
  retryDelayMinutes?: number;
  callTimeoutSeconds?: number;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone?: string;
};

export type CampaignRecipient = {
  id: string;
  campaignId: string;
  contactId: string | null;
  phoneNumber: string;
  displayName: string | null;
  email: string | null;
  variables: Record<string, unknown> | null;
  status:
    | 'queued'
    | 'dialing'
    | 'in_call'
    | 'completed'
    | 'skipped'
    | 'canceled';
  deliveryStatus: string | null;
  outcome: string | null;
  outcomeNotes: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
    callConsentStatus: string;
  } | null;
};

export const campaignKeys = {
  all: ['campaigns'] as const,
  list: () => [...campaignKeys.all, 'list'] as const,
  detail: (id: string) => [...campaignKeys.all, 'detail', id] as const,
  recipients: (id: string) =>
    [...campaignKeys.detail(id), 'recipients'] as const,
};

export function useCampaigns() {
  return useQuery({
    queryKey: campaignKeys.list(),
    queryFn: () => api<Campaign[]>('/api/campaigns'),
    refetchInterval: 10_000,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: () => api<Campaign>(`/api/campaigns/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 5000 : false),
  });
}

export function useCampaignRecipients(id: string) {
  return useQuery({
    queryKey: campaignKeys.recipients(id),
    queryFn: () => api<CampaignRecipient[]>(`/api/campaigns/${id}/recipients`),
    refetchInterval: 5000,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CampaignInput) =>
      api<Campaign>('/api/campaigns', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: campaignKeys.all }),
  });
}

export function useAddCampaignContacts(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactIds: string[]) =>
      api<{ added: number; skipped: number }>(
        `/api/campaigns/${id}/recipients/contacts`,
        { method: 'POST', body: { contactIds } },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) }),
  });
}

export function useUploadCampaignCsv(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set('file', file);
      return api<{ added: number; skipped: number; skippedRows: unknown[] }>(
        `/api/campaigns/${id}/recipients/upload`,
        { method: 'POST', body: form },
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) }),
  });
}

export function useCampaignAction(id: string, action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<Campaign>(`/api/campaigns/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: campaignKeys.all }),
  });
}
