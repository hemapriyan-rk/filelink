"use client";

import { useEffect } from "react";
import { TicketMessage } from "@/components/TicketMessage";

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
    <TicketMessage heading="PAGE UNAVAILABLE">
      <p className="text-sm text-[var(--ink-soft)] mt-2">
        Something went wrong on our end. Nothing you did caused this.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-[var(--crate-red)] text-white font-medium px-6 py-2.5 text-sm hover:bg-[var(--crate-red-deep)] transition-colors"
      >
        Try again
      </button>
    </TicketMessage>
  );
}
