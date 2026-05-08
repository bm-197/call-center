import { useQuery } from '@tanstack/react-query';
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

export const callsKeys = {
  all: ['calls'] as const,
  list: (filters?: CallFilters) => [...callsKeys.all, 'list', filters] as const,
  detail: (id: string) => [...callsKeys.all, 'detail', id] as const,
  stats: () => [...callsKeys.all, 'stats'] as const,
};

function buildQuery(filters: CallFilters | undefined): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.agentId) params.set('agentId', filters.agentId);
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.handedOff !== undefined)
    params.set('handedOff', String(filters.handedOff));
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useCalls(filters?: CallFilters) {
  return useQuery({
    queryKey: callsKeys.list(filters),
    queryFn: () =>
      api<{ items: CallListItem[]; nextCursor: string | null }>(
        `/api/calls${buildQuery(filters)}`,
      ),
    refetchInterval: 5000, // live-ish updates while a call is in progress
  });
}

export function useCall(id: string | undefined) {
  return useQuery({
    queryKey: callsKeys.detail(id ?? ''),
    queryFn: () => api<CallDetail>(`/api/calls/${id}`),
    enabled: !!id,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      // Keep refreshing while the call is still active
      const live = [
        'ringing',
        'in_progress',
        'ai_handling',
        'queued',
        'human_handling',
      ];
      return live.includes(data.status) ? 2000 : false;
    },
  });
}

export function useCallStats() {
  return useQuery({
    queryKey: callsKeys.stats(),
    queryFn: () => api<CallStats>('/api/calls/stats'),
    refetchInterval: 10_000,
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
