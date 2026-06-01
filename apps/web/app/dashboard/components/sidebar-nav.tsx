'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  DashboardSquare01Icon,
  CallIcon,
  TelephoneIcon,
  BotIcon,
  UserMultiple02Icon,
  UserGroupIcon,
  BookOpen01Icon,
  Megaphone01Icon,
  Plug01Icon,
  Settings02Icon,
  Logout03Icon,
  ArrowDown01Icon,
} from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { organization, signOut } from '@/lib/auth-client';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
      {
        href: '/dashboard/campaigns',
        label: 'Campaigns',
        icon: Megaphone01Icon,
      },
      {
        href: '/dashboard/integrations',
        label: 'Integrations',
        icon: Plug01Icon,
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

type SidebarOrganization = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
};

export function SidebarNav({
  user,
  orgName,
  orgLogo,
  activeOrganizationId,
  organizations,
}: {
  user: { name: string | null; email: string };
  orgName: string;
  orgLogo: string | null;
  activeOrganizationId: string | null;
  organizations: SidebarOrganization[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [failedLogoSrc, setFailedLogoSrc] = useState<string | null>(null);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
  const activeOrg = organizations.find(
    (org) => org.id === activeOrganizationId,
  );
  const displayOrgName = activeOrg?.name ?? orgName;
  const displayOrgLogo = activeOrg?.logo ?? orgLogo;
  const logoSrc: string | null =
    displayOrgLogo && failedLogoSrc !== displayOrgLogo ? displayOrgLogo : null;
  const showLogo = Boolean(logoSrc);
  const initials = getInitials(displayOrgName);

  async function switchOrganization(organizationId: string) {
    if (organizationId === activeOrganizationId || switchingOrgId) return;

    setSwitchingOrgId(organizationId);
    const { error } = await organization.setActive({ organizationId });

    if (error) {
      setSwitchingOrgId(null);
      toast.error(error.message ?? 'Failed to switch workspace');
      return;
    }

    queryClient.clear();
    router.refresh();
    setSwitchingOrgId(null);
  }

  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r md:flex">
      <div className="px-4 py-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hover:bg-sidebar-accent/60 focus-visible:ring-sidebar-ring flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
            >
              <OrganizationMark
                name={displayOrgName}
                logoSrc={logoSrc}
                showLogo={showLogo}
                initials={initials}
                onLogoError={() => setFailedLogoSrc(logoSrc)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {displayOrgName}
                </div>
                <div className="text-sidebar-foreground/60 truncate text-xs">
                  Call Center
                </div>
              </div>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={15}
                strokeWidth={1.8}
                className="text-sidebar-foreground/55"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {organizations.map((org) => {
              const active = org.id === activeOrganizationId;
              const switching = switchingOrgId === org.id;

              return (
                <DropdownMenuItem
                  key={org.id}
                  disabled={Boolean(switchingOrgId)}
                  onSelect={(event) => {
                    if (active) {
                      event.preventDefault();
                      return;
                    }
                    void switchOrganization(org.id);
                  }}
                  className={cn(
                    'gap-2.5',
                    active && 'bg-accent text-accent-foreground',
                  )}
                >
                  <OrganizationMark
                    name={org.name}
                    logoSrc={org.logo}
                    showLogo={Boolean(org.logo)}
                    initials={getInitials(org.name)}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{org.name}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {active ? 'Current workspace' : org.slug}
                    </div>
                  </div>
                  {switching && (
                    <span className="text-muted-foreground text-xs">
                      Switching…
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding" className="gap-2.5">
                <span className="bg-primary/10 text-primary flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none">
                  +
                </span>
                <div className="min-w-0 flex-1">
                  <div>Create organization</div>
                  <div className="text-muted-foreground truncate text-xs">
                    Add another workspace
                  </div>
                </div>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

function OrganizationMark({
  name,
  logoSrc,
  showLogo,
  initials,
  onLogoError,
  size = 'md',
}: {
  name: string;
  logoSrc: string | null;
  showLogo: boolean;
  initials: string;
  onLogoError?: () => void;
  size?: 'sm' | 'md';
}) {
  const dimension = size === 'sm' ? 28 : 32;
  const className = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';

  return (
    <div
      className={cn(
        'text-sidebar-primary-foreground relative flex shrink-0 items-center justify-center overflow-hidden rounded-md text-sm font-semibold',
        className,
      )}
    >
      {showLogo && logoSrc ? (
        <Image
          src={logoSrc}
          alt={`${name} logo`}
          width={dimension}
          height={dimension}
          unoptimized
          className={cn('object-contain p-1', className)}
          onError={onLogoError}
        />
      ) : (
        <span className="text-sidebar-accent-foreground">{initials}</span>
      )}
    </div>
  );
}

function getInitials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || 'CC';
}
