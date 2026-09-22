"use client";

import { useEffect, useState } from "react";
import { getStoredConsent, setStoredConsent } from "@/lib/consent";

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // localStorage doesn't exist during SSR, so the server-rendered markup
    // (and the first client render, to avoid a hydration mismatch) must
    // start hidden; this effect bridges in the real browser-only state
    // right after mount, which is exactly what an effect is for here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(getStoredConsent() === null);
  }, []);

  if (!visible) return null;

  function choose(value: "accepted" | "declined") {
    setStoredConsent(value);
    setVisible(false);
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--line)] bg-[var(--paper)]/95 backdrop-blur px-4 py-3">
      <div className="max-w-xl mx-auto flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
        <p className="text-xs text-[var(--ink-soft)] flex-1">
          Crate Link can keep your last share link visible in this browser tab if you switch
          away and come back, using temporary local storage — never sent to any server, cleared
          when you close the tab.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => choose("declined")}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium hover:border-[var(--crate-red)] transition-colors"
          >
            No thanks
          </button>
          <button
            onClick={() => choose("accepted")}
            className="rounded-md bg-[var(--crate-red)] text-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--crate-red-deep)] transition-colors"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
