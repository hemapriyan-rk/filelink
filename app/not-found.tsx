import Link from "next/link";

export default function NotFound() {
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
              There&apos;s nothing at this address.
            </p>
            <Link
              href="/"
              className="inline-block mt-6 text-sm font-medium text-[var(--crate-red)] underline"
            >
              Go to Crate Link
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
