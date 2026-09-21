"use client";

import { useEffect, useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";

interface Ev { id: string; region: string | null; location: string | null; isOnline: boolean; status: string; }
type Feature = { geometry: { type: string; coordinates: number[][][] | number[][][][] } };
type Geo = { features: Feature[] };

/* City coordinates [lng, lat] — matched as a case-insensitive substring of location */
const CITY: [string, number, number][] = [
  ["Amsterdam", 4.90, 52.37], ["Utrecht", 5.12, 52.09], ["Eindhoven", 5.48, 51.44],
  ["Nieuwegein", 5.08, 52.03], ["Rotterdam", 4.48, 51.92], ["The Hague", 4.30, 52.08],
  ["London", -0.13, 51.51], ["Manchester", -2.24, 53.48], ["Birmingham", -1.90, 52.48],
  ["Edinburgh", -3.19, 55.95], ["Southampton", -1.40, 50.90],
  ["Berlin", 13.40, 52.52], ["Munich", 11.58, 48.14], ["Frankfurt", 8.68, 50.11],
  ["Potsdam", 13.06, 52.40], ["Brühl", 6.90, 50.83], ["Hamburg", 9.99, 53.55], ["Cologne", 6.96, 50.94],
  ["Brussels", 4.35, 50.85], ["Paris", 2.35, 48.86], ["Barcelona", 2.17, 41.39], ["Madrid", -3.70, 40.42],
  ["Lisbon", -9.14, 38.72], ["Porto", -8.61, 41.15], ["Athens", 23.73, 37.98],
  ["Dublin", -6.26, 53.35], ["Kildare", -6.91, 53.16], ["Vienna", 16.37, 48.21],
  ["Zurich", 8.54, 47.37], ["Prague", 14.42, 50.08], ["Krakow", 19.94, 50.06], ["Vilnius", 25.28, 54.69],
  ["Stockholm", 18.07, 59.33], ["Helsinki", 24.94, 60.17], ["Copenhagen", 12.57, 55.68],
  ["Oslo", 10.75, 59.91], ["Luxembourg", 6.13, 49.61], ["St. Julian", 14.49, 35.92],
  ["Dubai", 55.27, 25.20], ["Abu Dhabi", 54.37, 24.45], ["Marrakesh", -7.98, 31.63], ["Cape Town", 18.42, -33.92],
  ["Austin", -97.74, 30.27], ["Dallas", -96.80, 32.78], ["San Francisco", -122.42, 37.77],
  ["Santa Clara", -121.95, 37.35], ["Las Vegas", -115.14, 36.17], ["New York", -74.01, 40.71],
  ["Atlanta", -84.39, 33.75], ["Charlotte", -80.84, 35.23], ["Raleigh", -78.64, 35.78],
  ["Orlando", -81.38, 28.54], ["Tampa", -82.46, 27.95], ["Nashville", -86.78, 36.16],
  ["Denver", -104.99, 39.74], ["Salt Lake City", -111.89, 40.76], ["St. Charles", -90.20, 38.63],
  ["Toronto", -79.38, 43.65], ["Singapore", 103.82, 1.35],
];
/* Country fallback (matched after cities) */
const COUNTRY: [string, number, number][] = [
  ["Netherlands", 5.29, 52.13], ["United Kingdom", -1.5, 52.5], ["Germany", 10.45, 51.17],
  ["Belgium", 4.47, 50.5], ["France", 2.21, 46.6], ["Ireland", -8.24, 53.41],
  ["Portugal", -8.0, 39.5], ["Spain", -3.7, 40.4], ["Switzerland", 8.23, 46.8],
  ["Austria", 14.55, 47.52], ["Italy", 12.57, 41.87], ["Sweden", 18.64, 60.13],
  ["Finland", 25.75, 61.92], ["Denmark", 9.5, 56.26], ["Norway", 8.47, 60.47],
  ["UAE", 54.0, 24.0], ["Canada", -106.3, 56.1], ["Poland", 19.15, 51.92],
  ["Czech", 15.47, 49.82], ["Greece", 21.82, 39.07], ["Malta", 14.4, 35.9],
  ["Lithuania", 23.88, 55.17], ["South Africa", 22.94, -30.56], ["Morocco", -7.09, 31.79],
  ["United States", -98.5, 39.8], ["USA", -98.5, 39.8],
];
const REGION_FALLBACK: Record<string, [number, number]> = {
  "North America": [-98.5, 39.8], "UK": [-1.5, 52.5], "Europe": [9.5, 50.5],
  "Middle East": [50.0, 25.0], "Africa": [20.0, 0.0], "Asia Pacific": [110.0, 10.0],
};

/* Equirectangular projection into a 360×180 canvas */
const px = (lng: number) => lng + 180;
const py = (lat: number) => 90 - lat;

function resolve(ev: Ev): { label: string; lng: number; lat: number } | "online" | null {
  if (ev.isOnline || ev.region === "Online") return "online";
  const loc = (ev.location ?? "").toLowerCase();
  if (loc) {
    for (const [name, lng, lat] of CITY) if (loc.includes(name.toLowerCase())) return { label: name, lng, lat };
    for (const [name, lng, lat] of COUNTRY) if (loc.includes(name.toLowerCase())) return { label: name, lng, lat };
  }
  const rf = ev.region ? REGION_FALLBACK[ev.region] : undefined;
  if (rf) return { label: ev.region!, lng: rf[0], lat: rf[1] };
  return null;
}

function geomToPath(g: Feature["geometry"]): string {
  const ring = (r: number[][]) => r.map((c, i) => `${i ? "L" : "M"}${px(c[0]).toFixed(1)} ${py(c[1]).toFixed(1)}`).join(" ") + "Z";
  if (g.type === "Polygon") return (g.coordinates as number[][][]).map(ring).join(" ");
  if (g.type === "MultiPolygon") return (g.coordinates as number[][][][]).flatMap((poly) => poly.map(ring)).join(" ");
  return "";
}

export default function MapPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeRejected] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/events?view=map").then((r) => r.json()),
      fetch("/world.geojson").then((r) => r.json()),
    ]).then(([evs, g]: [Ev[], Geo]) => {
      setEvents(Array.isArray(evs) ? evs : []);
      setGeo(g);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const { bubbles, online, unmapped, total } = useMemo(() => {
    const agg = new Map<string, { label: string; lng: number; lat: number; count: number }>();
    let online = 0, unmapped = 0;
    const evs = events.filter((e) => includeRejected || e.status !== "REJECTED");
    for (const e of evs) {
      const r = resolve(e);
      if (r === "online") { online++; continue; }
      if (r === null) { unmapped++; continue; }
      const key = r.label;
      const cur = agg.get(key) ?? { label: r.label, lng: r.lng, lat: r.lat, count: 0 };
      cur.count++; agg.set(key, cur);
    }
    const bubbles = [...agg.values()].sort((a, b) => b.count - a.count);
    return { bubbles, online, unmapped, total: evs.length };
  }, [events, includeRejected]);

  const maxCount = Math.max(1, ...bubbles.map((b) => b.count));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-white">Event map</h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30 mt-1">
          {total} events by location · numbers = events per place
        </p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: "On map", value: total - online - unmapped, color: BRAND.cyan },
          { label: "Online / Global", value: online, color: BRAND.green },
          { label: "Location TBD", value: unmapped, color: BRAND.purple },
        ].map((c) => (
          <div key={c.label} className="bg-coder-panel border border-white/[0.08] rounded-lg px-3 py-2">
            <span className="font-mono text-lg font-bold" style={{ color: c.color }}>{c.value}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30 ml-2">{c.label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/20 py-16 text-center">Loading map…</p>
      ) : (
        <div className="grid lg:grid-cols-[1fr_220px] gap-4">
          {/* Map */}
          <div className="bg-coder-surface border border-white/[0.08] rounded-xl p-2 overflow-hidden">
            <svg viewBox="0 15 360 140" className="w-full h-auto" style={{ display: "block" }}>
              <rect x="0" y="15" width="360" height="140" fill={BRAND.sunken} />
              {geo?.features.map((f, i) => (
                <path key={i} d={geomToPath(f.geometry)} fill="#171B1C" stroke="#242829" strokeWidth={0.2} />
              ))}
              {bubbles.map((b) => {
                const r = 2.2 + Math.sqrt(b.count) * 1.5;
                const active = hover === b.label;
                return (
                  <g key={b.label} onMouseEnter={() => setHover(b.label)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
                    <circle cx={px(b.lng)} cy={py(b.lat)} r={Math.min(r, 11)}
                      fill={active ? BRAND.cyan : BRAND.purple} fillOpacity={active ? 0.9 : 0.35}
                      stroke={active ? BRAND.cyan : BRAND.purple} strokeWidth={0.4} />
                    <text x={px(b.lng)} y={py(b.lat)} textAnchor="middle" dominantBaseline="central"
                      fontSize={Math.max(3.2, Math.min(5.5, r * 0.85))} fontWeight="700"
                      fill="#ffffff" style={{ pointerEvents: "none", fontFamily: "monospace" }}>{b.count}</text>
                    {active && (
                      <text x={px(b.lng)} y={py(b.lat) - Math.min(r, 11) - 2} textAnchor="middle"
                        fontSize={4} fill="#fff" style={{ pointerEvents: "none", fontFamily: "monospace" }}>
                        {b.label} · {b.count}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Ranked list */}
          <div className="bg-coder-panel border border-white/[0.08] rounded-xl p-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30 mb-2">By location</p>
            <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
              {bubbles.map((b) => (
                <div key={b.label}
                  onMouseEnter={() => setHover(b.label)} onMouseLeave={() => setHover(null)}
                  className={`flex items-center justify-between rounded px-2 py-1 ${hover === b.label ? "bg-coder-cyan/10" : ""}`}>
                  <span className="font-mono text-[11px] text-white/60 truncate">{b.label}</span>
                  <span className="font-mono text-[11px] font-bold text-coder-purple ml-2">{b.count}</span>
                </div>
              ))}
              {online > 0 && (
                <div className="flex items-center justify-between rounded px-2 py-1 border-t border-white/5 mt-1 pt-1.5">
                  <span className="font-mono text-[11px] text-white/40">Online / Global</span>
                  <span className="font-mono text-[11px] font-bold text-coder-green ml-2">{online}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
