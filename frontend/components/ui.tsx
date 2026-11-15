"use client";
import Link from "next/link";
import { ReactNode } from "react";

// Chart colours for the Swiss theme
export const C = { red: "#E10600", ink: "#111111", grey: "#9a9a9a", grid: "#e6e6e6" };

export function Danger({ level }: { level: string }) {
  const cls =
    level === "HIGH" ? "border-ink bg-ink text-white" :
    level === "MEDIUM" ? "border-ink bg-white text-ink" :
    "border-line bg-white text-muted";
  return <span className={`inline-block whitespace-nowrap border-2 px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] ${cls}`}>{level}</span>;
}

export function Band({ band }: { band?: string | null }) {
  if (!band) return <span className="text-muted">-</span>;
  const cls = band === "High" ? "bg-brand text-white" : band === "Medium" ? "bg-ink text-white" : "bg-paper text-ink";
  return <span className={`inline-block px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${cls}`}>{band}</span>;
}

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-8 border-b-4 border-ink pb-5">
      <h1 className="h-display text-4xl md:text-5xl">{title}</h1>
      {sub && <p className="mt-3 max-w-3xl text-muted">{sub}</p>}
    </div>
  );
}

export function Box({ title, children, right, className = "" }: { title?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink px-4 py-2.5">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.06em] text-ink">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: "bad" | "warn" }) {
  const c = tone === "bad" ? "text-brand" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold tracking-[-0.02em] tabular-nums ${c}`}>{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-[0.08em] text-ink">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-extrabold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

export function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
      <span className="font-semibold">{total.toLocaleString("en-IN")} rows</span>
      <div className="flex items-center gap-2">
        <button className="btn-light" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="font-semibold text-ink">Page {page} of {pages}</span>
        <button className="btn-light" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <p className="flex items-center gap-2 py-8 text-sm font-bold uppercase tracking-[0.08em] text-muted">
      <span className="inline-block h-3 w-3 animate-pulse bg-brand" /> Loading
    </p>
  );
}

export function ErrorNote({ msg }: { msg: string }) {
  return <p className="border-2 border-brand bg-bad-light px-3 py-2 text-sm font-semibold text-brand">{msg}</p>;
}

export function BatchLink({ batch, norm }: { batch: string; norm: string }) {
  return <Link href={`/batch/${encodeURIComponent(norm)}`} className="font-mono font-semibold">{batch}</Link>;
}
