"use client";
import Link from "next/link";
import { ReactNode } from "react";

// Chart colours for the warm theme
export const C = { red: "#c2410c", ink: "#9c7a9e", grey: "#b9aaa1", grid: "#efe6de" };

export function Danger({ level }: { level: string }) {
  const cls =
    level === "HIGH" ? "bg-bad-light text-bad" :
    level === "MEDIUM" ? "bg-warn-light text-warn" :
    "bg-sand text-muted";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${cls}`}>{level}</span>;
}

export function Band({ band }: { band?: string | null }) {
  if (!band) return <span className="text-muted">-</span>;
  const cls = band === "High" ? "bg-bad-light text-bad" : band === "Medium" ? "bg-warn-light text-warn" : "bg-ok-light text-ok";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{band}</span>;
}

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="h-display text-4xl md:text-5xl">{title}</h1>
      {sub && <p className="mt-3 max-w-3xl text-muted">{sub}</p>}
    </div>
  );
}

export function Box({ title, children, right, className = "" }: { title?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-medium text-ink">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: "bad" | "warn" }) {
  const c = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="card px-5 py-4">
      <div className="label">{label}</div>
      <div className={`mt-1 text-3xl font-normal tracking-[-0.02em] tabular-nums ${c}`}>{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>;
}

export function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
      <span>{total.toLocaleString("en-IN")} rows</span>
      <div className="flex items-center gap-2">
        <button className="btn-light" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="btn-light" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <p className="flex items-center gap-2 py-8 text-sm text-muted">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand" /> Loading...
    </p>
  );
}

export function ErrorNote({ msg }: { msg: string }) {
  return <p className="rounded-xl bg-bad-light px-3.5 py-2.5 text-sm text-bad">{msg}</p>;
}

export function BatchLink({ batch, norm }: { batch: string; norm: string }) {
  return <Link href={`/batch/${encodeURIComponent(norm)}`} className="font-mono">{batch}</Link>;
}
