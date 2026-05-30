'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { callsKeys } from '../calls/use-calls';
import { dashboardKeys } from '../use-dashboard';

type DashboardEventPayload = {
  callId?: string;
};

const EVENT_NAMES = [
  'call.created',
  'call.updated',
  'call.completed',
  'handoff.requested',
  'handoff.accepted',
  'handoff.failed',
  'queue.updated',
] as const;

export function DashboardEvents({
  organizationId,
}: {
  organizationId: string;
}) {
  const qc = useQueryClient();

  useEffect(() => {
    const events = new EventSource(`/api/events/${organizationId}`);

    const resync = () => {
      void qc.invalidateQueries({ queryKey: callsKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    };

    const onMessage = (event: MessageEvent<string>) => {
      const payload = parsePayload(event.data);
      if (payload?.callId) {
        void qc.invalidateQueries({
          queryKey: callsKeys.detail(payload.callId),
        });
      }
      resync();
    };
    const onConnected = () => {
      console.info(`[sse] connected to org ${organizationId}`);
      resync();
    };
    const onError = () => {
      console.warn(`[sse] disconnected from org ${organizationId}`);
    };

    events.addEventListener('connected', onConnected);
    events.addEventListener('error', onError);
    for (const name of EVENT_NAMES) {
      events.addEventListener(name, onMessage);
    }

    return () => {
      events.removeEventListener('connected', onConnected);
      events.removeEventListener('error', onError);
      for (const name of EVENT_NAMES) {
        events.removeEventListener(name, onMessage);
      }
      events.close();
    };
  }, [organizationId, qc]);

  return null;
}

function parsePayload(data: string): DashboardEventPayload | null {
  try {
    const parsed = JSON.parse(data) as DashboardEventPayload;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
