import type { ReactNode } from "react";
import Link from "next/link";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-svh flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-8 sm:px-12 pt-8 pb-5 text-center">
            <Link href="/" className="font-display text-3xl tracking-wide">
              <span className="text-[var(--crate-red)]">CRATE</span> LINK
            </Link>
            <h1 className="mt-4 text-xl font-semibold">{title}</h1>
            <p className="text-xs text-[var(--ink-soft)] mt-1">Last updated {updated}</p>
          </div>
          <div className="tear-line mx-10" />
          <div className="px-8 sm:px-12 py-8 prose-legal">{children}</div>
        </div>
        <p className="text-center mt-6">
          <Link href="/" className="text-xs text-[var(--ink-soft)] underline">
            Back to Crate Link
          </Link>
        </p>
      </div>
    </main>
  );
}
