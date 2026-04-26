import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/server-auth';
import { PageHeader } from './components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session) redirect('/sign-in');

  const stats = [
    { label: 'Active calls', value: '0', hint: 'Live now' },
    { label: 'Calls today', value: '0', hint: 'Since midnight' },
    { label: 'Avg. handle time', value: '0s', hint: 'Last 24h' },
    { label: 'Agents online', value: '0', hint: 'Of your team' },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back${session.user.name ? `, ${session.user.name.split(' ')[0]}` : ''}`}
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
              <div className="text-3xl font-semibold tracking-tight">
                {stat.value}
              </div>
              <div className="text-muted-foreground mt-1 text-xs">
                {stat.hint}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Get started</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>1. Create your first AI agent in the Agents tab.</p>
          <p>2. Upload knowledge so the agent can answer questions.</p>
          <p>3. Invite your team to monitor calls and pick up handoffs.</p>
        </CardContent>
      </Card>
    </div>
  );
}
