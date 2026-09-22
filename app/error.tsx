"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-6 text-center">
            <p className="font-display text-3xl tracking-wide">
              <span className="text-[var(--crate-red)]">CRATE</span> LINK
            </p>
          </div>
          <div className="tear-line mx-8" />
          <div className="px-6 sm:px-8 py-10 text-center">
            <p className="font-display text-2xl text-[var(--crate-red)]">PAGE UNAVAILABLE</p>
            <p className="text-sm text-[var(--ink-soft)] mt-2">
              Something went wrong on our end. Nothing you did caused this.
            </p>
            <button
              onClick={reset}
              className="mt-6 rounded-md bg-[var(--crate-red)] text-white font-medium px-6 py-2.5 text-sm hover:bg-[var(--crate-red-deep)] transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
