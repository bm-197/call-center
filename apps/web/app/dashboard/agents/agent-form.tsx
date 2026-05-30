'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Agent, AgentInput } from './use-agents';
import { useCreateAgent, useUpdateAgent } from './use-agents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const GEMINI_LIVE_VOICES = [
  { name: 'Zephyr', tone: 'Bright' },
  { name: 'Puck', tone: 'Upbeat' },
  { name: 'Charon', tone: 'Informative' },
  { name: 'Kore', tone: 'Firm' },
  { name: 'Fenrir', tone: 'Excitable' },
  { name: 'Leda', tone: 'Youthful' },
  { name: 'Orus', tone: 'Firm' },
  { name: 'Aoede', tone: 'Breezy' },
  { name: 'Callirrhoe', tone: 'Easy-going' },
  { name: 'Autonoe', tone: 'Bright' },
  { name: 'Enceladus', tone: 'Breathy' },
  { name: 'Iapetus', tone: 'Clear' },
  { name: 'Umbriel', tone: 'Easy-going' },
  { name: 'Algieba', tone: 'Smooth' },
  { name: 'Despina', tone: 'Smooth' },
  { name: 'Erinome', tone: 'Clear' },
  { name: 'Algenib', tone: 'Gravelly' },
  { name: 'Rasalgethi', tone: 'Informative' },
  { name: 'Laomedeia', tone: 'Upbeat' },
  { name: 'Achernar', tone: 'Soft' },
  { name: 'Alnilam', tone: 'Firm' },
  { name: 'Schedar', tone: 'Even' },
  { name: 'Gacrux', tone: 'Mature' },
  { name: 'Pulcherrima', tone: 'Forward' },
  { name: 'Achird', tone: 'Friendly' },
  { name: 'Zubenelgenubi', tone: 'Casual' },
  { name: 'Vindemiatrix', tone: 'Gentle' },
  { name: 'Sadachbia', tone: 'Lively' },
  { name: 'Sadaltager', tone: 'Knowledgeable' },
  { name: 'Sulafat', tone: 'Warm' },
] as const;

function normalizeLiveVoice(value: string | null | undefined) {
  return (
    GEMINI_LIVE_VOICES.find((voice) => voice.name === value)?.name ?? 'Puck'
  );
}

const DEFAULTS: AgentInput = {
  name: '',
  description: '',
  language: 'am',
  status: 'draft',
  systemPrompt: `አንተ የደንበኛ አገልግሎት ወኪል ነህ። በትህትና በአማርኛ ምላሽ ስጥ።`,
  llmProvider: 'google',
  llmModel: 'gemini-3.1-flash-live-preview',
  sttProvider: 'google',
  ttsProvider: 'google',
  ttsVoice: 'Puck',
  handoffEnabled: true,
  handoffConfidenceThreshold: 0.3,
  handoffMaxFailedAttempts: 3,
  handoffMessage: 'እባክዎ ይጠብቁ፣ ወደ ወኪላችን እያስተላለፍዎት ነው።',
};

type Mode = { kind: 'create' } | { kind: 'edit'; agent: Agent };

export function AgentForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const create = useCreateAgent();
  const update = useUpdateAgent(mode.kind === 'edit' ? mode.agent.id : '');

  const initial: AgentInput =
    mode.kind === 'edit'
      ? {
          ...DEFAULTS,
          ...mode.agent,
          description: mode.agent.description ?? '',
          ttsVoice: normalizeLiveVoice(mode.agent.ttsVoice),
        }
      : DEFAULTS;

  const [form, setForm] = useState<AgentInput>(initial);
  const pending = create.isPending || update.isPending;

  function update_<K extends keyof AgentInput>(key: K, value: AgentInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (mode.kind === 'create') {
        const created = await create.mutateAsync(form);
        toast.success('Agent created');
        router.push(`/dashboard/agents/${created.id}`);
      } else {
        await update.mutateAsync(form);
        toast.success('Agent saved');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => update_('name', e.target.value)}
                placeholder="Customer support"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  update_('status', v as AgentInput['status'])
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description ?? ''}
              onChange={(e) => update_('description', e.target.value)}
              placeholder="What this agent does"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select
              value={form.language}
              onValueChange={(v) =>
                update_('language', v as AgentInput['language'])
              }
            >
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="am">Amharic (አማርኛ)</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="am+en">Amharic + English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System prompt</Label>
            <Textarea
              id="systemPrompt"
              rows={6}
              value={form.systemPrompt ?? ''}
              onChange={(e) => update_('systemPrompt', e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-muted-foreground text-xs">
              Instructions the AI follows on every call. Be specific about tone,
              tasks, and limits.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voice tone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="ttsVoice">Voice tone</Label>
            <Select
              value={normalizeLiveVoice(form.ttsVoice)}
              onValueChange={(v) => update_('ttsVoice', v)}
            >
              <SelectTrigger id="ttsVoice" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {GEMINI_LIVE_VOICES.map((voice) => (
                  <SelectItem key={voice.name} value={voice.name}>
                    {voice.name} · {voice.tone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Human handoff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="handoffEnabled">Enable handoff</Label>
              <p className="text-muted-foreground text-xs">
                Transfer to a human when the AI gets stuck or the caller asks
              </p>
            </div>
            <Switch
              id="handoffEnabled"
              checked={form.handoffEnabled ?? false}
              onCheckedChange={(v) => update_('handoffEnabled', v)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="threshold">Confidence threshold</Label>
              <Input
                id="threshold"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={form.handoffConfidenceThreshold ?? 0.3}
                onChange={(e) =>
                  update_(
                    'handoffConfidenceThreshold',
                    parseFloat(e.target.value),
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxAttempts">Max failed attempts</Label>
              <Input
                id="maxAttempts"
                type="number"
                min={1}
                max={10}
                value={form.handoffMaxFailedAttempts ?? 3}
                onChange={(e) =>
                  update_(
                    'handoffMaxFailedAttempts',
                    parseInt(e.target.value, 10),
                  )
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="handoffMessage">Handoff message</Label>
            <Textarea
              id="handoffMessage"
              rows={2}
              value={form.handoffMessage ?? ''}
              onChange={(e) => update_('handoffMessage', e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Played to the caller before transferring
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/dashboard/agents')}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? 'Saving…'
            : mode.kind === 'create'
              ? 'Create agent'
              : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
