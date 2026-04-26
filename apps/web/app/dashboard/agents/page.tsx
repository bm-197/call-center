'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  BotIcon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { useAgents, useDeleteAgent, type Agent } from './use-agents';
import { PageHeader } from '../components/page-header';
import { ConfirmDialog } from '../components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUS_VARIANT = {
  active: 'default',
  draft: 'secondary',
  paused: 'outline',
} as const;

const LANGUAGE_LABEL = {
  am: 'Amharic',
  en: 'English',
  'am+en': 'Amharic + English',
} as const;

export default function AgentsPage() {
  const { data: agents, isLoading } = useAgents();
  const del = useDeleteAgent();
  const [toDelete, setToDelete] = useState<Agent | null>(null);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Agents"
        description="AI agents that answer calls and chat in Amharic"
        action={
          <Button asChild>
            <Link href="/dashboard/agents/new">
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
              New agent
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      ) : !agents || agents.length === 0 ? (
        <EmptyState />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/agents/${a.id}`}
                        className="hover:underline"
                      >
                        <div className="font-medium">{a.name}</div>
                        {a.description && (
                          <div className="text-muted-foreground line-clamp-1 text-xs">
                            {a.description}
                          </div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {LANGUAGE_LABEL[a.language]}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {a.llmProvider} / {a.llmModel}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[a.status]}
                        className="capitalize"
                      >
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(a.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <HugeiconsIcon
                              icon={MoreHorizontalIcon}
                              size={16}
                              strokeWidth={1.6}
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/agents/${a.id}`}>Edit</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setToDelete(a)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        config={
          toDelete
            ? {
                title: `Delete agent "${toDelete.name}"?`,
                description:
                  'This permanently removes the agent and unlinks it from any phone numbers. Past calls handled by this agent are kept.',
                confirmLabel: 'Delete agent',
                destructive: true,
              }
            : null
        }
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await del.mutateAsync(toDelete.id);
            toast.success('Agent deleted');
            setToDelete(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to delete');
          }
        }}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
          <HugeiconsIcon icon={BotIcon} size={22} strokeWidth={1.6} />
        </div>
        <div>
          <h3 className="text-base font-medium">No agents yet</h3>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Create your first AI agent to start answering Amharic calls
            automatically.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/agents/new">
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
            Create your first agent
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
