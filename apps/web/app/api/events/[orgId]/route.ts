const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = {
  params: Promise<{
    orgId: string;
  }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { orgId } = await params;
  if (!orgId) {
    return new Response('Missing organization id', { status: 400 });
  }

  const upstreamUrl = new URL(
    `/api/events/${encodeURIComponent(orgId)}`,
    API_URL,
  );

  const cookie = request.headers.get('cookie');
  const userAgent = request.headers.get('user-agent');

  const upstream = await fetch(upstreamUrl, {
    cache: 'no-store',
    headers: {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(userAgent ? { 'User-Agent': userAgent } : {}),
    },
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const message = await upstream.text().catch(() => upstream.statusText);
    return new Response(message || upstream.statusText, {
      status: upstream.status,
      headers: {
        'Content-Type':
          upstream.headers.get('Content-Type') ?? 'text/plain; charset=utf-8',
      },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
