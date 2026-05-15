import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioBridge } from '../src/realtime/audio-bridge.js';
import { TtsPlayer } from '../src/realtime/tts-player.js';

const FRAME_BYTES = 160;
const START_BUFFER_BYTES = FRAME_BYTES * 6;

class FakeBridge {
  public readonly frames: Buffer[] = [];

  send(frame: Buffer): void {
    this.frames.push(Buffer.from(frame));
  }
}

describe('TtsPlayer', () => {
  let bridge: FakeBridge;
  let player: TtsPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    bridge = new FakeBridge();
    player = new TtsPlayer(bridge as unknown as AudioBridge);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('waits for the initial 120ms playout buffer before sending', () => {
    player.enqueue(Buffer.alloc(START_BUFFER_BYTES - 1, 0x11));

    vi.advanceTimersByTime(200);

    expect(bridge.frames).toHaveLength(0);
  });

  it('paces only complete 160-byte frames once the buffer is ready', () => {
    player.enqueue(Buffer.alloc(START_BUFFER_BYTES, 0x22));

    vi.advanceTimersByTime(100);

    expect(bridge.frames).toHaveLength(6);
    expect(bridge.frames.every((frame) => frame.length === FRAME_BYTES)).toBe(
      true,
    );
  });

  it('combines multiple small Gemini chunks into one continuous stream', () => {
    player.enqueue(Buffer.alloc(400, 0x33));
    player.enqueue(Buffer.alloc(400, 0x44));

    vi.advanceTimersByTime(200);
    expect(bridge.frames).toHaveLength(0);

    player.enqueue(Buffer.alloc(160, 0x55));
    vi.advanceTimersByTime(100);

    expect(bridge.frames).toHaveLength(6);
    expect(Buffer.concat(bridge.frames)).toEqual(
      Buffer.concat([
        Buffer.alloc(400, 0x33),
        Buffer.alloc(400, 0x44),
        Buffer.alloc(160, 0x55),
      ]),
    );
  });

  it('pads a final partial frame with mu-law silence on flush', () => {
    player.enqueue(Buffer.alloc(80, 0x66));
    player.flush();

    vi.advanceTimersByTime(20);

    expect(bridge.frames).toHaveLength(1);
    expect(bridge.frames[0]).toEqual(
      Buffer.concat([Buffer.alloc(80, 0x66), Buffer.alloc(80, 0xff)]),
    );
  });

  it('clears buffered audio and timers on cancel', () => {
    player.enqueue(Buffer.alloc(START_BUFFER_BYTES, 0x77));
    player.cancel();

    vi.advanceTimersByTime(200);

    expect(bridge.frames).toHaveLength(0);
    expect(player.isPlaying()).toBe(false);
  });
});
