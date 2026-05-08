import type { CallStatus } from './use-calls';

export const STATUS_LABEL: Record<CallStatus, string> = {
  ringing: 'Ringing',
  in_progress: 'In progress',
  ai_handling: 'AI handling',
  queued: 'Queued',
  human_handling: 'Human handling',
  completed: 'Completed',
  failed: 'Failed',
  missed: 'Missed',
};

export const STATUS_VARIANT: Record<
  CallStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  ringing: 'secondary',
  in_progress: 'secondary',
  ai_handling: 'secondary',
  queued: 'outline',
  human_handling: 'default',
  completed: 'default',
  failed: 'destructive',
  missed: 'outline',
};

const ACTIVE_STATUSES: CallStatus[] = [
  'ringing',
  'in_progress',
  'ai_handling',
  'queued',
  'human_handling',
];

export function isActive(status: CallStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatPhone(num: string): string {
  // Light formatting for Ethiopian numbers (+251 9XX XXX XXX)
  if (num.startsWith('+251') && num.length >= 13) {
    return `${num.slice(0, 4)} ${num.slice(4, 7)} ${num.slice(7, 10)} ${num.slice(10)}`;
  }
  return num;
}

export function formatContactName(
  c: {
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
  } | null,
): string {
  if (!c) return '';
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return name || formatPhone(c.phoneNumber);
}
