'use client';

import { PageHeader } from './components/page-header';
import { useDashboardOverview } from './use-dashboard';
import { formatDuration } from './calls/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardClient({ firstName }: { firstName?: string | null }) {
  const overview = useDashboardOverview();
  const data = overview.data;

  const stats = [
    {
      label: 'Active calls',
      value: data?.activeCalls ?? 0,
      hint: 'Live now',
    },
    {
      label: 'Calls today',
      value: data?.callsToday ?? 0,
      hint: 'Since midnight',
    },
    {
      label: 'Avg. handle time',
      value: formatDuration(data?.avgHandleTimeSeconds ?? null),
      hint: 'Last 24h',
    },
    {
      label: 'Active agents',
      value: `${data?.activeAgents ?? 0}/${data?.totalAgents ?? 0}`,
      hint: 'Ready to take calls',
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        description="Your call center at a glance"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overview.isLoading ? (
                <Skeleton className="h-9 w-20" />
              ) : (
                <div className="text-3xl font-semibold tracking-tight">
                  {stat.value}
                </div>
              )}
              <div className="text-muted-foreground mt-1 text-xs">
                {stat.hint}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign queue</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Running campaigns
            </div>
            {overview.isLoading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <div className="mt-1 text-2xl font-semibold">
                {data?.runningCampaigns ?? 0}
              </div>
            )}
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Queued recipients
            </div>
            {overview.isLoading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <div className="mt-1 text-2xl font-semibold">
                {data?.queuedCampaignRecipients ?? 0}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
