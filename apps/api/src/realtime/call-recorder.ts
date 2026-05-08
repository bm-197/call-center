/**
 * CallRecorder — capture both directions of a call as a single mixed-mono
 * 8kHz PCM16 WAV on disk, mixing µ-law frames as they arrive.
 *
 * Design:
 *   - Two FIFOs (caller / AI) of 160-byte µ-law frames.
 *   - A 20ms pump drains one frame from each FIFO (or µ-law silence if
 *     a side is quiet), µ-law-decodes both to PCM16, sums + clamps, and
 *     writes one 160-sample (320-byte) PCM16 frame to the WAV file.
 *   - The WAV header is written with placeholder sizes; finalize()
 *     patches the real sizes after the data is fully written.
 *
 * Time alignment: relying on the 20ms pump rather than wall-clock
 * timestamps. Both sides emit frames at ~50 fps (caller via RTP arrivals,
 * AI via TtsPlayer's 20ms pacing), so the pump stays naturally aligned.
 * If a side is silent its FIFO empties and the pump fills with µ-law 0xFF
 * silence for that slot.
 */

import { createWriteStream, type WriteStream } from 'node:fs';
import { open as fsOpen } from 'node:fs/promises';

const FRAME_BYTES = 160; // 20ms @ 8kHz µ-law
const FRAME_SAMPLES = 160; // 1 byte/sample for µ-law → 160 samples/frame
const PUMP_INTERVAL_MS = 20;
const ULAW_SILENCE = 0xff;
const SAMPLE_RATE = 8000;
const PCM_BYTES_PER_FRAME = FRAME_SAMPLES * 2; // PCM16 = 2 bytes/sample

// Pre-computed ITU-T G.711 µ-law → PCM16 lookup table (256 entries).
const ULAW_TABLE = new Int16Array(256);
for (let u = 0; u < 256; u++) {
  const inv = ~u & 0xff;
  const sign = inv & 0x80;
  const exp = (inv >> 4) & 0x07;
  const mantissa = inv & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exp;
  sample -= 0x84;
  ULAW_TABLE[u] = sign ? -sample : sample;
}

const SILENCE_FRAME = Buffer.alloc(FRAME_BYTES, ULAW_SILENCE);

export class CallRecorder {
  private callerQueue: Buffer[] = [];
  private aiQueue: Buffer[] = [];
  private out: WriteStream | null = null;
  private pump: NodeJS.Timeout | null = null;
  private nextTick = 0;
  private dataBytesWritten = 0;
  private closed = false;
  private finalizePromise: Promise<void> | null = null;

  constructor(public readonly filePath: string) {}

  /** Start recording. Writes a placeholder WAV header. */
  start(): void {
    this.out = createWriteStream(this.filePath);
    // Placeholder 44-byte WAV header — patched on finalize when we know
    // the final data size.
    this.out.write(Buffer.alloc(44));
    this.nextTick = Date.now();
    this.scheduleNext();
  }

  writeInbound(frame: Buffer): void {
    if (this.closed) return;
    this.callerQueue.push(frame);
  }

  writeOutbound(frame: Buffer): void {
    if (this.closed) return;
    this.aiQueue.push(frame);
  }

  /** Stop the pump, drain remaining frames, patch the WAV header. */
  async finalize(): Promise<{
    filePath: string;
    durationSec: number;
    bytes: number;
  }> {
    if (this.finalizePromise) return this.finalizePromise as never;
    this.finalizePromise = (async () => {
      this.closed = true;
      if (this.pump) {
        clearTimeout(this.pump);
        this.pump = null;
      }
      // Drain whatever is left so neither side is cut short.
      while (this.callerQueue.length > 0 || this.aiQueue.length > 0) {
        this.tick();
      }
      await new Promise<void>((resolve) => this.out!.end(resolve));
      await this.patchHeader();
    })();
    await this.finalizePromise;
    const durationSec = this.dataBytesWritten / (SAMPLE_RATE * 2);
    return {
      filePath: this.filePath,
      durationSec,
      bytes: 44 + this.dataBytesWritten,
    };
  }

  private scheduleNext(): void {
    const now = Date.now();
    const delay = Math.max(0, this.nextTick - now);
    this.pump = setTimeout(() => this.tick(), delay);
  }

  private tick(): void {
    if (
      this.closed &&
      this.callerQueue.length === 0 &&
      this.aiQueue.length === 0
    ) {
      return;
    }
    const caller = this.callerQueue.shift() ?? SILENCE_FRAME;
    const ai = this.aiQueue.shift() ?? SILENCE_FRAME;
    const mixed = mixMulawToPcm16(caller, ai);
    this.out!.write(mixed);
    this.dataBytesWritten += mixed.length;

    if (!this.closed) {
      this.nextTick += PUMP_INTERVAL_MS;
      this.scheduleNext();
    }
  }

  private async patchHeader(): Promise<void> {
    const fh = await fsOpen(this.filePath, 'r+');
    try {
      const header = buildWavHeader(this.dataBytesWritten);
      await fh.write(header, 0, header.length, 0);
    } finally {
      await fh.close();
    }
  }
}

/**
 * Mix two µ-law-encoded 160-byte frames into one PCM16 frame.
 * Output: 160 samples × 2 bytes = 320 bytes, little-endian.
 */
function mixMulawToPcm16(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(PCM_BYTES_PER_FRAME);
  for (let i = 0; i < FRAME_SAMPLES; i++) {
    const aSample = i < a.length ? ULAW_TABLE[a[i]!]! : 0;
    const bSample = i < b.length ? ULAW_TABLE[b[i]!]! : 0;
    let mix = aSample + bSample;
    if (mix > 32767) mix = 32767;
    else if (mix < -32768) mix = -32768;
    out.writeInt16LE(mix, i * 2);
  }
  return out;
}

/**
 * Build a 44-byte RIFF/WAV header for PCM16 mono 8kHz.
 */
function buildWavHeader(dataBytes: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4); // chunk size
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate (1 channel × 2 bytes × 8000)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}
