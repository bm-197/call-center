import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CallStatus =
  | 'ringing'
  | 'in_progress'
  | 'ai_handling'
  | 'queued'
  | 'human_handling'
  | 'completed'
  | 'failed'
  | 'missed';

export type CallTranscriptTurn = {
  speaker: 'caller' | 'agent' | 'human';
  text: string;
  timestamp: string;
};

export type CallListItem = {
  id: string;
  direction: 'inbound' | 'outbound';
  callerNumber: string;
  calleeNumber: string;
  status: CallStatus;
  duration: number | null;
  handedOff: boolean;
  handoffReason: string | null;
  sentiment: number | null;
  startedAt: string;
  endedAt: string | null;
  agent: { id: string; name: string } | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
  } | null;
};

export type CallDetail = CallListItem & {
  transcriptAm: CallTranscriptTurn[] | null;
  transcriptEn: CallTranscriptTurn[] | null;
  summary: string | null;
  summaryEn: string | null;
  recordingUrl: string | null;
  recordingDuration: number | null;
  collectedInfo: Record<string, unknown> | null;
  creditsUsed: number;
  humanAgentId: string | null;
  handoffTime: string | null;
};

export type CallStats = {
  callsToday: number;
  activeNow: number;
  handedOffToday: number;
  avgDurationSeconds: number;
};

export type CallFilters = {
  status?: CallStatus;
  agentId?: string;
  direction?: 'inbound' | 'outbound';
  handedOff?: boolean;
  search?: string;
};

export type PageParams = {
  page?: number;
  pageSize?: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  } | null;
};

export type CallListParams = CallFilters & PageParams;

export const callsKeys = {
  all: ['calls'] as const,
  list: (params?: CallListParams) =>
    [...callsKeys.all, 'list', params] as const,
  detail: (id: string) => [...callsKeys.all, 'detail', id] as const,
  stats: () => [...callsKeys.all, 'stats'] as const,
};

function buildQuery(input: CallListParams | undefined): string {
  if (!input) return '';
  const params = new URLSearchParams();
  if (input.status) params.set('status', input.status);
  if (input.agentId) params.set('agentId', input.agentId);
  if (input.direction) params.set('direction', input.direction);
  if (input.handedOff !== undefined)
    params.set('handedOff', String(input.handedOff));
  if (input.search) params.set('search', input.search);
  if (input.page) params.set('page', String(input.page));
  if (input.pageSize) params.set('pageSize', String(input.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useCalls(params?: CallListParams) {
  return useQuery({
    queryKey: callsKeys.list(params),
    queryFn: () =>
      api<PaginatedResponse<CallListItem>>(`/api/calls${buildQuery(params)}`),
    placeholderData: (previous) => previous,
  });
}

export function useCall(id: string | undefined) {
  return useQuery({
    queryKey: callsKeys.detail(id ?? ''),
    queryFn: () => api<CallDetail>(`/api/calls/${id}`),
    enabled: !!id,
  });
}

export function useCallStats() {
  return useQuery({
    queryKey: callsKeys.stats(),
    queryFn: () => api<CallStats>('/api/calls/stats'),
  });
}

export function useCallRecording(id: string, enabled = false) {
  return useQuery({
    queryKey: [...callsKeys.detail(id), 'recording'],
    queryFn: () => api<{ url: string }>(`/api/calls/${id}/recording`),
    enabled,
    staleTime: 5 * 60_000, // presigned URL valid 10 min, refresh after 5
  });
}

export function useAcceptHandoffCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<CallDetail>(`/api/queue/${id}/accept`, { method: 'POST' }),
    onSuccess: (call) => {
      qc.setQueryData(callsKeys.detail(call.id), call);
      void qc.invalidateQueries({ queryKey: callsKeys.all });
    },
  });
}
