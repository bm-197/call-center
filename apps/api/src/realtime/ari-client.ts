/**
 * ARI WebSocket client.
 *
 * Connects to Asterisk on boot, registers our Stasis app (`call-center`),
 * and dispatches StasisStart / StasisEnd events to the conversation
 * orchestrator. Falls back to a no-op if ARI env vars are missing — that
 * keeps `apps/api` runnable without telephony for tests/CI.
 *
 * Reconnects on disconnect with exponential backoff.
 */

// @ts-expect-error — ari-client ships JS only, no types
import ari from 'ari-client';
import { initOrchestrator } from './conversation-orchestrator.js';

type AriClient = {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  start: (appName: string) => Promise<void>;
  removeAllListeners: () => void;
} & Record<string, unknown>;

let _client: AriClient | null = null;

export function getAriClient(): AriClient | null {
  return _client;
}

export async function connectAri(): Promise<void> {
  const url = process.env.ARI_URL;
  const username = process.env.ARI_USERNAME;
  const password = process.env.ARI_PASSWORD;
  const appName = process.env.ARI_APP_NAME ?? 'call-center';

  if (!url || !username || !password) {
    console.log(
      '[ari] not configured (set ARI_URL, ARI_USERNAME, ARI_PASSWORD); telephony disabled',
    );
    return;
  }

  let backoff = 1000;
  const MAX_BACKOFF = 30_000;

  async function attempt(): Promise<void> {
    try {
      const client = (await ari.connect(url, username, password)) as AriClient;
      _client = client;
      console.log(`[ari] connected to ${url}, registering app "${appName}"`);

      // ari-client is JS-only; both modules cast to their own structural
      // shape since neither describes the full surface.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initOrchestrator(client as any, appName);

      client.on('WebSocketConnected', () => {
        console.log('[ari] websocket connected');
        backoff = 1000;
      });

      client.on('WebSocketReconnecting', () => {
        console.log('[ari] websocket reconnecting…');
      });

      client.on('APILoadError', (err: unknown) => {
        console.error('[ari] API load error:', err);
      });

      await client.start(appName);
      console.log(`[ari] Stasis app "${appName}" registered. Ready for calls.`);
    } catch (err) {
      console.error(
        `[ari] connect failed (${err instanceof Error ? err.message : err}); retry in ${backoff}ms`,
      );
      _client = null;
      setTimeout(() => {
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
        attempt();
      }, backoff);
    }
  }

  await attempt();
}
