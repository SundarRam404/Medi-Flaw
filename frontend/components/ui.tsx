"use client";
import Link from "next/link";
import { ReactNode } from "react";

export function Danger({ level }: { level: string }) {
  const cls =
    level === "HIGH" ? "bg-bad-light text-bad border-bad/30" :
    level === "MEDIUM" ? "bg-warn-light text-warn border-warn/30" :
    "bg-paper text-muted border-line";
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-semibold tracking-wide ${cls}`}>{level}</span>;
}

export function Band({ band }: { band?: string | null }) {
  if (!band) return <span className="text-muted">-</span>;
  const cls = band === "High" ? "text-bad" : band === "Medium" ? "text-warn" : "text-ok";
  return <span className={`font-medium ${cls}`}>{band}</span>;
}

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
    </div>
  );
}

export function Box({ title, children, right, className = "" }: { title?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-line bg-white ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-md border border-line bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}
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
    <div className="mt-3 flex items-center justify-between text-sm text-muted">
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
  return <p className="py-8 text-muted">Loading...</p>;
}

export function ErrorNote({ msg }: { msg: string }) {
  return <p className="rounded-md border border-bad/30 bg-bad-light px-3 py-2 text-sm text-bad">{msg}</p>;
}

export function BatchLink({ batch, norm }: { batch: string; norm: string }) {
  return <Link href={`/batch/${encodeURIComponent(norm)}`} className="font-mono text-brand hover:underline">{batch}</Link>;
}
