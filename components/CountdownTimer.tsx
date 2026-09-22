"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function CountdownTimer({
  expiresAt,
  isPermanent,
  onExpire,
}: {
  expiresAt: string | null;
  isPermanent: boolean;
  onExpire?: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (isPermanent || !expiresAt) return;

    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const diff = target - Date.now();
      setRemaining(diff);
      if (diff <= 0) onExpire?.();
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, isPermanent, onExpire]);

  if (isPermanent) {
    return <p className="text-sm font-data text-[var(--crate-red)]">Kept permanently</p>;
  }

  if (remaining === null) return null;

  return (
    <p
      className={`text-sm font-data ${
        remaining <= 0 ? "text-[var(--crate-red)]" : "text-[var(--ink-soft)]"
      }`}
    >
      {remaining <= 0 ? "Expired" : `Expires in ${formatRemaining(remaining)}`}
    </p>
  );
}
