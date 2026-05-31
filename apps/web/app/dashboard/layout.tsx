import { redirect } from 'next/navigation';
import {
  getServerSession,
  getActiveOrganization,
  listOrganizations,
} from '@/lib/server-auth';
import { SidebarNav } from './components/sidebar-nav';
import { ResolveActiveOrg } from './components/resolve-active-org';
import { DashboardEvents } from './components/dashboard-events';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect('/sign-in');

  // No active org on the session: figure out whether the user has any orgs
  // at all. If they don't, send them to onboarding. If they do, mount a
  // tiny client component that calls setActive() (which writes the cookie
  // properly) and reloads — server can't set the BA cookie itself.
  if (!session.session.activeOrganizationId) {
    const orgs = await listOrganizations();
    if (orgs.length === 0) redirect('/onboarding');
    return <ResolveActiveOrg organizationId={orgs[0].id} />;
  }

  const [org, orgs] = await Promise.all([
    getActiveOrganization(),
    listOrganizations(),
  ]);
  const organizationId = org?.id ?? session.session.activeOrganizationId;

  return (
    <div className="bg-background min-h-screen">
      {organizationId && <DashboardEvents organizationId={organizationId} />}
      <SidebarNav
        user={session.user}
        orgName={org?.name ?? 'Organization'}
        orgLogo={org?.logo ?? null}
        activeOrganizationId={organizationId}
        organizations={orgs}
      />
      <div className="md:pl-60">
        <main className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
