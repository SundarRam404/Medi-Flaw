"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, month, dateTime } from "@/lib/api";
import { Danger, Loading, ErrorNote } from "@/components/ui";
import ScanButton from "@/components/ScanButton";
import type { ScanResult } from "@/lib/scan";

const PEOPLE = ["Me", "Amma", "Appa", "Paati", "Thatha", "Child"];

function shopNote(w: any) {
  const r = w.record;
  return `To the pharmacist,

I bought this medicine from your shop:

  Medicine     : ${w.drug_name || r.drug_name}
  Batch number : ${w.batch_no}
  Made by      : ${r.manufacturer}

This batch is in the Government of India (CDSCO) list of medicines that are
"Not of Standard Quality" (list of ${month(r.report_month, true)}).
What failed: ${r.failure_reason}

Please take it back and give me the same medicine from a different batch.

Thank you.

Checked on Medi-Flaw: https://medi-flaw.vercel.app/batch/${r.batch_norm}`;
}

export default function Personal({ user, onSettings }: { user: any; onSettings?: (s: any) => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [f, setF] = useState({ drug_name: "", batch_no: "", taken_by: "" });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [cands, setCands] = useState<string[]>([]);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  function load() {
    api("/api/watchlist").then((d) => setItems(d.items)).catch((e) => setErr(e.message));
    api("/api/alerts").then((d) => setAlerts(d.items)).catch(() => {});
    api("/api/me/settings").then((x) => { setSettings(x); onSettings?.(x); }).catch(() => {});
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return;
    setAdding(true); setErr(""); setMsg("");
    try {
      const d = await api("/api/watchlist", { method: "POST", body: JSON.stringify({ ...f, purchased_on: null }) });
      setItems(d.items);
      const it = d.items.find((i: any) => i.batch_no === f.batch_no.trim());
      setMsg(it?.failed ? "Added. This batch FAILED a government test. See the red card below." : "Added. This batch has no failure on record. We will email you if that changes.");
      setF({ drug_name: "", batch_no: "", taken_by: f.taken_by });
      setCands([]);
      setTimeout(() => api("/api/alerts").then((x) => setAlerts(x.items)).catch(() => {}), 6000);
    } catch (e: any) { setErr(e.message); }
    finally { setAdding(false); }
  }

  function onScan(r: ScanResult) {
    setErr("");
    setF((x) => ({ ...x, batch_no: r.batch || x.batch_no, drug_name: x.drug_name || r.name || "" }));
    setCands(r.batch ? [] : r.candidates);
    if (r.batch) setMsg(r.how === "code" ? "Read from the QR code. Check it matches the strip, then press Add and check." : "");
  }

  async function setStatus(id: number, status: string) {
    const d = await api(`/api/watchlist/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setItems(d.items);
  }
  async function remove(id: number) {
    const d = await api(`/api/watchlist/${id}`, { method: "DELETE" }); setItems(d.items);
  }
  async function toggleEmail() {
    const d = await api("/api/me/settings", { method: "PATCH", body: JSON.stringify({ email_alerts: !settings.email_alerts }) });
    setSettings(d);
  }

  const active = (items || []).filter((i) => i.status !== "returned");
  const bad = active.filter((i) => i.failed);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-4xl md:text-5xl">My family&rsquo;s medicines</h1>
          <p className="mt-1 text-muted">Checked against every new government list. We email you if one fails.</p>
        </div>
        {settings && (
          <button onClick={toggleEmail} className="chip flex items-center gap-2 py-1.5 text-sm">
            <span className={`h-2 w-2 rounded-full ${settings.email_alerts ? "bg-ok" : "bg-[#cbbbb0]"}`} />
            Email alerts {settings.email_alerts ? "on" : "off"}
          </button>
        )}
      </div>

      {/* big status */}
      {items && (
        bad.length ? (
          <div className="mt-6 rounded-3xl bg-bad p-6 text-white shadow-soft">
            <p className="text-sm opacity-90">Action needed</p>
            <p className="h-display mt-1 text-4xl">{bad.length === 1 ? "1 medicine failed a test" : `${bad.length} medicines failed a test`}</p>
            <p className="mt-2 text-sm opacity-90">See the red card below. Do not stop the medicine suddenly. Talk to your doctor or pharmacist first.</p>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl bg-ok-light p-6 shadow-soft">
            <p className="text-sm text-ok">&#10003; All clear</p>
            <p className="h-display mt-1 text-4xl text-ink">
              {active.length === 0 ? "Add your first medicine" : active.length === 1 ? "Your 1 medicine is clear" : `All ${active.length} medicines are clear`}
            </p>
            <p className="mt-2 text-sm text-muted">{active.length ? "None of them is in any government failed list." : "It takes 10 seconds. You only need the batch number from the strip."}</p>
          </div>
        )
      )}

      {/* add */}
      <section className="card mt-6 p-5">
        <h2 className="text-[15px] font-medium">Add a medicine</h2>
        <form onSubmit={add} className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <input className="input" placeholder="Medicine name, e.g. Dolo 650" value={f.drug_name} onChange={(e) => setF({ ...f, drug_name: e.target.value })} />
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <input className="input min-w-0 flex-1 font-mono" placeholder="Batch number *" required value={f.batch_no} onChange={(e) => setF({ ...f, batch_no: e.target.value })} />
            <ScanButton onResult={onScan} />
          </div>
          <div className="sm:col-span-2">
            <span className="label">Who takes it?</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {PEOPLE.map((p) => (
                <button type="button" key={p} onClick={() => setF({ ...f, taken_by: f.taken_by === p ? "" : p })}
                  className={`rounded-full border px-3 py-1 text-sm transition ${f.taken_by === p ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:text-ink"}`}>{p}</button>
              ))}
              <input className="input h-8 w-36 py-1 text-sm" placeholder="Someone else" value={PEOPLE.includes(f.taken_by) ? "" : f.taken_by}
                onChange={(e) => setF({ ...f, taken_by: e.target.value })} />
            </div>
          </div>
          <button className="btn sm:col-span-2" disabled={adding}>{adding ? "Checking..." : "Add and check"}</button>
        </form>
        {cands.length > 1 && (
          <div className="mt-3 text-sm">
            <span className="text-muted">Which one is the batch number? </span>
            {cands.map((c) => (
              <button key={c} onClick={() => setF({ ...f, batch_no: c })} className={`chip ml-1 font-mono ${f.batch_no === c ? "border-ink text-ink" : ""}`}>{c}</button>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Tip: the batch number is printed on the strip or box, next to &ldquo;B.No.&rdquo;, &ldquo;Batch&rdquo; or &ldquo;Lot&rdquo;.</p>
        {err && <div className="mt-3"><ErrorNote msg={err} /></div>}
        {msg && <p className="mt-3 rounded-xl bg-sand px-3.5 py-2.5 text-sm">{msg}</p>}
      </section>

      {/* list */}
      <div className="mt-6 space-y-3">
        {!items ? <Loading /> : items.map((w) => {
          const failed = w.failed && w.status !== "returned";
          return (
            <div key={w.id} className={`card overflow-hidden ${failed ? "border-bad/40" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-medium">{w.drug_name || w.record?.drug_name || "Medicine"}</span>
                    {w.taken_by && <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs">{w.taken_by}</span>}
                  </div>
                  <div className="font-mono text-sm text-muted">Batch {w.batch_no}</div>
                </div>
                <div className="flex items-center gap-3">
                  {w.status === "returned" ? <span className="text-sm text-muted">Returned</span>
                    : failed ? <span className="rounded-full bg-bad px-3 py-1 text-sm font-medium text-white">Failed</span>
                    : <span className="rounded-full bg-ok-light px-3 py-1 text-sm text-ok">&#10003; Clear</span>}
                  <button className="text-xs text-muted hover:text-bad" onClick={() => remove(w.id)}>Remove</button>
                </div>
              </div>
              {failed && (
                <div className="border-t border-bad/20 bg-bad-light/60 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-bad">What the test found:</span> {w.record.category} <Danger level={w.record.danger} />
                  </div>
                  <p className="mt-1 text-muted">{w.record.failure_reason} &middot; government list of {month(w.record.report_month, true)}</p>
                  <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink">
                    <li><b>Do not stop it suddenly.</b> Call your doctor or pharmacist today.</li>
                    <li>Ask for the <b>same medicine from a different batch</b>.</li>
                    <li>Take this strip back to the shop and show them the note.</li>
                  </ol>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn px-4 py-1.5" onClick={() => { setNoteFor(noteFor === w.id ? null : w.id); setCopied(false); }}>
                      {noteFor === w.id ? "Hide note" : "Note for the shop"}
                    </button>
                    <button className="btn-light px-4 py-1.5" onClick={() => setStatus(w.id, "returned")}>I returned it</button>
                    <Link href={`/batch/${w.record.batch_norm}`} className="btn-light px-4 py-1.5 hover:no-underline">Full details</Link>
                  </div>
                  {noteFor === w.id && (
                    <div className="mt-3">
                      <pre className="whitespace-pre-wrap rounded-xl border border-line bg-white p-4 font-mono text-xs leading-relaxed">{shopNote(w)}</pre>
                      <button className="btn-light mt-2 px-3 py-1 text-xs" onClick={() => { navigator.clipboard.writeText(shopNote(w)); setCopied(true); }}>
                        {copied ? "Copied" : "Copy note"}
                      </button>
                      <span className="ml-2 text-xs text-muted">Show it on your phone, or send it on WhatsApp.</span>
                    </div>
                  )}
                </div>
              )}
              {w.status === "returned" && (
                <div className="border-t border-line px-5 py-2 text-xs text-muted">
                  Marked as returned. <button className="text-brand hover:underline" onClick={() => setStatus(w.id, "in_stock")}>Undo</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {alerts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[15px] font-medium">Emails we sent you</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-white">
            {alerts.map((a) => (
              <li key={a.id} className="px-4 py-2.5 text-sm">{a.subject}<span className="ml-2 text-xs text-muted">{dateTime(a.sent_at)}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
