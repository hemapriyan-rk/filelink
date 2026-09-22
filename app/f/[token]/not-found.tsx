import Link from "next/link";
import { TicketMessage } from "@/components/TicketMessage";

export default function TokenNotFound() {
  return (
    <TicketMessage heading="LINK EXPIRED">
      <p className="text-sm text-[var(--ink-soft)] mt-2">
        This file is no longer available. It may have expired, hit its download limit, or never
        existed.
      </p>
      <Link
        href="/"
        className="inline-block mt-6 text-sm font-medium text-[var(--crate-red)] underline"
      >
        Send your own file
      </Link>
    </TicketMessage>
  );
}
