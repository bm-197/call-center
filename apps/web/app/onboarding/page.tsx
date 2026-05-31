'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { organization } from '@/lib/auth-client';
import { AuthPageShell } from '@/components/auth-page-shell';
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

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const finalSlug = slug.trim() || slugify(name);
    const { data, error } = await organization.create({
      name,
      slug: finalSlug,
    });

    if (error || !data) {
      setLoading(false);
      toast.error(error?.message ?? 'Failed to create organization');
      return;
    }

    await organization.setActive({ organizationId: data.id });
    setLoading(false);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthPageShell>
      <Card className="rounded-[14px] border border-white/80 bg-card/95 py-0 shadow-[0_28px_70px_rgba(20,184,166,0.18),0_8px_24px_rgba(5,150,105,0.12)] ring-1 ring-foreground/10 backdrop-blur-xl">
        <CardHeader className="px-11 pt-12 pb-2 text-left">
          <CardTitle className="text-[26px] font-semibold tracking-[-0.04em] text-foreground">
            Create your organization
          </CardTitle>
          <CardDescription>
            Set up a workspace for your team, agents, and calls.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-5 px-11 pt-5">
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(slugify(e.target.value));
                }}
                disabled={loading}
                placeholder="Acme Telecom"
                className="h-12 rounded-[7px] border-input bg-white text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.02)] focus-visible:border-primary focus-visible:ring-primary/25"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL slug</Label>
              <Input
                id="slug"
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                disabled={loading}
                placeholder="acme-telecom"
                className="h-12 rounded-[7px] border-input bg-white text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.02)] focus-visible:border-primary focus-visible:ring-primary/25"
              />
              <p className="text-muted-foreground text-xs">
                Used internally to identify this workspace.
              </p>
            </div>
            <Button
              type="submit"
              className="mt-2 h-12 w-full rounded-[7px] text-[15px] font-semibold shadow-[0_8px_18px_rgba(20,184,166,0.18)]"
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create organization'}
            </Button>
          </CardContent>
          <CardFooter className="mt-12 justify-center rounded-b-[14px] bg-muted/50 px-11 py-7">
            <p className="text-muted-foreground text-center text-sm">
              You&apos;ll be added as the workspace owner.
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthPageShell>
  );
}
