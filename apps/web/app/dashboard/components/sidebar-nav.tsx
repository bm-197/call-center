'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  DashboardSquare01Icon,
  CallIcon,
  TelephoneIcon,
  BotIcon,
  UserMultiple02Icon,
  UserGroupIcon,
  BookOpen01Icon,
  Settings02Icon,
  Logout03Icon,
} from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { signOut } from '@/lib/auth-client';
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

const sections: {
  label: string;
  items: { href: string; label: string; icon: typeof DashboardSquare01Icon }[];
}[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: DashboardSquare01Icon },
      { href: '/dashboard/calls', label: 'Calls', icon: CallIcon },
    ],
  },
  {
    label: 'Build',
    items: [
      { href: '/dashboard/agents', label: 'Agents', icon: BotIcon },
      {
        href: '/dashboard/phone-numbers',
        label: 'Phone numbers',
        icon: TelephoneIcon,
      },
      {
        href: '/dashboard/knowledge',
        label: 'Knowledge',
        icon: BookOpen01Icon,
      },
      {
        href: '/dashboard/contacts',
        label: 'Contacts',
        icon: UserMultiple02Icon,
      },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard/team', label: 'Team', icon: UserGroupIcon },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings02Icon },
    ],
  },
];

export function SidebarNav({
  user,
  orgName,
}: {
  user: { name: string | null; email: string };
  orgName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r md:flex">
      <div className="px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold">
            {orgName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{orgName}</div>
            <div className="text-sidebar-foreground/60 truncate text-xs">
              Call Center
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="text-sidebar-foreground/50 mb-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' &&
                    pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                    )}
                  >
                    <HugeiconsIcon
                      icon={item.icon}
                      size={16}
                      strokeWidth={1.6}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-sidebar-border border-t p-3">
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <div className="bg-sidebar-accent flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium">
            {(user.name ?? user.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {user.name ?? user.email.split('@')[0]}
            </div>
            <div className="text-sidebar-foreground/60 truncate text-xs">
              {user.email}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSignOutOpen(true)}
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground rounded p-1.5 transition-colors"
            title="Sign out"
          >
            <HugeiconsIcon icon={Logout03Icon} size={16} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Call Center?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to sign in again to access your dashboard, calls,
              and agents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>
              Stay signed in
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={signingOut}
              className={cn(buttonVariants({ variant: 'destructive' }))}
              onClick={async (e) => {
                e.preventDefault();
                setSigningOut(true);
                await signOut();
                router.push('/sign-in');
                router.refresh();
              }}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
