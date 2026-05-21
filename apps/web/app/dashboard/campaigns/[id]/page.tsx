'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  FileUploadIcon,
  PlayIcon,
  PauseIcon,
  Cancel01Icon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import {
  useAddCampaignContacts,
  useCampaign,
  useCampaignAction,
  useCampaignRecipients,
  useUploadCampaignCsv,
} from '../use-campaigns';
import { useContacts } from '../../contacts/use-contacts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: campaign, isLoading } = useCampaign(id);
  const { data: recipients } = useCampaignRecipients(id);
  const start = useCampaignAction(id, 'start');
  const pause = useCampaignAction(id, 'pause');
  const resume = useCampaignAction(id, 'resume');
  const cancel = useCampaignAction(id, 'cancel');
  const upload = useUploadCampaignCsv(id);
  const fileInput = useRef<HTMLInputElement>(null);
  const [contactsOpen, setContactsOpen] = useState(false);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!campaign) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Campaign not found.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/campaigns">Back to campaigns</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function runAction(
    label: string,
    action: ReturnType<typeof useCampaignAction>,
  ) {
    try {
      await action.mutateAsync();
      toast.success(label);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  const summary = campaign.summary;
  const canEdit = campaign.status === 'draft' || campaign.status === 'paused';

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button asChild variant="ghost" size="icon" className="mt-1">
          <Link href="/dashboard/campaigns">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={18} strokeWidth={1.6} />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {campaign.name}
            </h1>
            <Badge className="capitalize">{campaign.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {campaign.agent?.name ?? 'No agent'} ·{' '}
            {campaign.phoneNumber?.number ?? 'campaign caller id'}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {campaign.status === 'draft' && (
            <Button onClick={() => runAction('Campaign started', start)}>
              <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={1.6} />
              Start
            </Button>
          )}
          {campaign.status === 'running' && (
            <Button
              variant="outline"
              onClick={() => runAction('Campaign paused', pause)}
            >
              <HugeiconsIcon icon={PauseIcon} size={16} strokeWidth={1.6} />
              Pause
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button onClick={() => runAction('Campaign resumed', resume)}>
              <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={1.6} />
              Resume
            </Button>
          )}
          {campaign.status !== 'completed' &&
            campaign.status !== 'canceled' && (
              <Button
                variant="destructive"
                onClick={() => runAction('Campaign canceled', cancel)}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={16}
                  strokeWidth={1.6}
                />
                Cancel
              </Button>
            )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Recipients" value={summary?.total ?? 0} />
        <Metric label="Queued" value={summary?.queued ?? 0} />
        <Metric
          label="Active"
          value={(summary?.dialing ?? 0) + (summary?.inCall ?? 0)}
        />
        <Metric label="Answered" value={summary?.answered ?? 0} />
        <Metric label="Opt-outs" value={summary?.optOuts ?? 0} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recipients</CardTitle>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const result = await upload.mutateAsync(file);
                  toast.success(
                    `Imported ${result.added}; skipped ${result.skipped}`,
                  );
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : 'Import failed',
                  );
                } finally {
                  if (fileInput.current) fileInput.current.value = '';
                }
              }}
            />
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                >
                  <HugeiconsIcon
                    icon={FileUploadIcon}
                    size={16}
                    strokeWidth={1.6}
                  />
                  Upload CSV
                </Button>
                <Button variant="outline" onClick={() => setContactsOpen(true)}>
                  <HugeiconsIcon
                    icon={UserMultiple02Icon}
                    size={16}
                    strokeWidth={1.6}
                  />
                  Add contacts
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!recipients ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : recipients.length === 0 ? (
            <div className="text-muted-foreground py-12 text-center text-sm">
              Add opted-in contacts or upload a CSV with phoneNumber and
              consent.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">
                        {r.displayName || r.phoneNumber}
                      </div>
                      <div className="text-muted-foreground font-mono text-xs">
                        {r.phoneNumber}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.deliveryStatus ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.outcome ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">{r.attemptCount}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[220px] truncate text-xs">
                      {r.lastError ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {contactsOpen && (
        <AddContactsDialog
          campaignId={id}
          onClose={() => setContactsOpen(false)}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function AddContactsDialog({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const { data: contacts } = useContacts();
  const add = useAddCampaignContacts(campaignId);
  const [selected, setSelected] = useState<string[]>([]);
  const optedIn = (contacts ?? []).filter(
    (c) => c.callConsentStatus === 'opted_in' && !c.doNotCallAt,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await add.mutateAsync(selected);
      toast.success(`Added ${result.added}; skipped ${result.skipped}`);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to add contacts',
      );
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add opted-in contacts</DialogTitle>
          <DialogDescription>
            Only contacts marked opted-in and not do-not-call are shown.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border p-2">
            {optedIn.length === 0 ? (
              <div className="text-muted-foreground p-6 text-center text-sm">
                No opted-in contacts available.
              </div>
            ) : (
              optedIn.map((c) => {
                const checked = selected.includes(c.id);
                const name =
                  [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                  c.phoneNumber;
                return (
                  <label
                    key={c.id}
                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id),
                        )
                      }
                      className="accent-primary h-4 w-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{name}</span>
                      <span className="text-muted-foreground block font-mono text-xs">
                        {c.phoneNumber}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={selected.length === 0 || add.isPending}
            >
              Add {selected.length || ''} contacts
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
