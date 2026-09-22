"use client";

import { useState } from "react";
import { CountdownTimer } from "./CountdownTimer";

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
      <div>
        <p className="font-medium">Link Expired</p>
        <p className="text-sm text-neutral-400 mt-1">This file is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <CountdownTimer expiresAt={expiresAt} isPermanent={isPermanent} onExpire={() => setExpired(true)} />
      <a
        href={`/api/download/${token}`}
        className="rounded-md bg-white text-black font-medium px-6 py-2.5 hover:bg-neutral-200 transition"
      >
        Download File
      </a>
    </div>
  );
}
