import { EventEmitter } from 'node:events';
import speech from '@google-cloud/speech';

const STREAMING_LIMIT_MS = 4 * 60 * 1000;
// If no new interim arrives for this long after we've started seeing
// speech, treat the latest interim as final. Compensates for am-ET's
// server-side VAD that often fails to mark isFinal in noisy phone audio.
const SILENCE_TIMEOUT_MS = 1200;

// v2 Chirp 2 needs a regional endpoint, not the global one. us-central1
// is the safest pick for am-ET coverage.
const STT_LOCATION = process.env.STT_LOCATION ?? 'us-central1';
const STT_PROJECT =
  process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';

type StartOptions = {
  languageCode: string;
};

export class SttStream extends EventEmitter {
  private client = new speech.v2.SpeechClient({
    apiEndpoint: `${STT_LOCATION}-speech.googleapis.com`,
  });
  private recognizeStream: ReturnType<
    InstanceType<typeof speech.v2.SpeechClient>['_streamingRecognize']
  > | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private silenceTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private lastInterim = '';
  private lastFinal = '';
  private streamDead: () => boolean = () => true;

  constructor(private readonly opts: StartOptions) {
    super();
  }

  async start(): Promise<void> {
    await this.openStream();
    this.restartTimer = setTimeout(() => {
      if (this.closed) return;
      this.closeStream();
      void this.openStream();
    }, STREAMING_LIMIT_MS);
  }

  write(chunk: Buffer): void {
    if (this.closed || !this.recognizeStream || this.streamDead()) return;
    try {
      // v2 streaming uses { audio: Buffer } as the per-chunk message.
      this.recognizeStream.write({ audio: chunk });
    } catch {
      // Stream destroyed mid-flight; error already surfaced via 'error'.
    }
  }

  close(): void {
    if (this.closed) return;
    this.emitLastInterimAsFinal();
    this.closed = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.clearSilenceTimer();
    this.closeStream();
  }

  private async resolveProjectId(): Promise<string> {
    if (STT_PROJECT) return STT_PROJECT;
    const id = await this.client.getProjectId();
    return id;
  }

  private async openStream(): Promise<void> {
    const projectId = await this.resolveProjectId();
    const recognizerPath = `projects/${projectId}/locations/${STT_LOCATION}/recognizers/_`;

    const stream = this.client._streamingRecognize();

    // v2 has no built-in "config-as-first-message" helper — we have to
    // write the streaming config message ourselves before any audio.
    stream.write({
      recognizer: recognizerPath,
      streamingConfig: {
        config: {
          explicitDecodingConfig: {
            encoding: 'MULAW',
            sampleRateHertz: 8000,
            audioChannelCount: 1,
          },
          languageCodes: [this.opts.languageCode],
          // chirp_2 is multilingual and dramatically better than v1 am-ET
          // for narrowband phone audio.
          model: 'chirp_2',
          features: {
            enableAutomaticPunctuation: true,
          },
        },
        streamingFeatures: {
          interimResults: true,
          enableVoiceActivityEvents: true,
        },
      },
    });

    let dead = false;

    stream.on('data', (data) => {
      const result = data.results?.[0];
      if (!result) {
        if (data.speechEventType) {
          console.log(`[stt] event: ${data.speechEventType}`);
        }
        return;
      }
      const transcript = result.alternatives?.[0]?.transcript ?? '';
      if (!transcript) return;
      console.log(
        `[stt] ${result.isFinal ? 'FINAL' : 'interim'}: ${transcript}`,
      );
      if (result.isFinal) {
        this.clearSilenceTimer();
        this.lastInterim = '';
        this.emitFinal(transcript.trim());
      } else if (transcript !== this.lastInterim) {
        this.lastInterim = transcript;
        this.emit('interim', transcript.trim());
        this.armSilenceTimer();
      }
    });

    stream.on('error', (err) => {
      dead = true;
      if (this.closed) return;
      this.emit('error', err);
    });

    stream.on('close', () => {
      dead = true;
    });

    this.recognizeStream = stream;
    this.streamDead = () => dead;
  }

  private closeStream(): void {
    if (!this.recognizeStream) return;
    try {
      this.recognizeStream.end();
    } catch {
      // ignore
    }
    this.recognizeStream = null;
  }

  private armSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      const text = this.lastInterim.trim();
      if (!text || this.closed) return;
      console.log(`[stt] silence timeout → forcing FINAL: ${text}`);
      this.lastInterim = '';
      this.emitFinal(text);
    }, SILENCE_TIMEOUT_MS);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private emitLastInterimAsFinal(): void {
    const text = this.lastInterim.trim();
    if (!text) return;
    this.lastInterim = '';
    this.emitFinal(text);
  }

  private emitFinal(text: string): void {
    if (text === this.lastFinal) return;
    this.lastFinal = text;
    this.emit('final', text);
  }
}
