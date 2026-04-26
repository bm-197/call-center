import { PageHeader } from '../components/page-header';
import { TeamClient } from './team-client';

export default function TeamPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Team"
        description="Manage members and pending invitations for your organization"
      />
      <TeamClient />
    </div>
  );
}
