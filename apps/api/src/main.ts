import 'dotenv/config';
import { createApp } from './app.js';
import { connectAri } from './realtime/ari-client.js';
import { startCampaignWorker } from './modules/campaign/campaign.queue.js';

const PORT = process.env.PORT || 4000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

// Connect to Asterisk in the background — failures are logged but don't
// crash the API. Tests don't run main.ts so this only fires in dev/prod.
connectAri();
startCampaignWorker();

// Warm the RAG embedding model so the first real call doesn't eat the
// 20–30s SentenceTransformer load. Best-effort, non-blocking.
(async () => {
  const ragUrl = process.env.RAG_SERVICE_URL;
  if (!ragUrl) return;
  try {
    await fetch(`${ragUrl}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'warmup',
        organization_id: '__warmup__',
        top_k: 1,
      }),
    });
    console.log('[rag] embedding model warmed');
  } catch {
    // RAG not running yet is fine — first real call will pay the cost.
  }
})();
