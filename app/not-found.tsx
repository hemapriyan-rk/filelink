import Link from "next/link";
import { TicketMessage } from "@/components/TicketMessage";

export default function NotFound() {
  return (
    <TicketMessage heading="PAGE UNAVAILABLE">
      <p className="text-sm text-[var(--ink-soft)] mt-2">There&apos;s nothing at this address.</p>
      <Link
        href="/"
        className="inline-block mt-6 text-sm font-medium text-[var(--crate-red)] underline"
      >
        Go to Crate Link
      </Link>
    </TicketMessage>
  );
}
