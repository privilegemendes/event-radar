"use client";

import ProfileSettings from "@/components/ProfileSettings";

/**
 * A speaker's own profile and brief.
 *
 * Its own page, and open to every signed-in speaker rather than admins only.
 * These fields used to live on /settings next to the work calendar and the user
 * list — both genuinely admin-only — which meant a MEMBER could not reach their
 * own brief at all, and per-speaker scoring had nothing to score against.
 */
export default function ProfilePage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Profile</h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">
          Your details, and the brief that steers your events
        </p>
      </div>
      <ProfileSettings />
    </div>
  );
}
