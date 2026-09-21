"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/* ── Inline SVG nav icons ── */
const IconOverview = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="6" height="6" rx="1.2"/>
    <rect x="9" y="1" width="6" height="6" rx="1.2"/>
    <rect x="1" y="9" width="6" height="6" rx="1.2"/>
    <rect x="9" y="9" width="6" height="6" rx="1.2"/>
  </svg>
);
const IconGigs = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="10" r="4"/>
    <path d="M12 14v4M8 20h8M6 6.5C4.8 8 4 9.9 4 12M18 6.5c1.2 1.5 2 3.4 2 5.5"/>
  </svg>
);
const IconCalendar = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="1" y="2.5" width="14" height="12" rx="1.5"/>
    <path d="M1 6.5h14"/>
    <path d="M5 1v3M11 1v3"/>
    <circle cx="5" cy="10" r="0.75" fill="currentColor" stroke="none"/>
    <circle cx="8" cy="10" r="0.75" fill="currentColor" stroke="none"/>
    <circle cx="11" cy="10" r="0.75" fill="currentColor" stroke="none"/>
  </svg>
);
const IconInbox = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 10h3.25L6 12h4l1.25-2H14.5"/>
    <path d="M1.5 10V13.5a.5.5 0 00.5.5h12a.5.5 0 00.5-.5V10"/>
    <path d="M3 10L5 2h6l2 8"/>
  </svg>
);
const IconPartners = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="5.5" cy="4.5" r="2.5"/>
    <path d="M1 13.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5"/>
    <circle cx="12" cy="5" r="2"/>
    <path d="M15 13.5c0-2.21-1.343-4-3-4"/>
  </svg>
);
const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="2.5"/>
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.42 1.42M11.18 11.18l1.42 1.42M3.4 12.6l1.42-1.42M11.18 4.82l1.42-1.42"/>
  </svg>
);
const IconCoderEvents = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 4h14v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z"/>
    <path d="M1 4l7-3 7 3"/>
    <path d="M6 9h4M6 11.5h2.5"/>
  </svg>
);
const IconSpeakers = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="4.5" r="2.5"/>
    <path d="M8 7v3"/>
    <rect x="6" y="10" width="4" height="1.5" rx="0.75"/>
    <path d="M3.5 14c0-1.7 1.3-3 3-3M12.5 14c0-1.7-1.3-3-3-3"/>
  </svg>
);
const IconMap = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5"/>
    <path d="M1.5 8h13M8 1.5c1.8 1.8 2.8 4.1 2.8 6.5S9.8 12.7 8 14.5C6.2 12.7 5.2 10.4 5.2 8S6.2 3.3 8 1.5z"/>
  </svg>
);
const IconSummary = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="1.5" width="11" height="13" rx="1.5"/>
    <path d="M5 5h6M5 8h6M5 11h3.5"/>
  </svg>
);

const NAV_ITEMS = [
  { href: "/",          label: "Overview",  Icon: IconOverview  },
  { href: "/speakers",      label: "Speakers & Thought Leaders",     Icon: IconSpeakers     },
  { href: "/podiums",    label: "Podium", Icon: IconGigs      },
  { href: "/calendar",  label: "Calendar",  Icon: IconCalendar  },
  { href: "/map",       label: "Map",       Icon: IconMap       },
  { href: "/inbox",     label: "Inbox",     Icon: IconInbox     },
  { href: "/partners",      label: "Partners",     Icon: IconPartners     },
  { href: "/coder-events",  label: "Coder Events",  Icon: IconCoderEvents  },
  { href: "/executive-summary", label: "Executive Summary", Icon: IconSummary },
  { href: "/settings",      label: "Settings",      Icon: IconSettings     },
];

interface SidebarProps {
  role: "ADMIN" | "VIEWER";
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const [inboxCount,       setInboxCount]       = useState<number>(0);
  const [gigsCount,        setGigsCount]        = useState<number>(0);
  const [coderEventsCount, setCoderEventsCount] = useState<number>(0);
  const [isOwnerUser, setIsOwnerUser] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Identity: the Podium is owner-only.
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { isOwner?: boolean }) => setIsOwnerUser(!!d?.isOwner))
      .catch(() => setIsOwnerUser(false));
    // Badge counts — inbox (DISCOVERED), podium (ACCEPTED or attending) and
    // Coder Events (EMEA). Counted server-side: these are three integers, and
    // reading them from the full event list cost ~1.8 MB on every navigation.
    fetch("/api/events/counts")
      .then((r) => r.json())
      .then((d: { inbox?: number; gigs?: number; coderEvents?: number }) => {
        setInboxCount(d?.inbox ?? 0);
        setGigsCount(d?.gigs ?? 0);
        setCoderEventsCount(d?.coderEvents ?? 0);
      })
      .catch(() => {
        setInboxCount(0);
        setGigsCount(0);
        setCoderEventsCount(0);
      });
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const NavLinks = () => (
    <>
      {NAV_ITEMS
        .filter((it) => it.href !== "/settings" || role === "ADMIN")
        .filter((it) => it.href !== "/podiums" || isOwnerUser)
        .map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
              active
                ? "bg-coder-purple/15 text-coder-purple"
                : "text-white/40 hover:text-white/80 hover:bg-white/[0.04]"
            }`}
          >
            {/* Left accent bar */}
            <span
              className={`absolute left-0 w-0.5 h-5 rounded-r transition-opacity duration-150 bg-coder-purple ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
            <span className={`flex-shrink-0 transition-colors ${active ? "text-coder-purple" : ""}`}>
              <Icon />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] leading-none">
              {label}
            </span>
            {href === "/inbox" && inboxCount > 0 && (
              <span className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded bg-coder-purple text-black font-bold leading-none min-w-[18px] text-center">
                {inboxCount}
              </span>
            )}
            {href === "/podiums" && gigsCount > 0 && (
              <span className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded bg-coder-purple/20 text-coder-purple font-bold leading-none min-w-[18px] text-center">
                {gigsCount}
              </span>
            )}
            {href === "/coder-events" && coderEventsCount > 0 && (
              <span className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded bg-coder-purple/20 text-coder-purple font-bold leading-none min-w-[18px] text-center">
                {coderEventsCount}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );

  const SidebarHeader = () => (
    <div className="px-4 py-4 border-b border-white/[0.07]">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 flex-shrink-0">
          <Image src="/coder-logo.svg" alt="Coder" width={28} height={28} className="w-7 h-7" />
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-white leading-tight">
            Event Radar
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-white/30 leading-tight mt-0.5">
            Coder Internal
          </p>
        </div>
      </div>
      <span
        className={`font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${
          role === "ADMIN"
            ? "bg-coder-purple/15 text-coder-purple"
            : "bg-white/5 text-white/30"
        }`}
      >
        {role}
      </span>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-3.5 left-3.5 z-50 p-2 bg-coder-panel border border-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 4h12M2 8h12M2 12h12"/>
        </svg>
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-50 h-full w-60 bg-coder-surface border-r border-white/[0.07] transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarHeader />
        <nav className="relative p-3 space-y-0.5">
          <NavLinks />
        </nav>
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-white/20 italic">Everyone is a speaker</p>
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-coder-surface border-r border-white/[0.07] flex-shrink-0">
        <SidebarHeader />
        <nav className="relative flex-1 p-3 space-y-0.5 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-white/20 italic">Everyone is a speaker</p>
        </div>
      </aside>
    </>
  );
}
