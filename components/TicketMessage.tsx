import type { ReactNode } from "react";

/**
 * Shared "ticket" shell for status pages (expired link, 404, runtime
 * error) — same wordmark stub + tear-line + centered message frame used
 * everywhere else, so these three pages stay visually identical by
 * construction instead of by copy-pasted className strings.
 */
export function TicketMessage({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-svh flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-8 sm:px-12 pt-8 pb-5 text-center">
            <p className="font-display text-4xl tracking-wide">
              <span className="text-[var(--crate-red)]">CRATE</span> LINK
            </p>
          </div>
          <div className="tear-line mx-10" />
          <div className="px-8 sm:px-12 py-10 text-center max-w-xs mx-auto">
            <p className="font-display text-2xl text-[var(--crate-red)]">{heading}</p>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
