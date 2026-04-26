import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Forward all /api/* calls from the web origin to the Express backend so
// cookies stay first-party and we avoid CORS in the browser.
export default function proxy(request: NextRequest) {
  const url = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    API_URL,
  );
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/api/:path*'],
};
