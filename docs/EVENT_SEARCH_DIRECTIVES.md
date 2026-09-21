# Event Radar — Event & Speaker Search Directives

_Living playbook for discovering the **most** relevant events and speakers for Coder. Last tuned: 2026-08-13 (post extensive 30-pass sweep)._

> **Result of the extensive sweep (2026-08-13):** ran the full matrix of **6 geographies × 5 slices = 30 passes** plus capped speaker mining. Dataset grew to **603 events / 192 speakers / 88 partners**. Macro spread: North America 225 · Europe 203 · Online 86 · UK 80 · (Middle East/Africa/APAC/Other few). ~600 events auto-approved (non-vertical); genuine industry-verticals left in the inbox. See the in-app **Executive Summary** tab for the AI strategy read.

This file is the distilled, self-checked strategy behind `src/lib/discovery.ts` and `src/app/api/speakers/discover/route.ts`. Use it when adding new discovery focuses, tuning prompts, or running manual sweeps (`scripts/seed-discovery.mjs`, `scripts/seed-bayarea-deep.mjs`).

---

## 1. Who we search for (speaker profile)
Irmak Eyiceoglu — EMEA Partner Manager at Coder (AI devtools / self-hosted cloud development environments). First-time speaker building a track record.
- **Best-fit topics:** Sovereign AI, practical AI for non-technical founders/entrepreneurs, AI literacy, developer productivity, platform engineering.
- **Realistic speaking stage:** meetups, podcasts, workshops, small summits, founder/entrepreneur communities, Women-in-AI communities.
- **Attends (not speaks):** enterprise / analyst events (Gartner, IDC, Forrester) and partner events, in her Coder partner-manager role.

## 2. Tracks (every event gets one)
- **SPEAK** — a realistic personal speaking slot (open CFP / guest track). suggestedAction APPLY_TO_SPEAK / BOTH.
- **PARTICIPATE** — she'd go in her Coder role, Coder sponsors/exhibits, or the audience is customers & partners (coderRelevant, partner, enterprise/analyst).
- **ATTEND** — individual learning/networking, no Coder or speaking angle.

## 3. Geography model (macro region + city)
Always capture BOTH a **macro region** and a **city** (see `deriveGeo` in `src/lib/events.ts`).
- **Macro regions:** North America · UK · Europe · Middle East · Africa · Asia Pacific · Online · Other.
- **City** is the specific city (San Francisco, Amsterdam, Austin, London …). Never emit vague values like "USA" — resolve to the city, else the macro region.
- **Priority geographies:** Amsterdam/NL, London/UK, Rest of Europe (Belgium, Germany, Luxembourg, Nordics), Austin TX, **San Francisco Bay Area / Silicon Valley**, and Online.

## 4. What "most relevant" means — the winning search recipe
The single biggest lever is **depth via distinct slices**. One broad search under-delivers (a single Bay Area pass found 15; a 7-slice sweep found 71). For any priority geography, run these slices **separately** so results don't overlap and dedup does the rest:

1. **AI & developer conferences / summits** (big anchored events with dates).
2. **AI founder / entrepreneur meetups & communities** — meetup.com, Luma (lu.ma), Loop, Eventbrite; named communities (Cerebral Valley, AI Tinkerers, GenAI Collective, AGI House, South Park Commons, Techleap, StartupAmsterdam…).
3. **AI podcasts & webinars** seeking guests + AI-literacy workshops for non-technical founders. Include BrightTALK webinars (Coder-relevant + partner-hosted).
4. **Women in Tech / Women in AI** — communities, meetups, podcasts (guest slots), summits, awards.
5. **Developer / platform-engineering / devtools (Coder-relevant)** — PlatformCon, KubeCon/KCD, DevOpsDays, IDP/Backstage, CNCF meetups.
6. **Enterprise / analyst / vendor** — Gartner, IDC, Forrester (across EMEA, Austin, Bay Area, Online); AWS/Google/Microsoft regional summits; Dreamforce/Snowflake/Databricks.
7. **Startup / VC / demo-day & accelerator** — YC, Techstars, 500 Global, SaaStr, Startup Grind, Capital Factory (Austin).

Each slice: **9–10 distinct web searches**, ask for **20+** candidates, only events dated **after today** (or null for genuinely recurring meetups/podcasts).

## 5. Named sources to always mine
`meetup.com`, `lu.ma` (Luma), `Loop`, `Eventbrite`, `BrightTALK`, partner websites/newsrooms, partner LinkedIn, analyst-firm sites (Gartner/IDC/Forrester), and city tech-week programmes (SF Tech Week, London Tech Week, Austin Startup Week).

## 6. Coverage checklist per geography (self-check loop)
After a sweep, verify per priority region:
- [ ] ≥ 1 anchored dated **conference** in the next 12 months.
- [ ] ≥ 3 recurring **meetups / communities**.
- [ ] ≥ 1 **Women-in-AI** community/event.
- [ ] ≥ 1 **analyst** event (Gartner/IDC/Forrester) tagged ATTEND/PARTICIPATE.
- [ ] ≥ 1 **podcast** seeking guests.
If a box is empty, re-run that specific slice with sharper, month-by-month queries before moving on. (This is exactly how Bay Area went 15 → 71.)

## 7. Exclusions (keep the list clean)
- Skip **industry-vertical** events unless Coder-relevant or partner-hosted: healthcare, banking/fintech, insurance, legal, retail, manufacturing, energy/utilities, telecom, government/defense, edtech, automotive, real estate, agriculture, hospitality, logistics, mining, igaming.
- Skip pure cybersecurity/infosec, single-vendor user conferences, and academic ML conferences unless they explicitly teach AI to non-technical founders or are partner-hosted.
- Never keep **past-dated** events. Bulk-approve relevant DISCOVERED events; leave genuine verticals in the inbox for manual review.

## 8. Speaker discovery
Mine **CONFERENCE / EVENT / MEETUP** events (not webinars/podcasts) for announced/confirmed/past speakers via the event's official speakers page, agenda, and LinkedIn. Prioritise people who speak on AI / Sovereign AI / founders, or are frequent speakers. For each: title, company, LinkedIn URL (only if verified — else null), one-line background, topics, region, and a warm, specific, **non-asking** LinkedIn connection note (<280 chars, first person as Irmak). Batch ~6 events per pass to avoid LLM timeouts; dedup by name.

## 9. Cadence
- **Automated:** weekly cron (`vercel.json`, Mon 09:00 UTC) rotating through `AUTO_FOCUS_THEMES`.
- **Manual deep sweeps:** run the slice recipe (§4) for any under-covered region with `scripts/seed-discovery.mjs` (single brief) or `scripts/seed-bayarea-deep.mjs` (multi-slice template).
- After discovery, run **speaker discovery** on the newly added dated events.

## 10. Data hygiene
- Every event: macro region + city + track (ATTEND/PARTICIPATE/SPEAK) + relevancy score.
- Export anytime with `scripts/export-data.mjs` → `exports/` (JSON + CSV for events, speakers, partners).
