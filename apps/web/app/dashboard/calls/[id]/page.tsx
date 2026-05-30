'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  BotIcon,
  CallIncoming01Icon,
  CallOutgoing01Icon,
  UserIcon,
  UserGroupIcon,
  VolumeHighIcon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AudioPlayer } from '@/components/ui/audio-player';
import { cn } from '@/lib/utils';
import {
  useAcceptHandoffCall,
  useCall,
  useCallRecording,
  type CallTranscriptTurn,
} from '../use-calls';
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  formatContactName,
  formatDuration,
  formatHandoffReason,
  formatHandoffRelative,
  formatPhone,
  formatRelative,
  isActive,
} from '../format';

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: call, isLoading, error } = useCall(id);
  const [showRecording, setShowRecording] = useState(false);
  const recording = useCallRecording(id, showRecording);
  const acceptHandoff = useAcceptHandoffCall();

  if (isLoading) return <DetailSkeleton />;
  if (error || !call) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Call not found.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/calls">Back to calls</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const transcriptAm = call.transcriptAm ?? [];
  const transcriptEn = call.transcriptEn ?? [];
  const hasAm = transcriptAm.length > 0;
  const hasEn = transcriptEn.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button asChild variant="ghost" size="icon" className="mt-1">
          <Link href="/dashboard/calls">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={18} strokeWidth={1.6} />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <HugeiconsIcon
              icon={
                call.direction === 'inbound'
                  ? CallIncoming01Icon
                  : CallOutgoing01Icon
              }
              size={20}
              strokeWidth={1.5}
              className="text-muted-foreground"
            />
            <h1 className="text-2xl font-semibold tracking-tight">
              {call.contact
                ? formatContactName(call.contact)
                : formatPhone(call.callerNumber)}
            </h1>
            <Badge variant={STATUS_VARIANT[call.status]} className="capitalize">
              {isActive(call.status) && (
                <span className="bg-primary mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full" />
              )}
              {STATUS_LABEL[call.status]}
            </Badge>
            {call.handedOff && (
              <Badge variant="outline" className="gap-1">
                <HugeiconsIcon
                  icon={UserGroupIcon}
                  size={10}
                  strokeWidth={1.6}
                />
                Handed off
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-mono">{formatPhone(call.callerNumber)}</span>
            <span>·</span>
            <span>{formatRelative(call.startedAt)}</span>
            <span>·</span>
            <span>{formatDuration(call.duration)}</span>
            {call.agent && (
              <>
                <span>·</span>
                <span>Agent: {call.agent.name}</span>
              </>
            )}
          </div>
        </div>
        {call.status === 'queued' && call.handedOff && (
          <Button
            disabled={acceptHandoff.isPending}
            onClick={async () => {
              try {
                await acceptHandoff.mutateAsync(call.id);
                toast.success('Handoff accepted');
              } catch (err) {
                toast.error(
                  err instanceof Error
                    ? err.message
                    : 'Failed to accept handoff',
                );
              }
            }}
          >
            {acceptHandoff.isPending ? 'Accepting…' : 'Accept handoff'}
          </Button>
        )}
      </div>

      {call.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">{call.summary}</p>
            {call.summaryEn && call.summaryEn !== call.summary && (
              <p className="text-muted-foreground border-t pt-3 text-sm leading-relaxed">
                {call.summaryEn}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {call.handedOff && call.handoffReason && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ወደ ሰው ወኪል ማስተላለፍ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">ምክንያት:</span>{' '}
              {formatHandoffReason(call.handoffReason)}
            </p>
            {call.handoffTime && (
              <p className="text-muted-foreground text-xs">
                {formatHandoffRelative(call.handoffTime)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Transcript</CardTitle>
          {call.recordingUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRecording(true)}
              disabled={recording.isFetching}
            >
              <HugeiconsIcon
                icon={VolumeHighIcon}
                size={14}
                strokeWidth={1.6}
              />
              {recording.isFetching ? 'Loading…' : 'Play recording'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {showRecording && recording.data?.url && (
            <AudioPlayer
              src={recording.data.url}
              autoPlay
              downloadName={`call-${call.id}.wav`}
            />
          )}

          {!hasAm && !hasEn ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {isActive(call.status)
                ? 'Transcript will appear as the call progresses…'
                : 'No transcript was captured for this call.'}
            </p>
          ) : hasAm && hasEn ? (
            <Tabs defaultValue="am">
              <TabsList>
                <TabsTrigger value="am">አማርኛ</TabsTrigger>
                <TabsTrigger value="en">English</TabsTrigger>
              </TabsList>
              <TabsContent value="am" className="mt-4">
                <Transcript turns={transcriptAm} />
              </TabsContent>
              <TabsContent value="en" className="mt-4">
                <Transcript turns={transcriptEn} />
              </TabsContent>
            </Tabs>
          ) : (
            <Transcript turns={hasAm ? transcriptAm : transcriptEn} />
          )}
        </CardContent>
      </Card>

      {call.collectedInfo && Object.keys(call.collectedInfo).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Collected info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              {Object.entries(call.collectedInfo).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    {k}
                  </dt>
                  <dd className="text-sm">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Transcript({ turns }: { turns: CallTranscriptTurn[] }) {
  return (
    <div className="space-y-3">
      {turns.map((t) => {
        const isCaller = t.speaker === 'caller';
        const isHuman = t.speaker === 'human';
        return (
          <div
            key={`${t.timestamp}-${t.speaker}`}
            className={cn('flex gap-3', isCaller && 'flex-row-reverse')}
          >
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                isCaller
                  ? 'bg-secondary text-secondary-foreground'
                  : isHuman
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground',
              )}
            >
              <HugeiconsIcon
                icon={isCaller ? UserIcon : isHuman ? UserGroupIcon : BotIcon}
                size={14}
                strokeWidth={1.6}
              />
            </div>
            <div
              className={cn(
                'max-w-[80%] space-y-1 rounded-lg px-3 py-2 text-sm leading-relaxed',
                isCaller ? 'bg-secondary/60 text-right' : 'bg-muted/40',
              )}
            >
              <div>{t.text}</div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wide">
                {t.speaker} ·{' '}
                {new Date(t.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-9 w-9" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-12 w-3/4" />
        </CardContent>
      </Card>
    </div>
  );
}
