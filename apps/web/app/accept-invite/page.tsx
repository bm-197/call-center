'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
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
import { AuthPageShell } from '@/components/auth-page-shell';
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

const inviteCardClass =
  'rounded-[14px] border border-white/80 bg-card/95 py-0 shadow-[0_28px_70px_rgba(20,184,166,0.18),0_8px_24px_rgba(5,150,105,0.12)] ring-1 ring-foreground/10 backdrop-blur-xl';
const inviteHeaderClass = 'px-11 pt-12 pb-2 text-left';
const inviteTitleClass =
  'text-[26px] font-semibold tracking-[-0.04em] text-foreground';
const invitePrimaryButtonClass =
  'h-12 w-full rounded-[7px] text-[15px] font-semibold shadow-[0_8px_18px_rgba(20,184,166,0.18)]';
const inviteSecondaryButtonClass =
  'h-12 w-full rounded-[7px] border-input bg-white text-[15px] font-semibold text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.02)] hover:bg-muted/60 hover:text-foreground';

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
  | { kind: 'needs-auth' }
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
  const acceptingInvitationIdRef = useRef<string | null>(null);

  // Fetch invitation status
  useEffect(() => {
    if (!invitationId) {
      setPhase({ kind: 'missing-id' });
      return;
    }

    let cancelled = false;
    (async () => {
      if (acceptingInvitationIdRef.current === invitationId) {
        return;
      }

      if (sessionPending) {
        setPhase({ kind: 'loading' });
        return;
      }

      if (!session) {
        setPhase({ kind: 'needs-auth' });
        return;
      }

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
    acceptingInvitationIdRef.current = phase.invitation.id;
    setPhase({ kind: 'accepting', invitation: phase.invitation });
    const { error } = await authClient.organization.acceptInvitation({
      invitationId: phase.invitation.id,
    });
    if (error) {
      acceptingInvitationIdRef.current = null;
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
    <AuthPageShell>
      <Body phase={phase} invitationId={invitationId} onAccept={accept} />
    </AuthPageShell>
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
      <Card className={inviteCardClass}>
        <CardHeader className={inviteHeaderClass}>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent className="space-y-3 px-11 pt-7 pb-11">
          <Skeleton className="h-12 w-full rounded-[7px]" />
          <Skeleton className="h-12 w-full rounded-[7px]" />
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
          <Button
            asChild
            variant="outline"
            className={inviteSecondaryButtonClass}
          >
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
          <Button
            asChild
            variant="outline"
            className={inviteSecondaryButtonClass}
          >
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
          <Button asChild className={invitePrimaryButtonClass}>
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
          <Button
            asChild
            variant="outline"
            className={inviteSecondaryButtonClass}
          >
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
          <Button
            asChild
            variant="outline"
            className={inviteSecondaryButtonClass}
          >
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (phase.kind === 'needs-auth') {
    const redirectTo = invitationId
      ? `/accept-invite?id=${encodeURIComponent(invitationId)}`
      : '/accept-invite';
    const encodedRedirect = encodeURIComponent(redirectTo);

    return (
      <Card className={inviteCardClass}>
        <CardHeader className={inviteHeaderClass}>
          <div className="mb-5">
            <Icon tone="info" align="left" />
          </div>
          <CardTitle className={inviteTitleClass}>
            You&apos;re invited
          </CardTitle>
          <CardDescription>
            Sign in or create an account to view and accept this invitation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-11 pt-7 pb-11">
          <Button asChild className={invitePrimaryButtonClass}>
            <Link href={`/sign-up?redirect=${encodedRedirect}`}>
              Create account
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className={inviteSecondaryButtonClass}
          >
            <Link href={`/sign-in?redirect=${encodedRedirect}`}>Sign in</Link>
          </Button>
        </CardContent>
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
          <Button
            asChild
            variant="outline"
            className={inviteSecondaryButtonClass}
          >
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
    <Card className={inviteCardClass}>
      <CardHeader className={inviteHeaderClass}>
        <div className="mb-5">
          <Icon tone={accepted ? 'success' : 'info'} align="left" />
        </div>
        <CardTitle className={inviteTitleClass}>
          Join {phase.invitation.organizationName ?? 'this organization'}
        </CardTitle>
        <CardDescription>
          You&apos;ve been invited as{' '}
          <strong className="text-foreground">{phase.invitation.role}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-11 pt-7 pb-11">
        <Button
          className={invitePrimaryButtonClass}
          onClick={onAccept}
          disabled={accepting || accepted}
        >
          {accepted ? 'Joined ✓' : accepting ? 'Joining…' : 'Accept invitation'}
        </Button>
      </CardContent>
      <CardFooter className="justify-center rounded-b-[14px] bg-muted/50 px-11 py-7">
        <p className="text-muted-foreground text-center text-sm">
          Invitation for{' '}
          <span className="font-semibold text-foreground">
            {phase.invitation.email}
          </span>
        </p>
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
    <Card className={inviteCardClass}>
      <CardHeader className={inviteHeaderClass}>
        <div className="mb-5">
          <Icon tone={tone} align="left" />
        </div>
        <CardTitle className={inviteTitleClass}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-11 pt-7 pb-11">{cta}</CardContent>
    </Card>
  );
}

function Icon({
  tone,
  align = 'center',
}: {
  tone: 'success' | 'warning' | 'info';
  align?: 'left' | 'center';
}) {
  const cfg = {
    success: { icon: CheckmarkCircle02Icon, className: 'text-emerald-600' },
    warning: { icon: AlertCircleIcon, className: 'text-amber-600' },
    info: { icon: MailAdd01Icon, className: 'text-primary' },
  }[tone];
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ${align === 'center' ? 'mx-auto' : ''}`}
    >
      <HugeiconsIcon
        icon={cfg.icon}
        size={22}
        strokeWidth={1.6}
        className={cfg.className}
      />
    </div>
  );
}
