"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, getUser, month } from "@/lib/api";
import { Loading, ErrorNote } from "@/components/ui";
import Logo from "@/components/Logo";

// Monthly record of failed batches found in the shop's stock, to keep for the drug inspector.
export default function Report() {
  const [items, setItems] = useState<any[] | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [err, setErr] = useState("");
  const [m, setM] = useState("all");

  useEffect(() => {
    if (!getUser()) { window.location.href = "/welcome?next=/watchlist/report"; return; }
    api("/api/watchlist").then((d) => setItems(d.items)).catch((e) => setErr(e.message));
    api("/api/alerts").then((d) => setAlerts(d.items)).catch(() => {});
    api("/api/me/settings").then(setSettings).catch(() => {});
  }, []);

  const alertOn = useMemo(() => {
    const x: Record<number, string> = {};
    alerts.forEach((a) => { if (a.record_id && !x[a.record_id]) x[a.record_id] = a.sent_at; });
    return x;
  }, [alerts]);

  const failed = useMemo(() => (items || []).filter((i) => i.failed && i.record), [items]);
  const months = useMemo(() => Array.from(new Set(failed.map((i) => i.record.report_month.slice(0, 7)))).sort().reverse(), [failed]);
  const rows = failed.filter((i) => m === "all" || i.record.report_month.startsWith(m));
  const returned = rows.filter((i) => i.status === "returned").length;
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  if (err) return <ErrorNote msg={err} />;
  if (!items) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/watchlist" className="text-sm">&larr; Back to my stock</Link>
        <div className="flex items-center gap-2">
          <select className="input w-auto py-2" value={m} onChange={(e) => setM(e.target.value)}>
            <option value="all">All months</option>
            {months.map((x) => <option key={x} value={x}>{month(x + "-01", true)}</option>)}
          </select>
          <button className="btn" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>
      <p className="no-print -mt-3 mb-4 text-xs text-muted">Tip: in the print window choose &ldquo;Save as PDF&rdquo; to keep a file.</p>

      <div className="card p-8 print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <Logo size={22} />
            <h1 className="mt-4 text-2xl font-medium">Not of Standard Quality (NSQ) stock report</h1>
            <p className="mt-1 text-sm text-muted">{m === "all" ? "All CDSCO lists on record" : `CDSCO list of ${month(m + "-01", true)}`}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium">{settings?.organisation || settings?.name || ""}</div>
            <div className="text-muted">{settings?.email}</div>
            <div className="mt-2 text-muted">Generated {today}</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl bg-sand p-3"><div className="text-2xl">{rows.length}</div><div className="text-muted">Failed batches found</div></div>
          <div className="rounded-xl bg-sand p-3"><div className="text-2xl">{returned}</div><div className="text-muted">Returned</div></div>
          <div className="rounded-xl bg-sand p-3"><div className={`text-2xl ${rows.length - returned ? "text-bad" : ""}`}>{rows.length - returned}</div><div className="text-muted">Still to return</div></div>
        </div>

        {rows.length === 0 ? (
          <p className="mt-6 text-sm text-muted">No batch in your stock appears in {m === "all" ? "any CDSCO list" : "this CDSCO list"}.</p>
        ) : (
          <table className="mt-6 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-ink/40 text-muted">
                <th className="py-2 pr-2 font-medium">#</th><th className="py-2 pr-2 font-medium">Medicine</th><th className="py-2 pr-2 font-medium">Batch</th>
                <th className="py-2 pr-2 font-medium">Manufacturer</th><th className="py-2 pr-2 font-medium">Supplier</th><th className="py-2 pr-2 font-medium">Qty</th>
                <th className="py-2 pr-2 font-medium">Failed test</th><th className="py-2 pr-2 font-medium">CDSCO list</th><th className="py-2 pr-2 font-medium">Alerted</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((w, i) => (
                <tr key={w.id} className="align-top">
                  <td className="py-2 pr-2">{i + 1}</td>
                  <td className="py-2 pr-2">{w.drug_name || w.record.drug_name}</td>
                  <td className="py-2 pr-2 font-mono">{w.batch_no}</td>
                  <td className="py-2 pr-2">{w.record.manufacturer}</td>
                  <td className="py-2 pr-2">{w.supplier || "-"}</td>
                  <td className="py-2 pr-2">{w.quantity ?? "-"}</td>
                  <td className="py-2 pr-2">{w.record.category} ({w.record.danger})</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{month(w.record.report_month)}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{alertOn[w.record.id] ? new Date(alertOn[w.record.id]).toLocaleDateString("en-IN") : "-"}</td>
                  <td className="py-2 font-medium">{w.status === "returned" ? "Returned" : "To return"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
          <div className="border-t border-ink/50 pt-2 text-muted">Pharmacist name and signature</div>
          <div className="border-t border-ink/50 pt-2 text-muted">Date and shop seal</div>
        </div>
        <p className="mt-6 text-[10px] text-muted">
          Source: CDSCO &ldquo;Not of Standard Quality&rdquo; drug alerts, matched to this shop&apos;s stock list by Medi-Flaw (medi-flaw.vercel.app). Check the original CDSCO list before acting.
        </p>
      </div>
    </div>
  );
}
