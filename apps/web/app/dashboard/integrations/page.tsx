'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Plug01Icon,
  RefreshIcon,
  WorkflowCircle01Icon,
} from '@hugeicons/core-free-icons';
import { PageHeader } from '../components/page-header';
import { useAgents } from '../agents/use-agents';
import {
  useIntegrations,
  useSaveIntegration,
  useTestTool,
  useToolInvocations,
  useUpdateIntegration,
  type IntegrationConnection,
  type IntegrationProvider,
} from './use-integrations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const providers: { value: IntegrationProvider; label: string }[] = [
  { value: 'custom_api', label: 'Custom CMS API' },
  { value: 'notion', label: 'Notion' },
  { value: 'google_calendar', label: 'Google Calendar' },
  { value: 'mcp', label: 'MCP' },
];

const tools = [
  { value: 'waitlist_add_contact', label: 'Add to waitlist' },
  { value: 'contact_update_notes', label: 'Update notes' },
  { value: 'calendar_create_event', label: 'Create appointment' },
];

const TOOL_ACTIVITY_PAGE_SIZE = 25;

export default function IntegrationsPage() {
  const integrations = useIntegrations();
  const [activityPage, setActivityPage] = useState(1);
  const invocations = useToolInvocations({
    page: activityPage,
    pageSize: TOOL_ACTIVITY_PAGE_SIZE,
  });
  const agents = useAgents();
  const save = useSaveIntegration();
  const testTool = useTestTool();

  const [provider, setProvider] = useState<IntegrationProvider>('custom_api');
  const [name, setName] = useState('default');
  const [configJson, setConfigJson] = useState(
    formatJson(providerConfig(provider)),
  );
  const [credentialsJson, setCredentialsJson] = useState(
    formatJson(providerCredentials(provider)),
  );

  const activeAgentId = useMemo(
    () => agents.data?.find((agent) => agent.status === 'active')?.id,
    [agents.data],
  );
  const [agentId, setAgentId] = useState('');
  const selectedAgentId =
    agentId || activeAgentId || agents.data?.[0]?.id || '';
  const [toolName, setToolName] = useState('waitlist_add_contact');
  const [argsJson, setArgsJson] = useState(formatJson(toolArgs(toolName)));
  const [testResult, setTestResult] = useState<unknown>(null);
  const invocationItems = invocations.data?.items ?? [];
  const invocationPagination = invocations.data?.pagination;
  const invocationTotal = invocationPagination?.total ?? 0;
  const invocationPageCount = invocationPagination?.pageCount ?? 1;
  const [selectedIntegration, setSelectedIntegration] =
    useState<IntegrationConnection | null>(null);

  function onProviderChange(value: IntegrationProvider) {
    setProvider(value);
    setConfigJson(formatJson(providerConfig(value)));
    setCredentialsJson(formatJson(providerCredentials(value)));
  }

  function onToolChange(value: string) {
    setToolName(value);
    setArgsJson(formatJson(toolArgs(value)));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({
        provider,
        name,
        status: 'active',
        config: parseJsonObject(configJson, 'Config'),
        credentials: parseJsonObject(credentialsJson, 'Credentials'),
      });
      toast.success('Integration saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  async function onRunTest(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAgentId) {
      toast.error('Create an agent before testing tools');
      return;
    }
    try {
      const result = await testTool.mutateAsync({
        agentId: selectedAgentId,
        toolName,
        args: parseJsonObject(argsJson, 'Arguments'),
      });
      setTestResult(result);
      toast.success('Tool executed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Tool failed');
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Integrations"
        description="External systems the voice agent can update"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>External Connection</CardTitle>
            <CardDescription>
              Credentials are stored server-side and masked after saving.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSave} className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select
                    value={provider}
                    onValueChange={(value) =>
                      onProviderChange(value as IntegrationProvider)
                    }
                  >
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={save.isPending}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="config">Config JSON</Label>
                <Textarea
                  id="config"
                  value={configJson}
                  onChange={(event) => setConfigJson(event.target.value)}
                  disabled={save.isPending}
                  className="min-h-44 font-mono text-xs"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="credentials">Credentials JSON</Label>
                <Textarea
                  id="credentials"
                  value={credentialsJson}
                  onChange={(event) => setCredentialsJson(event.target.value)}
                  disabled={save.isPending}
                  className="min-h-32 font-mono text-xs"
                />
              </div>

              <div>
                <Button type="submit" disabled={save.isPending}>
                  <HugeiconsIcon
                    icon={Plug01Icon}
                    size={16}
                    strokeWidth={1.6}
                  />
                  {save.isPending ? 'Saving...' : 'Save integration'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tool Test</CardTitle>
            <CardDescription>
              Runs the same execution path used during calls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onRunTest} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="agent">Agent</Label>
                <Select
                  value={selectedAgentId}
                  onValueChange={setAgentId}
                  disabled={!agents.data?.length}
                >
                  <SelectTrigger id="agent">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {(agents.data ?? []).map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tool">Tool</Label>
                <Select value={toolName} onValueChange={onToolChange}>
                  <SelectTrigger id="tool">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tools.map((tool) => (
                      <SelectItem key={tool.value} value={tool.value}>
                        {tool.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="args">Arguments JSON</Label>
                <Textarea
                  id="args"
                  value={argsJson}
                  onChange={(event) => setArgsJson(event.target.value)}
                  disabled={testTool.isPending}
                  className="min-h-40 font-mono text-xs"
                />
              </div>

              <Button
                type="submit"
                disabled={testTool.isPending || !selectedAgentId}
              >
                <HugeiconsIcon
                  icon={WorkflowCircle01Icon}
                  size={16}
                  strokeWidth={1.6}
                />
                {testTool.isPending ? 'Running...' : 'Run tool'}
              </Button>

              {testResult !== null && (
                <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs">
                  {formatJson(testResult)}
                </pre>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>
            Active external targets for tool calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {integrations.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !integrations.data?.length ? (
            <div className="text-muted-foreground py-8 text-sm">
              No integrations configured.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.data.map((integration) => (
                  <TableRow key={integration.id}>
                    <TableCell className="font-medium">
                      {integration.name}
                    </TableCell>
                    <TableCell>{providerLabel(integration.provider)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(integration.status)}>
                        {integration.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(integration.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedIntegration(integration)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConnectionDetailsDialog
        integration={selectedIntegration}
        onClose={() => setSelectedIntegration(null)}
        onUpdated={setSelectedIntegration}
      />

      <Card>
        <CardHeader>
          <CardTitle>Tool Activity</CardTitle>
          <CardDescription>
            Recent tool executions for this workspace.
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{invocationTotal}</Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => invocations.refetch()}
                disabled={invocations.isFetching}
              >
                <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.6} />
                {invocations.isFetching ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {invocations.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !invocationItems.length ? (
            <div className="text-muted-foreground py-8 text-sm">
              No tool calls yet.
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invocationItems.map((invocation) => (
                    <TableRow key={invocation.id}>
                      <TableCell className="font-mono text-xs">
                        {invocation.toolName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(invocation.status)}>
                          {invocation.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{invocation.source}</TableCell>
                      <TableCell>
                        {resultProvider(invocation.result) ??
                          invocation.externalProvider ??
                          '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(invocation.createdAt).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-muted-foreground text-sm">
                  Page {activityPage} of {invocationPageCount} ·{' '}
                  {invocationTotal} total
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activityPage <= 1 || invocations.isFetching}
                    onClick={() => setActivityPage((page) => page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      activityPage >= invocationPageCount ||
                      invocations.isFetching
                    }
                    onClick={() => setActivityPage((page) => page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConnectionDetailsDialog({
  integration,
  onClose,
  onUpdated,
}: {
  integration: IntegrationConnection | null;
  onClose: () => void;
  onUpdated: (integration: IntegrationConnection) => void;
}) {
  const updateIntegration = useUpdateIntegration();
  const [name, setName] = useState('');
  const [status, setStatus] =
    useState<IntegrationConnection['status']>('active');
  const [configJson, setConfigJson] = useState(formatJson({}));
  const [credentialsJson, setCredentialsJson] = useState(formatJson({}));

  useEffect(() => {
    if (!integration) return;
    setName(integration.name);
    setStatus(integration.status);
    setConfigJson(formatJson(integration.config ?? {}));
    setCredentialsJson(formatJson({}));
  }, [integration]);

  if (!integration) return null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!integration) return;

    try {
      const nextConfig = parseJsonObject(configJson, 'Config');
      const nextCredentials = parseJsonObject(
        credentialsJson,
        'New credentials',
      );
      if (hasMaskedCredentialValue(nextCredentials)) {
        throw new Error(
          'New credentials cannot include masked values. Paste fresh secret values or leave the object empty.',
        );
      }

      const updated = await updateIntegration.mutateAsync({
        id: integration.id,
        input: {
          name: name.trim(),
          status,
          config: nextConfig,
          ...(isEmptyObject(nextCredentials)
            ? {}
            : { credentials: nextCredentials }),
        },
      });
      setCredentialsJson(formatJson({}));
      onUpdated(updated);
      toast.success('Connection updated');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update connection',
      );
    }
  }

  return (
    <Dialog
      open={Boolean(integration)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{integration.name}</DialogTitle>
              <Badge variant={statusVariant(integration.status)}>
                {integration.status}
              </Badge>
            </div>
            <DialogDescription>
              Edit the connection config or rotate credentials. Existing
              credential values stay unchanged unless you provide new ones.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem
              label="Provider"
              value={providerLabel(integration.provider)}
            />
            <DetailItem label="Connection ID" value={integration.id} mono />
            <DetailItem
              label="Created"
              value={formatDateTime(integration.createdAt)}
            />
            <DetailItem
              label="Updated"
              value={formatDateTime(integration.updatedAt)}
            />
          </div>

          {integration.errorMessage && (
            <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
              <div className="text-sm font-medium text-destructive">
                Connection error
              </div>
              <p className="mt-2 text-sm text-destructive/90">
                {integration.errorMessage}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="connection-name">Name</Label>
              <Input
                id="connection-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={updateIntegration.isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="connection-status">Status</Label>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as IntegrationConnection['status'])
                }
                disabled={updateIntegration.isPending}
              >
                <SelectTrigger id="connection-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="connection-config">Config JSON</Label>
            <Textarea
              id="connection-config"
              value={configJson}
              onChange={(event) => setConfigJson(event.target.value)}
              disabled={updateIntegration.isPending}
              className="min-h-56 font-mono text-xs"
            />
          </div>

          <JsonBlock
            title="Current masked credentials"
            value={integration.credentials ?? {}}
            description="Read-only. These masked values are never submitted back."
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="connection-credentials">New credentials JSON</Label>
            <Textarea
              id="connection-credentials"
              value={credentialsJson}
              onChange={(event) => setCredentialsJson(event.target.value)}
              disabled={updateIntegration.isPending}
              className="min-h-36 font-mono text-xs"
            />
            <p className="text-muted-foreground text-xs">
              Leave this as an empty object to keep existing credentials. Enter
              a complete replacement object when rotating tokens.
            </p>
          </div>

          <DialogFooter showCloseButton>
            <Button type="submit" disabled={updateIntegration.isPending}>
              {updateIntegration.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-muted/30 p-4">
      <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </div>
      <div
        className={
          mono ? 'mt-2 break-all font-mono text-xs' : 'mt-2 text-sm font-medium'
        }
      >
        {value}
      </div>
    </div>
  );
}

function JsonBlock({
  title,
  value,
  description,
}: {
  title: string;
  value: unknown;
  description?: string;
}) {
  return (
    <section className="rounded-2xl border">
      <div className="border-b p-4">
        <h3 className="text-sm font-medium">{title}</h3>
        {description && (
          <p className="text-muted-foreground mt-1 text-xs">{description}</p>
        )}
      </div>
      <pre className="max-h-72 overflow-auto p-4 font-mono text-xs">
        {formatJson(value)}
      </pre>
    </section>
  );
}

function providerConfig(provider: IntegrationProvider) {
  if (provider === 'notion') {
    return {
      databaseId: 'notion-database-id',
      titleProperty: 'Name',
      mappings: {
        waitlist_add_contact: {
          title: 'Name',
          phone: 'Phone',
          feature: 'Feature',
          notes: 'Notes',
          callerNumber: 'Caller',
          callId: 'Call ID',
          source: 'Source',
          createdAt: 'Created At',
        },
      },
    };
  }
  if (provider === 'google_calendar') {
    return {
      calendarId: 'primary',
    };
  }
  if (provider === 'mcp') {
    return {
      baseUrl: 'https://mcp.example.com',
    };
  }
  return {
    tools: {
      waitlist_add_contact: {
        url: 'https://cms.example.com/waitlist',
      },
      contact_update_notes: {
        url: 'https://cms.example.com/notes',
      },
      calendar_create_event: {
        url: 'https://cms.example.com/appointments',
      },
    },
  };
}

function providerCredentials(provider: IntegrationProvider) {
  if (provider === 'notion') return { token: 'secret_...' };
  if (provider === 'google_calendar') {
    return {
      accessToken: 'ya29...',
      refreshToken: '',
      clientId: '',
      clientSecret: '',
    };
  }
  if (provider === 'mcp') return { bearerToken: '' };
  return { apiKey: 'cms-api-key' };
}

function toolArgs(toolName: string) {
  if (toolName === 'contact_update_notes') {
    return {
      phoneNumber: '911100100',
      notes: 'Caller asked to be contacted by sales.',
    };
  }
  if (toolName === 'calendar_create_event') {
    return {
      title: 'Callback with customer',
      startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      durationMinutes: 30,
      timezone: 'Africa/Addis_Ababa',
      attendeeName: 'Sara',
      attendeePhone: '911100100',
      notes: 'Scheduled from a test tool call.',
    };
  }
  return {
    name: 'Sara',
    phoneNumber: '911100100',
    feature: 'new feature',
    notes: 'Interested during a test tool call.',
  };
}

function parseJsonObject(
  value: string,
  label: string,
): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function isEmptyObject(value: Record<string, unknown>) {
  return Object.keys(value).length === 0;
}

function hasMaskedCredentialValue(value: unknown): boolean {
  if (value === '********') return true;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasMaskedCredentialValue);
  return Object.values(value).some(hasMaskedCredentialValue);
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function providerLabel(provider: IntegrationProvider) {
  return providers.find((item) => item.value === provider)?.label ?? provider;
}

function statusVariant(status: string): 'default' | 'destructive' | 'outline' {
  if (status === 'success' || status === 'active') return 'default';
  if (status === 'error' || status === 'canceled') return 'destructive';
  return 'outline';
}

function resultProvider(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const provider = (value as Record<string, unknown>).externalProvider;
  return typeof provider === 'string' ? provider : null;
}
