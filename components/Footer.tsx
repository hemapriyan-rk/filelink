import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--line)] mt-auto">
      <div className="max-w-md mx-auto px-6 py-6 text-center">
        <p className="text-xs text-[var(--ink-soft)] leading-relaxed">
          Files are shared entirely at the sender&apos;s and recipient&apos;s own risk. Crate
          Link does not review, endorse, or guarantee the availability of anything uploaded, and
          is not liable for its content or use.
        </p>
        <p className="mt-3 text-xs text-[var(--ink-soft)] flex items-center justify-center gap-3">
          <Link href="/terms" className="underline hover:text-[var(--crate-red)]">
            Terms
          </Link>
          <Link href="/privacy" className="underline hover:text-[var(--crate-red)]">
            Privacy
          </Link>
        </p>
        <p className="mt-2 text-xs text-[var(--ink-soft)]">
          © {year} Hemapriyan RK. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
