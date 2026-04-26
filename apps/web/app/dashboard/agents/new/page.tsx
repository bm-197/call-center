import { PageHeader } from '../../components/page-header';
import { AgentForm } from '../agent-form';

export default function NewAgentPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="New agent"
        description="Configure a new AI agent for your call center"
      />
      <AgentForm mode={{ kind: 'create' }} />
    </div>
  );
}
