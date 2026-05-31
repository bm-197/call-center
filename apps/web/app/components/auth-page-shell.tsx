'use client';

import Link from 'next/link';

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="text-foreground relative isolate min-h-screen overflow-hidden bg-white">
      <AuthBackdrop />
      <header className="absolute inset-x-0 top-0 z-20 h-[74px] border-foreground/10 border-b bg-white/45 backdrop-blur-[2px]">
        <div className="flex h-full w-full items-center px-6 md:px-[8.75vw]">
          <Link
            href="/"
            className="text-[23px] font-black tracking-[-0.08em] text-foreground"
          >
            Call Center
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1220px] items-center justify-center px-5 py-28 sm:px-8">
        <div className="w-full max-w-[520px]">{children}</div>
      </div>
    </main>
  );
}

function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-white" />
      <div className="absolute top-[74px] bottom-0 left-[7.8%] w-px bg-foreground/10" />
      <div className="absolute top-[74px] right-[7.8%] bottom-0 w-px bg-foreground/10" />
      <div className="absolute inset-x-0 top-[74px] h-px bg-foreground/8" />
      <div className="absolute inset-x-0 top-[74px] h-36 bg-gradient-to-b from-white/80 to-transparent" />
    </div>
  );
}
