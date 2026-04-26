'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { MailAdd01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { authClient, useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Role = 'owner' | 'admin' | 'member';

const ROLE_VARIANT: Record<Role, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
};

type PendingAction =
  | { kind: 'promote'; member: MemberRow }
  | { kind: 'demote'; member: MemberRow }
  | { kind: 'remove'; member: MemberRow }
  | { kind: 'cancel-invite'; invitationId: string; email: string };

type MemberRow = {
  id: string;
  userId: string;
  role: string;
  user: { name: string | null; email: string };
};

export function TeamClient() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const orgQuery = useQuery({
    queryKey: ['organization', 'full'],
    queryFn: async () => {
      const { data, error } =
        await authClient.organization.getFullOrganization();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const invitationsQuery = useQuery({
    queryKey: ['organization', 'invitations'],
    queryFn: async () => {
      const { data, error } = await authClient.organization.listInvitations();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Member removed');
      qc.invalidateQueries({ queryKey: ['organization'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: Role;
    }) => {
      const { error } = await authClient.organization.updateMemberRole({
        memberId,
        role,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Role updated');
      qc.invalidateQueries({ queryKey: ['organization'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Invitation cancelled');
      qc.invalidateQueries({ queryKey: ['organization', 'invitations'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const members = orgQuery.data?.members ?? [];
  const invitations = (invitationsQuery.data ?? []).filter(
    (i) => i.status === 'pending',
  );
  const currentUserId = session?.user.id;
  const currentMember = members.find((m) => m.userId === currentUserId);
  const canManage =
    currentMember?.role === 'owner' || currentMember?.role === 'admin';

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Members</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <HugeiconsIcon icon={MailAdd01Icon} size={16} strokeWidth={1.6} />
              Invite member
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {orgQuery.isLoading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const role = m.role as Role;
                  const isSelf = m.userId === currentUserId;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="bg-muted flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium">
                            {(m.user.name ?? m.user.email)
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">
                              {m.user.name ?? m.user.email.split('@')[0]}
                              {isSelf && (
                                <span className="text-muted-foreground ml-2 text-xs font-normal">
                                  (you)
                                </span>
                              )}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {m.user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ROLE_VARIANT[role]}
                          className="capitalize"
                        >
                          {role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {canManage && !isSelf && role !== 'owner' && (
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
                              <DropdownMenuItem
                                onClick={() =>
                                  setPending({ kind: 'promote', member: m })
                                }
                                disabled={role === 'admin'}
                              >
                                Make admin
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setPending({ kind: 'demote', member: m })
                                }
                                disabled={role === 'member'}
                              >
                                Make member
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() =>
                                  setPending({ kind: 'remove', member: m })
                                }
                              >
                                Remove from org
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Awaiting acceptance
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {inv.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPending({
                              kind: 'cancel-invite',
                              invitationId: inv.id,
                              email: inv.email,
                            })
                          }
                        >
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <ConfirmDialog
        pending={pending}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          try {
            if (pending.kind === 'promote') {
              await updateRole.mutateAsync({
                memberId: pending.member.id,
                role: 'admin',
              });
            } else if (pending.kind === 'demote') {
              await updateRole.mutateAsync({
                memberId: pending.member.id,
                role: 'member',
              });
            } else if (pending.kind === 'remove') {
              await removeMember.mutateAsync(pending.member.id);
            } else if (pending.kind === 'cancel-invite') {
              await cancelInvitation.mutateAsync(pending.invitationId);
            }
            setPending(null);
          } catch {
            // mutations already toast on error
          }
        }}
      />
    </div>
  );
}

function ConfirmDialog({
  pending,
  onClose,
  onConfirm,
}: {
  pending: PendingAction | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const config = pending ? describe(pending) : null;

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{config?.title}</AlertDialogTitle>
          <AlertDialogDescription>{config?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={cn(
              config?.destructive && buttonVariants({ variant: 'destructive' }),
            )}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {busy ? 'Working…' : config?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function describe(p: PendingAction) {
  if (p.kind === 'promote') {
    const name = p.member.user.name ?? p.member.user.email;
    return {
      title: `Promote ${name} to admin?`,
      description:
        'Admins can manage members, invitations, and organization settings.',
      confirmLabel: 'Make admin',
      destructive: false,
    };
  }
  if (p.kind === 'demote') {
    const name = p.member.user.name ?? p.member.user.email;
    return {
      title: `Change ${name} to member?`,
      description:
        "They'll lose admin privileges and won't be able to manage members or settings.",
      confirmLabel: 'Make member',
      destructive: false,
    };
  }
  if (p.kind === 'remove') {
    const name = p.member.user.name ?? p.member.user.email;
    return {
      title: `Remove ${name} from the organization?`,
      description:
        "They'll immediately lose access to all calls, agents, and data. You can re-invite them later.",
      confirmLabel: 'Remove from org',
      destructive: true,
    };
  }
  return {
    title: 'Cancel invitation?',
    description: `The invitation sent to ${p.email} will no longer be valid. You can send a new one anytime.`,
    confirmLabel: 'Cancel invitation',
    destructive: true,
  };
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');

  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.inviteMember({
        email,
        role,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(`Invitation sent to ${email}`);
      qc.invalidateQueries({ queryKey: ['organization', 'invitations'] });
      setEmail('');
      setRole('member');
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They&apos;ll receive an email with a link to join your organization.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@yourcompany.com"
              disabled={invite.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
              disabled={invite.isPending}
            >
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">
                  Admin — manage members & settings
                </SelectItem>
                <SelectItem value="member">
                  Member — work with calls & agents
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={invite.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? 'Sending…' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
