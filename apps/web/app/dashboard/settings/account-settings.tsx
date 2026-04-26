'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
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

type User = {
  id: string;
  name: string | null;
  email: string;
};

export function AccountSettings({ initial }: { initial: User }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const updateName = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.updateUser({ name });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Name updated');
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success('Other sessions signed out'),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>How your name appears to teammates.</CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateName.mutate();
          }}
        >
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="acct-name">Name</Label>
              <Input
                id="acct-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={updateName.isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acct-email">Email</Label>
              <Input
                id="acct-email"
                value={initial.email}
                disabled
                readOnly
                className="font-mono"
              />
              <p className="text-muted-foreground text-xs">
                Email changes aren&apos;t supported yet — contact support if you
                need to update yours.
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t pt-4">
            <Button
              type="submit"
              disabled={
                updateName.isPending || name === (initial.name ?? '') || !name
              }
            >
              {updateName.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
          <CardDescription>
            Choose a strong password — at least 8 characters. Other sessions are
            signed out automatically.
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            changePassword.mutate();
          }}
        >
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={changePassword.isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePassword.isPending}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="border-t pt-4">
            <Button
              type="submit"
              disabled={
                changePassword.isPending ||
                !currentPassword ||
                newPassword.length < 8
              }
            >
              {changePassword.isPending ? 'Updating…' : 'Change password'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
          <CardDescription>
            Sign out of every device except this one.
          </CardDescription>
        </CardHeader>
        <CardFooter className="border-t pt-4">
          <Button
            variant="outline"
            onClick={() => revokeAll.mutate()}
            disabled={revokeAll.isPending}
          >
            {revokeAll.isPending ? 'Signing out…' : 'Sign out other sessions'}
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
