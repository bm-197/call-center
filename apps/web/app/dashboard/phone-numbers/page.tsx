'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  CallIcon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import {
  usePhoneNumbers,
  useCreatePhoneNumber,
  useUpdatePhoneNumber,
  useDeletePhoneNumber,
  type PhoneNumber,
  type PhoneNumberInput,
} from './use-phone-numbers';
import { useAgents } from '../agents/use-agents';
import { PageHeader } from '../components/page-header';
import { ConfirmDialog } from '../components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PROVIDER_LABEL: Record<PhoneNumber['provider'], string> = {
  ethiotelecom: 'Ethio Telecom',
  twilio: 'Twilio',
};

export default function PhoneNumbersPage() {
  const { data: numbers, isLoading } = usePhoneNumbers();
  const [editing, setEditing] = useState<PhoneNumber | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<PhoneNumber | null>(null);
  const del = useDeletePhoneNumber();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Phone numbers"
        description="Numbers connected to your call center, and which agent answers each"
        action={
          <Button onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
            Add number
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
      ) : !numbers || numbers.length === 0 ? (
        <EmptyState onAdd={() => setEditing('new')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <div className="font-mono font-medium">{n.number}</div>
                      {n.friendlyName && (
                        <div className="text-muted-foreground text-xs">
                          {n.friendlyName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {PROVIDER_LABEL[n.provider]}
                    </TableCell>
                    <TableCell className="text-sm">
                      {n.agent ? (
                        n.agent.name
                      ) : (
                        <span className="text-muted-foreground italic">
                          Unassigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={n.status === 'active' ? 'default' : 'outline'}
                        className="capitalize"
                      >
                        {n.status}
                      </Badge>
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
                          <DropdownMenuItem onClick={() => setEditing(n)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setToDelete(n)}
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
        <PhoneNumberDialog
          key={editing === 'new' ? 'new' : editing.id}
          number={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        config={
          toDelete
            ? {
                title: 'Delete phone number?',
                description: (
                  <>
                    {toDelete.number} will be unlinked from this organization.
                    Inbound calls to it will no longer reach your AI agent.
                  </>
                ),
                confirmLabel: 'Delete number',
                destructive: true,
              }
            : null
        }
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await del.mutateAsync(toDelete.id);
            toast.success('Phone number deleted');
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
          <HugeiconsIcon icon={CallIcon} size={22} strokeWidth={1.6} />
        </div>
        <div>
          <h3 className="text-base font-medium">No phone numbers yet</h3>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Add a phone number from your Ethio Telecom SIP trunk so your AI
            agent can answer inbound calls.
          </p>
        </div>
        <Button onClick={onAdd}>
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
          Add your first number
        </Button>
      </CardContent>
    </Card>
  );
}

const UNASSIGNED = '__unassigned__';

function PhoneNumberDialog({
  number,
  onClose,
}: {
  number: PhoneNumber | 'new';
  onClose: () => void;
}) {
  const isNew = number === 'new';
  const isEdit = number !== 'new';
  const create = useCreatePhoneNumber();
  const update = useUpdatePhoneNumber(isEdit ? number.id : '');
  const { data: agents } = useAgents();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = useState<PhoneNumberInput>(
    isEdit
      ? {
          number: number.number,
          friendlyName: number.friendlyName ?? '',
          agentId: number.agentId,
          provider: number.provider,
          status: number.status,
        }
      : {
          number: '+251',
          friendlyName: '',
          agentId: null,
          provider: 'ethiotelecom',
          status: 'active',
        },
  );

  function update_<K extends keyof PhoneNumberInput>(
    key: K,
    value: PhoneNumberInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (isNew) {
        await create.mutateAsync(form);
        toast.success('Phone number added');
      } else {
        await update.mutateAsync(form);
        toast.success('Phone number updated');
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isNew ? 'Add phone number' : 'Edit phone number'}
          </DialogTitle>
          <DialogDescription>
            Connect a number from your provider and route calls to an AI agent.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="number">Phone number</Label>
            <Input
              id="number"
              required
              value={form.number}
              onChange={(e) => update_('number', e.target.value)}
              placeholder="+251911234567"
              className="font-mono"
              disabled={pending}
            />
            <p className="text-muted-foreground text-xs">
              Use full E.164 format including country code.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="friendlyName">Display name</Label>
            <Input
              id="friendlyName"
              value={form.friendlyName ?? ''}
              onChange={(e) => update_('friendlyName', e.target.value)}
              placeholder="Main support line"
              disabled={pending}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={form.provider ?? 'ethiotelecom'}
                onValueChange={(v) =>
                  update_('provider', v as PhoneNumberInput['provider'])
                }
                disabled={pending}
              >
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ethiotelecom">Ethio Telecom</SelectItem>
                  <SelectItem value="twilio">Twilio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status ?? 'active'}
                onValueChange={(v) =>
                  update_('status', v as PhoneNumberInput['status'])
                }
                disabled={pending}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent">Route to agent</Label>
            <Select
              value={form.agentId ?? UNASSIGNED}
              onValueChange={(v) =>
                update_('agentId', v === UNASSIGNED ? null : v)
              }
              disabled={pending}
            >
              <SelectTrigger id="agent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {agents?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Calls to this number will be answered by the selected agent.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isNew ? 'Add number' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
