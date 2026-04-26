import { redirect } from 'next/navigation';
import { getActiveOrganization, getServerSession } from '@/lib/server-auth';
import { PageHeader } from '../components/page-header';
import { SettingsTabs } from './settings-tabs';

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session) redirect('/sign-in');
  const org = await getActiveOrganization();
  if (!org) redirect('/onboarding');

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your organization and account"
      />
      <SettingsTabs initialOrg={org} initialUser={session.user} />
    </div>
  );
}
