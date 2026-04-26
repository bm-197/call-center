'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { organization } from '@/lib/auth-client';

export function ResolveActiveOrg({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      await organization.setActive({ organizationId });
      router.refresh();
    })();
  }, [organizationId, router]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground text-sm">Preparing workspace…</div>
    </div>
  );
}
