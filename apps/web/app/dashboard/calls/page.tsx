'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CallIcon,
  CallIncoming01Icon,
  CallOutgoing01Icon,
  Search01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons';
import {
  useAcceptHandoffCall,
  useCalls,
  useCallStats,
  type CallFilters,
} from './use-calls';
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  formatContactName,
  formatDuration,
  formatPhone,
  formatRelative,
  isActive,
} from './format';
import { PageHeader } from '../components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL = '__all__';
const PAGE_SIZE = 10;

export default function CallsPage() {
  const [filters, setFilters] = useState<CallFilters>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useCalls({
    ...filters,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const stats = useCallStats();
  const acceptHandoff = useAcceptHandoffCall();

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const pageCount = pagination?.pageCount ?? 1;
  const total = pagination?.total ?? items.length;
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  function updateFilters(updater: (current: CallFilters) => CallFilters) {
    setPage(1);
    setFilters(updater);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Calls"
        description="Inbound and outbound calls handled by your AI agents"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active now"
          value={stats.data?.activeNow ?? 0}
          loading={stats.isLoading}
          highlight={Boolean(stats.data?.activeNow)}
        />
        <StatCard
          label="Calls today"
          value={stats.data?.callsToday ?? 0}
          loading={stats.isLoading}
        />
        <StatCard
          label="Handed off today"
          value={stats.data?.handedOffToday ?? 0}
          loading={stats.isLoading}
        />
        <StatCard
          label="Avg. handle time"
          value={formatDuration(stats.data?.avgDurationSeconds ?? null)}
          loading={stats.isLoading}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 border-b sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Call history</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                size={14}
                strokeWidth={1.6}
                className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2"
              />
              <Input
                placeholder="Search number…"
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                className="h-9 w-44 pl-8 text-sm"
              />
            </div>
            <Select
              value={filters.status ?? ALL}
              onValueChange={(v) =>
                updateFilters((f) => ({
                  ...f,
                  status: v === ALL ? undefined : (v as CallFilters['status']),
                }))
              }
            >
              <SelectTrigger className="h-9 w-36 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.direction ?? ALL}
              onValueChange={(v) =>
                updateFilters((f) => ({
                  ...f,
                  direction:
                    v === ALL ? undefined : (v as 'inbound' | 'outbound'),
                }))
              }
            >
              <SelectTrigger className="h-9 w-32 text-sm">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All directions</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>
            {(filters.status ||
              filters.direction ||
              filters.handedOff !== undefined ||
              search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({});
                  setSearch('');
                  setPage(1);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>From</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => {
                        // Soft-navigate via Link wrapper would be cleaner;
                        // table row asChild isn't supported, so we use window
                        window.location.href = `/dashboard/calls/${c.id}`;
                      }}
                    >
                      <TableCell>
                        <HugeiconsIcon
                          icon={
                            c.direction === 'inbound'
                              ? CallIncoming01Icon
                              : CallOutgoing01Icon
                          }
                          size={16}
                          strokeWidth={1.6}
                          className="text-muted-foreground"
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/calls/${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium hover:underline"
                        >
                          {c.contact
                            ? formatContactName(c.contact)
                            : formatPhone(c.callerNumber)}
                        </Link>
                        {c.contact && (
                          <div className="text-muted-foreground font-mono text-xs">
                            {formatPhone(c.callerNumber)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.agent?.name ?? (
                          <span className="text-muted-foreground italic">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {formatDuration(c.duration)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatRelative(c.startedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={STATUS_VARIANT[c.status]}
                            className="capitalize"
                          >
                            {isActive(c.status) && (
                              <span className="bg-primary mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full" />
                            )}
                            {STATUS_LABEL[c.status]}
                          </Badge>
                          {c.handedOff && (
                            <Badge variant="outline" className="gap-1">
                              <HugeiconsIcon
                                icon={UserGroupIcon}
                                size={10}
                                strokeWidth={1.6}
                              />
                              Handoff
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.status === 'queued' && c.handedOff && (
                          <Button
                            size="sm"
                            disabled={acceptHandoff.isPending}
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await acceptHandoff.mutateAsync(c.id);
                                toast.success('Handoff accepted');
                                window.location.href = `/dashboard/calls/${c.id}`;
                              } catch (err) {
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : 'Failed to accept handoff',
                                );
                              }
                            }}
                          >
                            Accept
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="text-muted-foreground">
                  Showing {start}-{end} of {total}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <span className="text-muted-foreground min-w-24 text-center">
                    Page {page} of {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page >= pageCount}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  highlight,
}: {
  label: string;
  value: string | number;
  loading?: boolean;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-semibold tracking-tight">{value}</div>
            {highlight && (
              <span className="bg-primary h-2 w-2 animate-pulse rounded-full" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
        <HugeiconsIcon icon={CallIcon} size={22} strokeWidth={1.6} />
      </div>
      <div>
        <h3 className="text-base font-medium">No calls yet</h3>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          Calls will appear here as your AI agents start answering. Configure a
          phone number and assign an agent to begin.
        </p>
      </div>
    </div>
  );
}
