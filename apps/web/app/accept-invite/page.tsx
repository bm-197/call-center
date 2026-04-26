'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  MailAdd01Icon,
} from '@hugeicons/core-free-icons';
import { authClient, useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled' | 'expired';
  expiresAt: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  inviterEmail?: string;
};

type Phase =
  | { kind: 'loading' }
  | { kind: 'missing-id' }
  | { kind: 'load-error'; message: string }
  | { kind: 'needs-auth'; invitation: Invitation }
  | { kind: 'wrong-account'; invitation: Invitation; signedInAs: string }
  | { kind: 'ready'; invitation: Invitation }
  | { kind: 'already-accepted'; invitation: Invitation }
  | { kind: 'expired'; invitation: Invitation }
  | { kind: 'cancelled'; invitation: Invitation }
  | { kind: 'accepting'; invitation: Invitation }
  | { kind: 'accepted'; invitation: Invitation };

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  );
}

function AcceptInviteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, isPending: sessionPending } = useSession();
  const invitationId = params.get('id');

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  // Fetch invitation status
  useEffect(() => {
    if (!invitationId) {
      setPhase({ kind: 'missing-id' });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await authClient.organization.getInvitation({
          query: { id: invitationId },
        });
        if (cancelled) return;
        if (error || !data) {
          setPhase({
            kind: 'load-error',
            message: error?.message ?? 'Invitation not found',
          });
          return;
        }
        const invitation = data as unknown as Invitation;
        if (invitation.status === 'accepted') {
          setPhase({ kind: 'already-accepted', invitation });
          return;
        }
        if (invitation.status === 'canceled') {
          setPhase({ kind: 'cancelled', invitation });
          return;
        }
        if (
          invitation.status === 'expired' ||
          new Date(invitation.expiresAt) < new Date()
        ) {
          setPhase({ kind: 'expired', invitation });
          return;
        }
        // pending — decide based on auth state
        if (sessionPending) {
          setPhase({ kind: 'loading' });
          return;
        }
        if (!session) {
          setPhase({ kind: 'needs-auth', invitation });
          return;
        }
        if (
          session.user.email.toLowerCase() !== invitation.email.toLowerCase()
        ) {
          setPhase({
            kind: 'wrong-account',
            invitation,
            signedInAs: session.user.email,
          });
          return;
        }
        setPhase({ kind: 'ready', invitation });
      } catch (e) {
        if (!cancelled) {
          setPhase({
            kind: 'load-error',
            message:
              e instanceof Error ? e.message : 'Failed to load invitation',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invitationId, session, sessionPending]);

  async function accept() {
    if (phase.kind !== 'ready') return;
    setPhase({ kind: 'accepting', invitation: phase.invitation });
    const { error } = await authClient.organization.acceptInvitation({
      invitationId: phase.invitation.id,
    });
    if (error) {
      toast.error(error.message ?? 'Failed to accept');
      setPhase({ kind: 'ready', invitation: phase.invitation });
      return;
    }
    setPhase({ kind: 'accepted', invitation: phase.invitation });
    toast.success("You've joined the organization");
    setTimeout(() => {
      router.push('/dashboard');
      router.refresh();
    }, 800);
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Body phase={phase} invitationId={invitationId} onAccept={accept} />
      </div>
    </div>
  );
}

function Body({
  phase,
  invitationId,
  onAccept,
}: {
  phase: Phase;
  invitationId: string | null;
  onAccept: () => void;
}) {
  if (phase.kind === 'loading') {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (phase.kind === 'missing-id') {
    return (
      <StatusCard
        tone="warning"
        title="Invalid invitation link"
        description="This link is missing an invitation id. Ask the inviter to send a fresh invitation."
        cta={
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (phase.kind === 'load-error') {
    return (
      <StatusCard
        tone="warning"
        title="Couldn't load invitation"
        description={phase.message}
        cta={
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (phase.kind === 'already-accepted') {
    return (
      <StatusCard
        tone="success"
        title="Invitation already accepted"
        description={`You're already a member of ${phase.invitation.organizationName ?? 'this organization'}. Open your dashboard to continue.`}
        cta={
          <Button asChild className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (phase.kind === 'expired') {
    return (
      <StatusCard
        tone="warning"
        title="Invitation expired"
        description="This invitation is no longer valid. Ask the inviter to send a fresh one."
        cta={
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (phase.kind === 'cancelled') {
    return (
      <StatusCard
        tone="warning"
        title="Invitation cancelled"
        description="The inviter cancelled this invitation. Ask them to send a new one if you should still join."
        cta={
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (phase.kind === 'needs-auth') {
    return (
      <Card>
        <CardHeader className="space-y-2 text-center">
          <Icon tone="info" />
          <CardTitle className="text-2xl">You&apos;re invited</CardTitle>
          <CardDescription>
            Join{' '}
            <strong>
              {phase.invitation.organizationName ?? 'the organization'}
            </strong>{' '}
            as {phase.invitation.role}. Sign in or create an account with{' '}
            <strong>{phase.invitation.email}</strong> to accept.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href={`/sign-up?redirect=/accept-invite?id=${invitationId}`}>
              Create account
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/sign-in?redirect=/accept-invite?id=${invitationId}`}>
              Sign in
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (phase.kind === 'wrong-account') {
    return (
      <StatusCard
        tone="warning"
        title="Wrong account"
        description={`This invitation was sent to ${phase.invitation.email}, but you're signed in as ${phase.signedInAs}. Sign out and try again with the correct account.`}
        cta={
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    );
  }

  // ready / accepting / accepted
  const accepting = phase.kind === 'accepting';
  const accepted = phase.kind === 'accepted';
  return (
    <Card>
      <CardHeader className="space-y-2 text-center">
        <Icon tone="info" />
        <CardTitle className="text-2xl">
          Join {phase.invitation.organizationName ?? 'this organization'}
        </CardTitle>
        <CardDescription>
          You&apos;ve been invited as <strong>{phase.invitation.role}</strong>.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button
          className="w-full"
          onClick={onAccept}
          disabled={accepting || accepted}
        >
          {accepted ? 'Joined ✓' : accepting ? 'Joining…' : 'Accept invitation'}
        </Button>
      </CardFooter>
    </Card>
  );
}

function StatusCard({
  tone,
  title,
  description,
  cta,
}: {
  tone: 'success' | 'warning';
  title: string;
  description: string;
  cta: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="space-y-2 text-center">
        <Icon tone={tone} />
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter>{cta}</CardFooter>
    </Card>
  );
}

function Icon({ tone }: { tone: 'success' | 'warning' | 'info' }) {
  const cfg = {
    success: { icon: CheckmarkCircle02Icon, className: 'text-emerald-600' },
    warning: { icon: AlertCircleIcon, className: 'text-amber-600' },
    info: { icon: MailAdd01Icon, className: 'text-foreground' },
  }[tone];
  return (
    <div className="bg-muted mx-auto flex h-12 w-12 items-center justify-center rounded-full">
      <HugeiconsIcon
        icon={cfg.icon}
        size={22}
        strokeWidth={1.6}
        className={cfg.className}
      />
    </div>
  );
}
