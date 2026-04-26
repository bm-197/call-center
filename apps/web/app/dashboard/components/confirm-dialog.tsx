'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ConfirmConfig = {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
};

export function ConfirmDialog({
  config,
  onClose,
  onConfirm,
}: {
  config: ConfirmConfig | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialog
      open={config !== null}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{config?.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{config?.description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={cn(
              config?.destructive && buttonVariants({ variant: 'destructive' }),
            )}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Working…' : (config?.confirmLabel ?? 'Confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
