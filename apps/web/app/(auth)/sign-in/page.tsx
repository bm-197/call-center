'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { signIn } from '@/lib/auth-client';
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

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get('redirect');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn.email({ email, password });
    setLoading(false);

    if (error) {
      toast.error(error.message ?? 'Failed to sign in');
      return;
    }
    router.push(redirectTo ?? '/dashboard');
    router.refresh();
  }

  return (
    <Card className="rounded-[14px] border border-white/80 bg-card/95 py-0 shadow-[0_28px_70px_rgba(20,184,166,0.18),0_8px_24px_rgba(5,150,105,0.12)] ring-1 ring-foreground/10 backdrop-blur-xl">
      <CardHeader className="px-11 pt-12 pb-2 text-left">
        <CardTitle className="text-[26px] font-semibold tracking-[-0.04em] text-foreground">
          Sign in to your account
        </CardTitle>
        <CardDescription>
          Continue to your call center dashboard.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-5 px-11 pt-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="h-12 rounded-[7px] border-input bg-white text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.02)] focus-visible:border-primary focus-visible:ring-primary/25"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="h-12 rounded-[7px] border-input bg-white text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.02)] focus-visible:border-primary focus-visible:ring-primary/25"
            />
          </div>
          <Button
            type="submit"
            className="mt-2 h-12 w-full rounded-[7px] text-[15px] font-semibold shadow-[0_8px_18px_rgba(20,184,166,0.18)]"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </CardContent>
        <CardFooter className="mt-12 justify-center rounded-b-[14px] bg-muted/50 px-11 py-7">
          <p className="text-muted-foreground text-center text-sm">
            New here?{' '}
            <Link
              href="/sign-up"
              className="font-semibold text-primary hover:text-primary/80"
            >
              Create account
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
