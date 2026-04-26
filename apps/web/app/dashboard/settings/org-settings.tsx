'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConfirmDialog } from '../components/confirm-dialog';

type Org = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function OrgSettings({ initial }: { initial: Org }) {
  const router = useRouter();
  const qc = useQueryClient();

  // Get full org for member count + my role
  const fullQuery = useQuery({
    queryKey: ['organization', 'full'],
    queryFn: async () => {
      const { data, error } =
        await authClient.organization.getFullOrganization();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const sessionQ = authClient.useSession();
  const myMember = fullQuery.data?.members?.find(
    (m) => m.userId === sessionQ.data?.user.id,
  );
  const isOwner = myMember?.role === 'owner';

  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [logo, setLogo] = useState(initial.logo ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const dirty =
    name !== initial.name ||
    slug !== initial.slug ||
    (logo || null) !== initial.logo;

  const update = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.update({
        organizationId: initial.id,
        data: {
          name,
          slug,
          logo: logo || undefined,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Organization updated');
      qc.invalidateQueries({ queryKey: ['organization'] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.delete({
        organizationId: initial.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Organization deleted');
      router.push('/onboarding');
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.leave({
        organizationId: initial.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("You've left the organization");
      router.push('/onboarding');
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            How your organization appears to your team and on call records.
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate();
          }}
        >
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (slug === slugify(initial.name)) {
                    setSlug(slugify(e.target.value));
                  }
                }}
                disabled={!isOwner || update.isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">URL slug</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                disabled={!isOwner || update.isPending}
                required
                className="font-mono"
              />
              <p className="text-muted-foreground text-xs">
                Used in URLs and API responses. Lowercase letters, numbers and
                dashes only.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-logo">Logo URL</Label>
              <Input
                id="org-logo"
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                disabled={!isOwner || update.isPending}
                placeholder="https://…"
              />
            </div>
          </CardContent>
          <CardFooter className="border-t pt-4">
            <Button
              type="submit"
              disabled={!isOwner || !dirty || update.isPending}
            >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {!isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave organization</CardTitle>
            <CardDescription>
              You&apos;ll lose access to all calls, agents, and data. You can be
              re-invited later.
            </CardDescription>
          </CardHeader>
          <CardFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setConfirmLeave(true)}>
              Leave organization
            </Button>
          </CardFooter>
        </Card>
      )}

      {isOwner && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete this organization and all its data. This cannot
              be undone.
            </CardDescription>
          </CardHeader>
          <CardFooter className="border-destructive/40 border-t pt-4">
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Delete organization
            </Button>
          </CardFooter>
        </Card>
      )}

      <ConfirmDialog
        config={
          confirmDelete
            ? {
                title: `Delete "${initial.name}"?`,
                description: (
                  <>
                    This will permanently remove the organization, all members,
                    agents, calls, contacts, and knowledge sources. This action
                    is irreversible.
                  </>
                ),
                confirmLabel: 'Delete forever',
                destructive: true,
              }
            : null
        }
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await del.mutateAsync();
          setConfirmDelete(false);
        }}
      />

      <ConfirmDialog
        config={
          confirmLeave
            ? {
                title: `Leave "${initial.name}"?`,
                description: (
                  <>
                    You&apos;ll be signed out of this workspace and can&apos;t
                    rejoin without an invitation.
                  </>
                ),
                confirmLabel: 'Leave organization',
                destructive: true,
              }
            : null
        }
        onClose={() => setConfirmLeave(false)}
        onConfirm={async () => {
          await leave.mutateAsync();
          setConfirmLeave(false);
        }}
      />
    </>
  );
}
