"use client";

import EventBrowser from "@/components/EventBrowser";

/**
 * Search and browse every event in the catalogue.
 *
 * Its own page as of this change; it used to be the bottom half of the
 * Overview, under the next-7-days strip.
 */
export default function EventsPage() {
  return (
    <div className="max-w-7xl mx-auto">
      {/* No "+ New Event" here: the filter bar inside EventBrowser already
          carries one, and two on a page is worse than the wrong placement. */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Events</h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">
          Search and filter the whole catalogue
        </p>
      </div>
      <EventBrowser />
    </div>
  );
}
