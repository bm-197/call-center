'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Megaphone01Icon } from '@hugeicons/core-free-icons';
import {
  useCampaigns,
  useCreateCampaign,
  type CampaignInput,
  type CampaignStatus,
} from './use-campaigns';
import { useAgents } from '../agents/use-agents';
import { usePhoneNumbers } from '../phone-numbers/use-phone-numbers';
import { PageHeader } from '../components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_VARIANT: Record<
  CampaignStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'outline',
  running: 'default',
  paused: 'secondary',
  completed: 'outline',
  canceled: 'destructive',
};
const PAGE_SIZE = 10;

export default function CampaignsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useCampaigns({ page, pageSize: PAGE_SIZE });
  const [open, setOpen] = useState(false);
  const campaigns = data?.items ?? [];
  const pagination = data?.pagination;
  const total = pagination?.total ?? campaigns.length;
  const pageCount = pagination?.pageCount ?? 1;
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Campaigns"
        description="Outbound AI calls for opted-in customer outreach"
        action={
          <Button onClick={() => setOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
            New campaign
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
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
              <HugeiconsIcon
                icon={Megaphone01Icon}
                size={22}
                strokeWidth={1.6}
              />
            </div>
            <div>
              <h3 className="text-base font-medium">No campaigns yet</h3>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Create a campaign, add opted-in recipients, and start
                progressive outbound calls to your dev softphones.
              </p>
            </div>
            <Button onClick={() => setOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
              Create campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/campaigns/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.description && (
                        <div className="text-muted-foreground line-clamp-1 text-xs">
                          {c.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.agent?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c._count?.recipients ?? 0}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c._count?.calls ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[c.status]}
                        className="capitalize"
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(c.updatedAt).toLocaleDateString()}
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
          </CardContent>
        </Card>
      )}

      {open && <CreateCampaignDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

const NONE = '__none__';

function CreateCampaignDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateCampaign();
  const { data: agents } = useAgents();
  const { data: numbers } = usePhoneNumbers();
  const activeAgents = (agents ?? []).filter((a) => a.status === 'active');
  const [form, setForm] = useState<CampaignInput>({
    name: '',
    description: '',
    agentId: '',
    phoneNumberId: null,
    openingMessage:
      'ሰላም {{firstName}}, ከኩባንያችን እየደወልን ነው። ስለ አገልግሎታችን አጭር መረጃ ልንነግርዎት እንፈልጋለን።',
    campaignPrompt:
      'You are making a polite outbound marketing call. Keep the conversation short, answer questions from the knowledge base when possible, and respect opt-out requests immediately.',
    maxConcurrency: 2,
    maxAttempts: 2,
    retryDelayMinutes: 30,
    callTimeoutSeconds: 30,
    quietHoursStart: '09:00',
    quietHoursEnd: '18:00',
    timezone: 'Africa/Addis_Ababa',
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const created = await create.mutateAsync(form);
      toast.success('Campaign created');
      onClose();
      window.location.href = `/dashboard/campaigns/${created.id}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create campaign');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create campaign</DialogTitle>
          <DialogDescription>
            V1 dials registered dev softphone endpoints, so recipient phone
            numbers should match endpoint names like 1001 or 1002.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent">Agent</Label>
              <Select
                value={form.agentId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, agentId: v }))}
              >
                <SelectTrigger id="agent">
                  <SelectValue placeholder="Select an active agent" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {activeAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="from">Caller ID</Label>
            <Select
              value={form.phoneNumberId ?? NONE}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, phoneNumberId: v === NONE ? null : v }))
              }
            >
              <SelectTrigger id="from">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE}>Use campaign default</SelectItem>
                {(numbers ?? []).map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.number} {n.friendlyName ? `· ${n.friendlyName}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="opening">Opening message</Label>
            <Textarea
              id="opening"
              required
              rows={4}
              value={form.openingMessage}
              onChange={(e) =>
                setForm((f) => ({ ...f, openingMessage: e.target.value }))
              }
            />
            <p className="text-muted-foreground text-xs">
              Supports template fields like {'{{firstName}}'} and custom CSV
              columns.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">Campaign instructions</Label>
            <Textarea
              id="prompt"
              rows={4}
              value={form.campaignPrompt ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, campaignPrompt: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <NumberField
              label="Concurrency"
              value={form.maxConcurrency ?? 2}
              onChange={(v) => setForm((f) => ({ ...f, maxConcurrency: v }))}
            />
            <NumberField
              label="Attempts"
              value={form.maxAttempts ?? 2}
              onChange={(v) => setForm((f) => ({ ...f, maxAttempts: v }))}
            />
            <NumberField
              label="Retry min"
              value={form.retryDelayMinutes ?? 30}
              onChange={(v) => setForm((f) => ({ ...f, retryDelayMinutes: v }))}
            />
            <NumberField
              label="Timeout sec"
              value={form.callTimeoutSeconds ?? 30}
              onChange={(v) =>
                setForm((f) => ({ ...f, callTimeoutSeconds: v }))
              }
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !form.agentId}>
              {create.isPending ? 'Creating…' : 'Create campaign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
