"use client";

import { useState } from "react";
import { CountdownTimer } from "./CountdownTimer";
import { StatsToggle } from "./StatsToggle";

export function DownloadPanel({
  token,
  expiresAt,
  isPermanent,
}: {
  token: string;
  expiresAt: string | null;
  isPermanent: boolean;
}) {
  const [expired, setExpired] = useState(false);

  if (expired) {
    return (
      <div className="text-center">
        <p className="font-display text-2xl text-[var(--crate-red)]">LINK EXPIRED</p>
        <p className="text-sm text-[var(--ink-soft)] mt-1">This file is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <CountdownTimer
        expiresAt={expiresAt}
        isPermanent={isPermanent}
        onExpire={() => setExpired(true)}
      />
      <a
        href={`/api/download/${token}`}
        className="w-full text-center rounded-md bg-[var(--crate-red)] text-white font-medium px-6 py-3 hover:bg-[var(--crate-red-deep)] transition-colors"
      >
        Download file
      </a>
      <StatsToggle token={token} />
    </div>
  );
}
