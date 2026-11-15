"use client";
import { useEffect, useMemo, useState } from "react";
import { api, fmt } from "@/lib/api";

// Choropleth of failed batches by the manufacturer's state. Click a state to filter.
const ALIAS: Record<string, string[]> = {
  "dadra and nagar haveli": ["dadra and nagar haveli and daman and diu", "dadra & nagar haveli"],
  "daman and diu": ["dadra and nagar haveli and daman and diu", "daman & diu"],
  "jammu and kashmir": ["jammu & kashmir", "ladakh"],
  "odisha": ["orissa"], "puducherry": ["pondicherry"], "telangana": ["telengana"], "uttarakhand": ["uttaranchal"],
  "delhi": ["nct of delhi", "new delhi"],
};
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();

export default function IndiaMap({ picked, onPick }: { picked?: string; onPick: (state: string) => void }) {
  const [shape, setShape] = useState<any>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);

  useEffect(() => {
    fetch("/india-states.json").then((r) => r.json()).then(setShape).catch(() => {});
    api("/api/states").then((d) => setRows(d.items)).catch(() => setRows([]));
  }, []);

  // state on the map -> our data (some states have older or merged names in the CDSCO lists)
  const byMap = useMemo(() => {
    const idx = new Map((rows || []).map((r) => [norm(r.state), r]));
    const out: Record<string, { count: number; high: number; companies: number; dbName: string }> = {};
    for (const loc of shape?.locations || []) {
      const keys = [norm(loc.name), ...(ALIAS[norm(loc.name)] || [])];
      const hit = keys.map((k) => idx.get(k)).filter(Boolean) as any[];
      if (hit.length) out[loc.name] = { count: hit.reduce((a, r) => a + r.count, 0), high: hit.reduce((a, r) => a + r.high, 0),
        companies: hit.reduce((a, r) => a + r.companies, 0), dbName: hit[0].state };
    }
    return out;
  }, [shape, rows]);

  const max = Math.max(1, ...Object.values(byMap).map((v) => v.count));
  const color = (n: number) => {
    if (!n) return "#f4ece4";
    const t = Math.sqrt(n / max); // gentler scale so small states still show
    const a = [253, 238, 230], b = [194, 65, 12];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
  };
  const top = Object.entries(byMap).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

  if (!shape || !rows) return <div className="grid h-80 place-items-center text-sm text-muted">Loading map...</div>;
  const h = hover && byMap[hover.name];

  return (
    <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
      <div className="relative">
        <svg viewBox={shape.viewBox} className="h-auto w-full" role="img" aria-label="Map of India showing failed medicine batches by state">
          {shape.locations.map((l: any) => {
            const v = byMap[l.name];
            const on = picked && v && v.dbName === picked;
            return (
              <path key={l.name} d={l.path} fill={color(v?.count || 0)} stroke={on ? "#2b2320" : "#fffaf5"} strokeWidth={on ? 1.6 : 0.6}
                className={v ? "cursor-pointer transition-opacity hover:opacity-80" : ""}
                onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ name: l.name, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                onMouseLeave={() => setHover(null)}
                onClick={() => v && onPick(v.dbName)} />
            );
          })}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute z-10 rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-soft"
            style={{ left: Math.min(hover.x + 12, 260), top: hover.y + 12 }}>
            <div className="font-medium">{hover.name}</div>
            {h ? <div className="text-muted">{fmt(h.count)} failed batches &middot; {fmt(h.companies)} companies &middot; {fmt(h.high)} HIGH</div>
              : <div className="text-muted">No failed batches on record</div>}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <span>Fewer</span>
          <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${color(1)}, ${color(max)})` }} />
          <span>More failed batches</span>
        </div>
      </div>
      <div>
        <div className="label mb-2">States with the most failed batches</div>
        <ol className="space-y-1.5">
          {top.map(([name, v], i) => (
            <li key={name}>
              <button onClick={() => onPick(v.dbName)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-paper ${picked === v.dbName ? "bg-paper" : ""}`}>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-light text-xs text-brand">{i + 1}</span>
                <span className="flex-1">{name}</span>
                <span className="tabular-nums text-muted">{fmt(v.count)}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">State of the company that made the batch. Click a state to see its companies.</p>
        <p className="mt-1 text-[10px] text-[#a8988f]">Map shapes: @svg-maps/india (CC BY 4.0)</p>
      </div>
    </div>
  );
}
