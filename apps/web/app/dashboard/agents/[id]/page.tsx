'use client';

import { use } from 'react';
import { useAgent } from '../use-agents';
import { PageHeader } from '../../components/page-header';
import { AgentForm } from '../agent-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: agent, isLoading, error } = useAgent(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Agent not found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title={agent.name} description="Edit agent configuration" />
      <AgentForm mode={{ kind: 'edit', agent }} />
    </div>
  );
}
