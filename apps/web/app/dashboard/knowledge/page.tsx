'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  BookOpen01Icon,
  MoreHorizontalIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import {
  useKnowledgeSources,
  useDeleteKnowledge,
  useReindexKnowledge,
  type KnowledgeSource,
} from './use-knowledge';
import { PageHeader } from '../components/page-header';
import { ConfirmDialog } from '../components/confirm-dialog';
import { KnowledgeDialog } from './knowledge-dialog';
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

const STATUS_VARIANT: Record<
  KnowledgeSource['status'],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  completed: 'default',
  processing: 'secondary',
  pending: 'outline',
  failed: 'destructive',
};

const TYPE_LABEL: Record<KnowledgeSource['sourceType'], string> = {
  text: 'Text',
  faq: 'FAQ',
  url: 'URL',
  file: 'File',
};

const LANGUAGE_LABEL: Record<KnowledgeSource['language'], string> = {
  am: 'Amharic',
  en: 'English',
};

export default function KnowledgePage() {
  const { data: sources, isLoading } = useKnowledgeSources();
  const [editing, setEditing] = useState<KnowledgeSource | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<KnowledgeSource | null>(null);
  const del = useDeleteKnowledge();
  const reindex = useReindexKnowledge();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Knowledge"
        description="Documents your AI agents reference during calls. Supports Amharic and English."
        action={
          <Button onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
            Add knowledge
          </Button>
        }
      />

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      ) : !sources || sources.length === 0 ? (
        <EmptyState onAdd={() => setEditing('new')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      {s.description && (
                        <div className="text-muted-foreground line-clamp-1 text-xs">
                          {s.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {TYPE_LABEL[s.sourceType]}
                    </TableCell>
                    <TableCell className="text-sm">
                      {LANGUAGE_LABEL[s.language]}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.agent ? (
                        s.agent.name
                      ) : (
                        <span className="text-muted-foreground italic">
                          All agents
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {s.chunkCount}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[s.status]}
                        className="capitalize"
                      >
                        {s.status}
                      </Badge>
                      {s.status === 'failed' && s.errorMessage && (
                        <div
                          className="text-destructive mt-1 line-clamp-1 text-xs"
                          title={s.errorMessage}
                        >
                          {s.errorMessage}
                        </div>
                      )}
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
                          <DropdownMenuItem onClick={() => setEditing(s)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await reindex.mutateAsync(s.id);
                                toast.success('Reindexed');
                              } catch (e) {
                                toast.error(
                                  e instanceof Error
                                    ? e.message
                                    : 'Reindex failed',
                                );
                              }
                            }}
                          >
                            <HugeiconsIcon
                              icon={RefreshIcon}
                              size={14}
                              strokeWidth={1.6}
                            />
                            Reindex
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setToDelete(s)}
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

      {editing !== null && (
        <KnowledgeDialog
          key={editing === 'new' ? 'new' : editing.id}
          source={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        config={
          toDelete
            ? {
                title: `Delete "${toDelete.name}"?`,
                description: (
                  <>
                    This permanently removes the source and all{' '}
                    {toDelete.chunkCount} indexed chunks. The AI will no longer
                    reference this content during calls.
                  </>
                ),
                confirmLabel: 'Delete source',
                destructive: true,
              }
            : null
        }
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await del.mutateAsync(toDelete.id);
            toast.success('Knowledge source deleted');
            setToDelete(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to delete');
          }
        }}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
          <HugeiconsIcon icon={BookOpen01Icon} size={22} strokeWidth={1.6} />
        </div>
        <div>
          <h3 className="text-base font-medium">No knowledge yet</h3>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Add an FAQ, policy doc, or any text — Amharic or English — and your
            agents will reference it during calls.
          </p>
        </div>
        <Button onClick={onAdd}>
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
          Add your first source
        </Button>
      </CardContent>
    </Card>
  );
}
