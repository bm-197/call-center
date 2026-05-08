const RAG_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:4003';

export type KbChunk = {
  chunk_id: string;
  source_id: string;
  source_name: string;
  content: string;
  similarity: number;
};

type QueryOptions = {
  query: string;
  organizationId: string;
  agentId?: string;
  topK?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function queryKnowledgeBase(
  opts: QueryOptions,
): Promise<KbChunk[]> {
  // Hard cap: if RAG is slow (cold model warmup, network glitch) we'd
  // rather answer without KB context than stall the call. Caller can
  // override.
  const timeoutMs = opts.timeoutMs ?? 2500;
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);
  // Combine caller's signal with our timeout so either can abort.
  const combined = opts.signal
    ? AbortSignal.any([opts.signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;

  try {
    const res = await fetch(`${RAG_URL}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: opts.query,
        organization_id: opts.organizationId,
        agent_id: opts.agentId,
        top_k: opts.topK ?? 4,
      }),
      signal: combined,
    });
    if (!res.ok) {
      console.warn(`[kb] RAG /query ${res.status} ${res.statusText}`);
      return [];
    }
    return (await res.json()) as KbChunk[];
  } catch (err) {
    if (timeoutCtrl.signal.aborted) {
      console.warn(
        `[kb] query timed out after ${timeoutMs}ms — proceeding without KB context`,
      );
    } else if ((err as { name?: string }).name !== 'AbortError') {
      console.warn('[kb] query failed:', err);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function formatChunksForPrompt(chunks: KbChunk[]): string {
  if (chunks.length === 0) return '';
  return chunks
    .map((c, i) => `[${i + 1}] (${c.source_name})\n${c.content}`)
    .join('\n\n');
}
