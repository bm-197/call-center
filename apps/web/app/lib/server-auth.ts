import { headers } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export type ServerSession = {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    emailVerified: boolean;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: string;
    activeOrganizationId: string | null;
  };
};

export async function getServerSession(): Promise<ServerSession | null> {
  const h = await headers();
  const cookie = h.get('cookie');
  if (!cookie) return null;

  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie },
    cache: 'no-store',
  });

  if (!res.ok) return null;
  const data = (await res.json()) as ServerSession | null;
  return data?.user ? data : null;
}

export type ActiveOrganization = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
};

export async function getActiveOrganization(): Promise<ActiveOrganization | null> {
  const h = await headers();
  const cookie = h.get('cookie');
  if (!cookie) return null;

  const res = await fetch(
    `${API_URL}/api/auth/organization/get-full-organization`,
    {
      headers: { cookie },
      cache: 'no-store',
    },
  );

  if (!res.ok) return null;
  const data = (await res.json()) as ActiveOrganization | null;
  return data?.id ? data : null;
}

export async function listOrganizations(): Promise<ActiveOrganization[]> {
  const h = await headers();
  const cookie = h.get('cookie');
  if (!cookie) return [];

  const res = await fetch(`${API_URL}/api/auth/organization/list`, {
    headers: { cookie },
    cache: 'no-store',
  });

  if (!res.ok) return [];
  const data = (await res.json()) as ActiveOrganization[] | null;
  return Array.isArray(data) ? data : [];
}
