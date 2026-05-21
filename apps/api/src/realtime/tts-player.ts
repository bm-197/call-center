import type { AudioBridge } from './audio-bridge.js';

const FRAME_BYTES = 160; // 20ms @ 8kHz µ-law
const FRAME_INTERVAL_MS = 20;
const INITIAL_BUFFER_FRAMES = 6; // 120ms startup buffer
const INITIAL_BUFFER_BYTES = FRAME_BYTES * INITIAL_BUFFER_FRAMES;
const MULAW_SILENCE = 0xff;

/**
 * Paces µ-law audio frames out to the AudioBridge at 20ms intervals.
 * Multiple sentence buffers can be enqueued; they play back-to-back.
 * cancel() drops everything pending — used for barge-in.
 */
export class TtsPlayer {
  private buffer = Buffer.alloc(0);
  private timer: NodeJS.Timeout | null = null;
  private nextTickAt = 0;
  private flushRequested = false;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly bridge: AudioBridge) {}

  enqueue(buf: Buffer): void {
    if (buf.length === 0) return;
    this.buffer = Buffer.concat([this.buffer, buf]);
    this.startIfReady();
  }

  isPlaying(): boolean {
    return this.buffer.length > 0 || this.timer !== null;
  }

  /** Finish the current turn, padding any final partial frame with silence. */
  flush(): void {
    this.flushRequested = true;
    const remainder = this.buffer.length % FRAME_BYTES;
    if (remainder > 0) {
      this.buffer = Buffer.concat([
        this.buffer,
        Buffer.alloc(FRAME_BYTES - remainder, MULAW_SILENCE),
      ]);
    }
    this.startIfReady();
    if (this.buffer.length === 0 && !this.timer) this.finishTurn();
  }

  /** Drop everything pending — barge-in. */
  cancel(): void {
    this.buffer = Buffer.alloc(0);
    this.flushRequested = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.resolveIdle();
  }

  /** Resolves when the queue has fully drained. */
  drained(): Promise<void> {
    if (this.buffer.length === 0 && !this.timer) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  private startIfReady(): void {
    if (this.timer || this.buffer.length < FRAME_BYTES) return;
    if (!this.flushRequested && this.buffer.length < INITIAL_BUFFER_BYTES) {
      return;
    }

    this.nextTickAt = Date.now();
    this.scheduleNext();
  }

  private scheduleNext(): void {
    const now = Date.now();
    const delay = Math.max(0, this.nextTickAt - now);
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private tick(): void {
    this.timer = null;
    if (this.buffer.length < FRAME_BYTES) {
      if (this.flushRequested) {
        this.finishTurn();
        return;
      }
      console.warn(
        `[tts-player] playback underrun; waiting for refill (${this.buffer.length} bytes buffered)`,
      );
      return;
    }

    const frame = this.buffer.subarray(0, FRAME_BYTES);
    this.bridge.send(frame);
    this.buffer = this.buffer.subarray(FRAME_BYTES);

    this.nextTickAt += FRAME_INTERVAL_MS;
    this.scheduleNext();
  }

  private finishTurn(): void {
    this.flushRequested = false;
    this.resolveIdle();
  }

  private resolveIdle(): void {
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const r of resolvers) r();
  }
}
