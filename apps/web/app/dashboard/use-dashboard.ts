'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DashboardOverview = {
  activeCalls: number;
  callsToday: number;
  avgHandleTimeSeconds: number;
  activeAgents: number;
  totalAgents: number;
  runningCampaigns: number;
  queuedCampaignRecipients: number;
};

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: () => [...dashboardKeys.all, 'overview'] as const,
};

export function useDashboardOverview() {
  return useQuery({
    queryKey: dashboardKeys.overview(),
    queryFn: () => api<DashboardOverview>('/api/analytics/overview'),
  });
}
