"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * "Back" that returns to the list you came from.
 *
 * The event page had a hardcoded Link to "/", so opening an event from the
 * Inbox and pressing Back dropped you on the Overview. Every list in the app
 * has that problem — Inbox, Events, Calendar, Map, Coder Events, Podium all
 * link into the same detail page.
 *
 * Rather than thread a ?from= parameter through all eleven call sites, where
 * one missed link silently keeps the old behaviour, the last list page is
 * recorded centrally and read here. `useRouter().back()` was the other
 * candidate and is worse: on a refresh or a shared link there is no history
 * entry, and history.back() then does nothing at all — a dead button, which is
 * more confusing than going somewhere.
 *
 * sessionStorage, not localStorage: "where I was" is per tab, and two tabs on
 * different lists must not overwrite each other. Reads and writes are wrapped
 * because a private window or blocked site data makes them throw.
 */

const KEY = "eventRadar:lastListPath";

/** Paths that are destinations rather than lists worth returning to. */
function isDetailPath(path: string): boolean {
  return /^\/events\/[^/]+$/.test(path) || path === "/events/new";
}

/** Record the current path when it is a list. Mounted once, in the layout. */
export function TrackLastList() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || isDetailPath(pathname)) return;
    try { sessionStorage.setItem(KEY, pathname); } catch { /* private window */ }
  }, [pathname]);
  return null;
}

export default function BackLink({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();

  const goBack = () => {
    let target = fallback;
    try {
      const stored = sessionStorage.getItem(KEY);
      // Only same-origin app paths; never trust it into an off-site redirect.
      if (stored && stored.startsWith("/") && !stored.startsWith("//")) target = stored;
    } catch { /* fall through to the fallback */ }
    router.push(target);
  };

  return (
    <button
      onClick={goBack}
      className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/30 hover:text-coder-purple transition-colors"
    >
      ← Back
    </button>
  );
}
