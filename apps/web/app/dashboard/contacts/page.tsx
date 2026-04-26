'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  UserMultiple02Icon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  type Contact,
  type ContactInput,
} from './use-contacts';
import { PageHeader } from '../components/page-header';
import { ConfirmDialog } from '../components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

export default function ContactsPage() {
  const { data: contacts, isLoading } = useContacts();
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Contact | null>(null);
  const del = useDeleteContact();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Contacts"
        description="People who call your AI agents"
        action={
          <Button onClick={() => setEditing('new')}>
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
            Add contact
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
      ) : !contacts || contacts.length === 0 ? (
        <EmptyState onAdd={() => setEditing('new')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => {
                  const fullName = [c.firstName, c.lastName]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">
                          {fullName || (
                            <span className="text-muted-foreground italic">
                              No name
                            </span>
                          )}
                        </div>
                        {c.notes && (
                          <div className="text-muted-foreground line-clamp-1 text-xs">
                            {c.notes}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {c.countryCode} {c.phoneNumber}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {c.email ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(c.createdAt).toLocaleDateString()}
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
                            <DropdownMenuItem onClick={() => setEditing(c)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setToDelete(c)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {editing !== null && (
        <ContactDialog
          key={editing === 'new' ? 'new' : editing.id}
          contact={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        config={
          toDelete
            ? {
                title: 'Delete contact?',
                description: (
                  <>
                    {[toDelete.firstName, toDelete.lastName]
                      .filter(Boolean)
                      .join(' ') ||
                      `${toDelete.countryCode} ${toDelete.phoneNumber}`}{' '}
                    will be removed. Past calls from this number stay in your
                    call history.
                  </>
                ),
                confirmLabel: 'Delete contact',
                destructive: true,
              }
            : null
        }
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await del.mutateAsync(toDelete.id);
            toast.success('Contact deleted');
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
          <HugeiconsIcon
            icon={UserMultiple02Icon}
            size={22}
            strokeWidth={1.6}
          />
        </div>
        <div>
          <h3 className="text-base font-medium">No contacts yet</h3>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Contacts are created automatically when calls come in. You can also
            add them manually.
          </p>
        </div>
        <Button onClick={onAdd}>
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.6} />
          Add your first contact
        </Button>
      </CardContent>
    </Card>
  );
}

function ContactDialog({
  contact,
  onClose,
}: {
  contact: Contact | 'new' | null;
  onClose: () => void;
}) {
  const isNew = contact === 'new';
  const isEdit = contact && contact !== 'new';
  const open = contact !== null;

  const create = useCreateContact();
  const update = useUpdateContact(isEdit ? contact.id : '');
  const pending = create.isPending || update.isPending;

  const initial: ContactInput = isEdit
    ? {
        firstName: contact.firstName ?? '',
        lastName: contact.lastName ?? '',
        email: contact.email ?? '',
        phoneNumber: contact.phoneNumber,
        countryCode: contact.countryCode,
        notes: contact.notes ?? '',
      }
    : {
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        countryCode: '+251',
        notes: '',
      };

  const [form, setForm] = useState<ContactInput>(initial);

  function update_<K extends keyof ContactInput>(
    key: K,
    value: ContactInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (isNew) {
        await create.mutateAsync(form);
        toast.success('Contact added');
      } else if (isEdit) {
        await update.mutateAsync(form);
        toast.success('Contact updated');
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setForm(initial);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add contact' : 'Edit contact'}</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'Manually add someone to your contacts list'
              : "Update this contact's details"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={form.firstName ?? ''}
                onChange={(e) => update_('firstName', e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={form.lastName ?? ''}
                onChange={(e) => update_('lastName', e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[100px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="countryCode">Country</Label>
              <Input
                id="countryCode"
                value={form.countryCode ?? '+251'}
                onChange={(e) => update_('countryCode', e.target.value)}
                disabled={pending}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone number</Label>
              <Input
                id="phoneNumber"
                required
                value={form.phoneNumber}
                onChange={(e) => update_('phoneNumber', e.target.value)}
                disabled={pending}
                placeholder="911234567"
                className="font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email ?? ''}
              onChange={(e) => update_('email', e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => update_('notes', e.target.value)}
              disabled={pending}
            />
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
              {pending ? 'Saving…' : isNew ? 'Add contact' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
