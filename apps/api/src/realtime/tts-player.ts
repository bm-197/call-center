import type { AudioBridge } from './audio-bridge.js';

const FRAME_BYTES = 160; // 20ms @ 8kHz µ-law
const FRAME_INTERVAL_MS = 20;

/**
 * Paces µ-law audio frames out to the AudioBridge at 20ms intervals.
 * Multiple sentence buffers can be enqueued; they play back-to-back.
 * cancel() drops everything pending — used for barge-in.
 */
export class TtsPlayer {
  private queue: Buffer[] = [];
  private offset = 0;
  private timer: NodeJS.Timeout | null = null;
  private nextTickAt = 0;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly bridge: AudioBridge) {}

  enqueue(buf: Buffer): void {
    if (buf.length === 0) return;
    this.queue.push(buf);
    if (!this.timer) {
      this.nextTickAt = Date.now();
      this.scheduleNext();
    }
  }

  isPlaying(): boolean {
    return this.queue.length > 0 || this.timer !== null;
  }

  /** Drop everything pending — barge-in. */
  cancel(): void {
    this.queue = [];
    this.offset = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.resolveIdle();
  }

  /** Resolves when the queue has fully drained. */
  drained(): Promise<void> {
    if (this.queue.length === 0 && !this.timer) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  private scheduleNext(): void {
    const now = Date.now();
    const delay = Math.max(0, this.nextTickAt - now);
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private tick(): void {
    this.timer = null;
    if (this.queue.length === 0) {
      this.offset = 0;
      this.resolveIdle();
      return;
    }

    const head = this.queue[0]!;
    const end = Math.min(this.offset + FRAME_BYTES, head.length);
    const frame = head.subarray(this.offset, end);
    this.bridge.send(frame);
    this.offset = end;
    if (this.offset >= head.length) {
      this.queue.shift();
      this.offset = 0;
    }

    this.nextTickAt += FRAME_INTERVAL_MS;
    this.scheduleNext();
  }

  private resolveIdle(): void {
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const r of resolvers) r();
  }
}
