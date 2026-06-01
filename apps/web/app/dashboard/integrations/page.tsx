'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Plug01Icon,
  RefreshIcon,
  Settings02Icon,
  WorkflowCircle01Icon,
} from '@hugeicons/core-free-icons';
import { PageHeader } from '../components/page-header';
import { useAgents } from '../agents/use-agents';
import {
  useAgentTools,
  useIntegrations,
  useSaveIntegration,
  useTestTool,
  useToolInvocations,
  useUpdateIntegration,
  type AgentTool,
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
  CardFooter,
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
  SelectGroup,
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

type ToolOption = Pick<
  AgentTool,
  | 'name'
  | 'title'
  | 'description'
  | 'inputSchema'
  | 'requiresConfirmation'
  | 'enabled'
>;

const fallbackTools: ToolOption[] = [
  {
    name: 'waitlist_add_contact',
    title: 'Add to waitlist',
    description: 'Add caller details to the connected waitlist system.',
    inputSchema: {},
    requiresConfirmation: true,
    enabled: true,
  },
  {
    name: 'contact_update_notes',
    title: 'Update notes',
    description: 'Save a caller note to the connected contact system.',
    inputSchema: {},
    requiresConfirmation: true,
    enabled: true,
  },
  {
    name: 'calendar_create_event',
    title: 'Create appointment',
    description: 'Create an appointment in the connected calendar.',
    inputSchema: {},
    requiresConfirmation: true,
    enabled: true,
  },
];

const providerGuides: Record<
  IntegrationProvider,
  {
    headline: string;
    bestFor: string;
    config: string;
    credentials: string;
    runtime: string;
  }
> = {
  custom_api: {
    headline: 'Expose any action your organization API supports.',
    bestFor: 'CRMs, ticketing systems, ERPs, internal workflows, lead capture.',
    config:
      'Define each callable action in tools with title, description, inputSchema, and a URL.',
    credentials:
      'Use apiKey, bearerToken, headers, or endpoint-level headers for authentication.',
    runtime:
      'The agent sends toolName, arguments, context, and occurredAt to your endpoint.',
  },
  notion: {
    headline: 'Create database pages from caller information.',
    bestFor: 'Waitlists, lightweight CRM notes, intake records, and call logs.',
    config:
      'Set databaseId and optional mappings so tool fields land in the right Notion columns.',
    credentials: 'Use a Notion integration token with access to the database.',
    runtime:
      'The agent creates a Notion page and maps caller fields into database properties.',
  },
  google_calendar: {
    headline: 'Schedule appointments in a connected calendar.',
    bestFor: 'Callbacks, demos, consultations, service appointments.',
    config:
      'Set calendarId, usually primary, or the target Google Calendar id.',
    credentials:
      'Use accessToken or refreshToken with clientId and clientSecret for refresh.',
    runtime:
      'The agent can call calendar_create_event after collecting title and start time.',
  },
  mcp: {
    headline: 'Connect an MCP-compatible tool server.',
    bestFor: 'Advanced tool hosts that already expose MCP actions.',
    config: 'Set the MCP baseUrl and server-specific connection options.',
    credentials: 'Use bearerToken or server-specific headers when required.',
    runtime:
      'MCP support is listed as a connection target; custom API remains the simplest path.',
  },
};

const flowSteps = [
  {
    label: '1',
    title: 'Define tools',
    description:
      'Tool names, descriptions, and input schemas tell the model which action matches the caller intent.',
  },
  {
    label: '2',
    title: 'Connect provider',
    description:
      'The provider config decides where a tool call goes: custom endpoint, Notion database, or Google Calendar.',
  },
  {
    label: '3',
    title: 'Run during calls',
    description:
      'When the caller asks for an action, the agent calls the tool with structured arguments and logs the result.',
  },
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
  const updateIntegration = useUpdateIntegration();
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
  const agentTools = useAgentTools(selectedAgentId);
  const toolOptions = useMemo(() => {
    const available = agentTools.data?.filter(
      (tool) => tool.name !== 'confirm_tool_action',
    );
    return available?.length ? available : fallbackTools;
  }, [agentTools.data]);
  const [toolName, setToolName] = useState('waitlist_add_contact');
  const [argsJson, setArgsJson] = useState(formatJson(toolArgs(toolName)));
  const [testResult, setTestResult] = useState<unknown>(null);
  const invocationItems = invocations.data?.items ?? [];
  const invocationPagination = invocations.data?.pagination;
  const invocationTotal = invocationPagination?.total ?? 0;
  const invocationPageCount = invocationPagination?.pageCount ?? 1;
  const [editingIntegration, setEditingIntegration] =
    useState<IntegrationConnection | null>(null);
  const [editProvider, setEditProvider] =
    useState<IntegrationProvider>('custom_api');
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] =
    useState<IntegrationConnection['status']>('active');
  const [editConfigJson, setEditConfigJson] = useState('{}');
  const [editCredentialsJson, setEditCredentialsJson] = useState('');
  const selectedTool = toolOptions.find((tool) => tool.name === toolName);
  const selectableToolOptions = toolOptions.filter((tool) => tool.enabled);
  const selectedProviderGuide = providerGuides[provider];
  const activeConnectionCount =
    integrations.data?.filter((integration) => integration.status === 'active')
      .length ?? 0;
  const enabledToolCount = toolOptions.filter((tool) => tool.enabled).length;
  const recentErrorCount =
    invocationItems.filter((invocation) => invocation.status === 'error')
      .length ?? 0;
  const selectedToolRequiredFields = requiredFieldsForTool(selectedTool);
  const editConfigPreview = useMemo(
    () => parseJsonObjectSafe(editConfigJson),
    [editConfigJson],
  );
  const editToolSummaries = useMemo(
    () =>
      configuredToolSummaries(editConfigPreview ?? editingIntegration?.config),
    [editConfigPreview, editingIntegration?.config],
  );

  useEffect(() => {
    if (!toolOptions.length) return;
    if (toolOptions.some((tool) => tool.name === toolName && tool.enabled)) {
      return;
    }
    const nextTool = toolOptions.find((tool) => tool.enabled) ?? toolOptions[0];
    setToolName(nextTool.name);
    setArgsJson(formatJson(toolArgs(nextTool.name, nextTool)));
  }, [toolOptions, toolName]);

  function onProviderChange(value: IntegrationProvider) {
    setProvider(value);
    setConfigJson(formatJson(providerConfig(value)));
    setCredentialsJson(formatJson(providerCredentials(value)));
  }

  function onToolChange(value: string) {
    const nextTool = toolOptions.find((tool) => tool.name === value);
    if (!nextTool?.enabled) return;
    setToolName(value);
    setArgsJson(formatJson(toolArgs(value, nextTool)));
  }

  function onOpenIntegration(integration: IntegrationConnection) {
    setEditingIntegration(integration);
    setEditProvider(integration.provider);
    setEditName(integration.name);
    setEditStatus(integration.status);
    setEditConfigJson(formatJson(integration.config ?? {}));
    setEditCredentialsJson('');
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

  async function onUpdateIntegration(e: React.FormEvent) {
    e.preventDefault();
    if (!editingIntegration) return;

    try {
      const nextCredentials = editCredentialsJson.trim()
        ? parseJsonObject(editCredentialsJson, 'Credentials')
        : undefined;
      await updateIntegration.mutateAsync({
        id: editingIntegration.id,
        input: {
          provider: editProvider,
          name: editName,
          status: editStatus,
          config: parseJsonObject(editConfigJson, 'Config'),
          ...(nextCredentials ? { credentials: nextCredentials } : {}),
        },
      });
      toast.success('Integration updated');
      setEditingIntegration(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Integrations"
        description="Connect external systems and expose their actions as callable agent tools"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Active connections</CardDescription>
            <CardTitle>
              {activeConnectionCount}/{integrations.data?.length ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Agent tools</CardDescription>
            <CardTitle>{enabledToolCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Recent errors</CardDescription>
            <CardTitle>{recentErrorCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Tool Routing</CardTitle>
          <CardDescription>
            The model chooses a tool from the descriptions you save, then the
            runtime sends the structured call to the matching provider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {flowSteps.map((step) => (
              <div
                key={step.label}
                className="flex min-h-32 flex-col gap-3 rounded-xl border bg-muted/30 p-4"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{step.label}</Badge>
                  <div className="font-medium">{step.title}</div>
                </div>
                <p className="text-muted-foreground text-sm">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Configure Provider</CardTitle>
            <CardDescription>
              Save the provider config, tool definitions, and credentials used
              by the runtime.
            </CardDescription>
            <CardAction>
              <Badge variant="outline">{providerLabel(provider)}</Badge>
            </CardAction>
          </CardHeader>
          <form onSubmit={onSave} className="flex flex-col gap-6">
            <CardContent>
              <div className="mb-4 rounded-xl border bg-muted/30 p-4">
                <div className="mb-3 font-medium">
                  {selectedProviderGuide.headline}
                </div>
                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Best for</dt>
                    <dd>{selectedProviderGuide.bestFor}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Runtime</dt>
                    <dd>{selectedProviderGuide.runtime}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Config</dt>
                    <dd>{selectedProviderGuide.config}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Credentials</dt>
                    <dd>{selectedProviderGuide.credentials}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select
                      value={provider}
                      onValueChange={(value) =>
                        onProviderChange(value as IntegrationProvider)
                      }
                    >
                      <SelectTrigger id="provider" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {providers.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
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
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="config">Config JSON</Label>
                    <Badge variant="outline">
                      {provider === 'custom_api'
                        ? 'Tool definitions'
                        : 'Provider settings'}
                    </Badge>
                  </div>
                  <JsonTextarea
                    id="config"
                    value={configJson}
                    onChange={setConfigJson}
                    disabled={save.isPending}
                    heightClassName="h-72"
                  />
                  <p className="text-muted-foreground text-xs">
                    For custom APIs, every key under tools becomes a callable
                    model tool. Description and inputSchema are what guide
                    intent matching. Long configs scroll inside this editor.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="credentials">Credentials JSON</Label>
                  <JsonTextarea
                    id="credentials"
                    value={credentialsJson}
                    onChange={setCredentialsJson}
                    disabled={save.isPending}
                    heightClassName="h-36"
                  />
                  <p className="text-muted-foreground text-xs">
                    Credentials are stored server-side and masked in connection
                    responses.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={save.isPending}>
                <HugeiconsIcon icon={Plug01Icon} size={16} strokeWidth={1.6} />
                {save.isPending ? 'Saving...' : 'Save integration'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tool Test</CardTitle>
            <CardDescription>
              Runs the same execution path used during calls, including provider
              routing and invocation logging.
            </CardDescription>
            <CardAction>
              <Badge variant="outline">{enabledToolCount} enabled</Badge>
            </CardAction>
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
                  <SelectTrigger id="agent" className="w-full">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(agents.data ?? []).map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tool">Tool</Label>
                <Select
                  value={selectedTool?.enabled ? toolName : ''}
                  onValueChange={onToolChange}
                  disabled={
                    agentTools.isLoading || selectableToolOptions.length === 0
                  }
                >
                  <SelectTrigger id="tool" className="w-full min-w-0">
                    <SelectValue
                      placeholder={
                        agentTools.isLoading
                          ? 'Loading tools...'
                          : 'Select a tool'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    className="max-w-[min(32rem,calc(100vw-2rem))]"
                  >
                    <SelectGroup>
                      {selectableToolOptions.map((tool) => (
                        <SelectItem key={tool.name} value={tool.name}>
                          <span className="block max-w-[min(28rem,calc(100vw-4rem))] truncate">
                            {tool.title || tool.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {selectedTool ? (
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{selectedTool.name}</Badge>
                      <Badge
                        variant={
                          selectedTool.requiresConfirmation
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {selectedTool.requiresConfirmation
                          ? 'confirmation'
                          : 'direct'}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {selectedTool.description}
                    </p>
                    {selectedToolRequiredFields.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground text-xs">
                          Required
                        </span>
                        {selectedToolRequiredFields.map((field) => (
                          <Badge key={field} variant="outline">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Available agent tools</Label>
                <div className="flex max-h-28 flex-wrap gap-2 overflow-auto rounded-xl border bg-muted/30 p-3">
                  {toolOptions.map((tool) => (
                    <Badge
                      key={tool.name}
                      variant={tool.enabled ? 'outline' : 'secondary'}
                    >
                      {tool.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="args">Arguments JSON</Label>
                <JsonTextarea
                  id="args"
                  value={argsJson}
                  onChange={setArgsJson}
                  disabled={testTool.isPending}
                  heightClassName="h-40"
                />
              </div>

              <Button
                type="submit"
                disabled={
                  testTool.isPending ||
                  !selectedAgentId ||
                  !selectedTool?.enabled
                }
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
              No integrations configured. Save a provider connection to make
              tools available to agents.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Tools</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
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
                      <div className="flex max-w-96 flex-wrap gap-1.5">
                        {connectionToolNames(integration).map((tool) => (
                          <Badge key={tool} variant="outline">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
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
                        onClick={() => onOpenIntegration(integration)}
                      >
                        <HugeiconsIcon
                          icon={Settings02Icon}
                          size={16}
                          strokeWidth={1.6}
                        />
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

      <Dialog
        open={Boolean(editingIntegration)}
        onOpenChange={(open) => {
          if (!open) setEditingIntegration(null);
        }}
      >
        <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Integration Details</DialogTitle>
            <DialogDescription>
              Edit the saved provider config, including custom tool descriptions
              and input schemas. Leave credentials blank to keep the existing
              secret values.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onUpdateIntegration} className="flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-provider">Provider</Label>
                <Select
                  value={editProvider}
                  onValueChange={(value) =>
                    setEditProvider(value as IntegrationProvider)
                  }
                  disabled={updateIntegration.isPending}
                >
                  <SelectTrigger id="edit-provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {providers.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  disabled={updateIntegration.isPending}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editStatus}
                  onValueChange={(value) =>
                    setEditStatus(value as IntegrationConnection['status'])
                  }
                  disabled={updateIntegration.isPending}
                >
                  <SelectTrigger id="edit-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="inactive">inactive</SelectItem>
                      <SelectItem value="error">error</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="edit-config">Config JSON</Label>
                    <Badge
                      variant={editConfigPreview ? 'outline' : 'destructive'}
                    >
                      {editConfigPreview ? 'valid JSON' : 'invalid JSON'}
                    </Badge>
                  </div>
                  <JsonTextarea
                    id="edit-config"
                    value={editConfigJson}
                    onChange={setEditConfigJson}
                    disabled={updateIntegration.isPending}
                    heightClassName="h-96"
                  />
                  <p className="text-muted-foreground text-xs">
                    Change a tool title, description, requiresConfirmation,
                    path, inputSchema, or outputSchema here.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="edit-credentials">
                    Credentials JSON replacement
                  </Label>
                  <JsonTextarea
                    id="edit-credentials"
                    value={editCredentialsJson}
                    onChange={setEditCredentialsJson}
                    disabled={updateIntegration.isPending}
                    heightClassName="h-32"
                  />
                  <p className="text-muted-foreground text-xs">
                    Leave blank to keep existing credentials. Paste a full JSON
                    object only when rotating keys or tokens.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
                <div>
                  <div className="font-medium">Configured Tools</div>
                  <p className="text-muted-foreground text-xs">
                    Parsed from the config JSON.
                  </p>
                </div>

                {editToolSummaries.length > 0 ? (
                  <div className="flex max-h-[28rem] flex-col gap-3 overflow-auto">
                    {editToolSummaries.map((tool) => (
                      <div
                        key={tool.name}
                        className="rounded-xl border bg-background/70 p-3"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{tool.name}</Badge>
                          <Badge
                            variant={
                              tool.requiresConfirmation
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {tool.requiresConfirmation
                              ? 'confirmation'
                              : 'direct'}
                          </Badge>
                        </div>
                        <div className="font-medium">{tool.title}</div>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {tool.description}
                        </p>
                        {tool.required.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {tool.required.map((field) => (
                              <Badge key={field} variant="outline">
                                {field}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground rounded-xl border bg-background/70 p-3 text-sm">
                    No tools found under config.tools.
                  </div>
                )}
              </div>
            </div>

            <DialogFooter showCloseButton>
              <Button
                type="submit"
                disabled={updateIntegration.isPending || !editConfigPreview}
              >
                {updateIntegration.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
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
    baseUrl: 'http://127.0.0.1:4010',
    tools: {
      lookup_order_status: {
        title: 'Lookup order status',
        description:
          'Use when a caller asks where their order is, when it will arrive, or whether an order exists.',
        path: '/tools/lookup_order_status',
        requiresConfirmation: false,
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            orderId: {
              type: 'string',
              description: 'Order id, for example ORD-1001.',
            },
            phoneNumber: { type: 'string' },
          },
          required: ['orderId'],
        },
      },
      send_payment_link: {
        title: 'Send payment link',
        description:
          'Use when a caller wants to pay an outstanding amount by phone link.',
        path: '/tools/send_payment_link',
        requiresConfirmation: true,
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            phoneNumber: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string', default: 'ETB' },
            reason: { type: 'string' },
          },
          required: ['phoneNumber', 'amount'],
        },
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
  return { apiKey: 'dev-sample-key' };
}

function JsonTextarea({
  id,
  value,
  onChange,
  disabled,
  heightClassName,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  heightClassName: string;
}) {
  return (
    <Textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      spellCheck={false}
      wrap="off"
      className={`${heightClassName} max-w-full resize-none overflow-auto font-mono text-xs leading-5 [tab-size:2]`}
    />
  );
}

function requiredFieldsForTool(tool: ToolOption | undefined): string[] {
  const schema = jsonObject(tool?.inputSchema);
  const required = schema.required;
  if (!Array.isArray(required)) return [];
  return required.filter((item): item is string => typeof item === 'string');
}

function connectionToolNames(integration: IntegrationConnection): string[] {
  const config = jsonObject(integration.config);
  const tools = jsonObject(config.tools);
  const names = Object.keys(tools);
  if (names.length > 0) return names.slice(0, 6);

  if (integration.provider === 'google_calendar') {
    return ['calendar_create_event'];
  }
  if (integration.provider === 'notion' && config.databaseId) {
    return [
      'waitlist_add_contact',
      'contact_update_notes',
      'calendar_create_event',
    ];
  }
  if (integration.provider === 'custom_api' && config.baseUrl) {
    return ['default endpoints'];
  }
  return ['not configured'];
}

function toolArgs(toolName: string, tool?: ToolOption) {
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
  if (toolName !== 'waitlist_add_contact') {
    return sampleArgsFromSchema(tool?.inputSchema);
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

function parseJsonObjectSafe(value: string): Record<string, unknown> | null {
  try {
    return parseJsonObject(value, 'JSON');
  } catch {
    return null;
  }
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
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

type ToolSummary = {
  name: string;
  title: string;
  description: string;
  requiresConfirmation: boolean;
  required: string[];
};

function configuredToolSummaries(config: unknown): ToolSummary[] {
  const tools = jsonObject(jsonObject(config).tools);
  return Object.entries(tools).map(([name, value]) => {
    const tool = jsonObject(value);
    const schema = jsonObject(tool.inputSchema);
    const required = Array.isArray(schema.required)
      ? schema.required.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];

    return {
      name,
      title: stringValue(tool.title) ?? humanizeToolName(name),
      description:
        stringValue(tool.description) ??
        'No description yet. Add one so the model knows when to call this tool.',
      requiresConfirmation: booleanValue(tool.requiresConfirmation) ?? true,
      required,
    };
  });
}

function sampleArgsFromSchema(schema: unknown): Record<string, unknown> {
  const object = jsonObject(schema);
  const properties = jsonObject(object.properties);
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      sampleValue(value, key),
    ]),
  );
}

function sampleValue(schema: unknown, key: string): unknown {
  const object = jsonObject(schema);
  if (object.default !== undefined) return object.default;
  if (Array.isArray(object.enum) && object.enum.length > 0) {
    return object.enum[0];
  }

  const type = Array.isArray(object.type) ? object.type[0] : object.type;
  if (object.format === 'date-time') {
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }
  if (type === 'integer' || type === 'number') {
    return typeof object.minimum === 'number' ? object.minimum : 1;
  }
  if (type === 'boolean') return false;
  if (type === 'array') return [];
  if (type === 'object') return {};
  if (key.toLowerCase().includes('phone')) return '911100100';
  if (key.toLowerCase().includes('name')) return 'Sara';
  return '';
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function humanizeToolName(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
