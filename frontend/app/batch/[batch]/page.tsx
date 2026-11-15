"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, getUser, month } from "@/lib/api";
import { Danger, Band, RiskRank, Loading, ErrorNote } from "@/components/ui";

export default function BatchPage({ params }: { params: { batch: string } }) {
  const batch = decodeURIComponent(params.batch);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api(`/api/batch/${encodeURIComponent(batch)}`).then(setD).catch((e) => setErr(e.message));
  }, [batch]);

  async function watch(r: any) {
    if (!getUser()) { window.location.href = "/login?next=/watchlist"; return; }
    try {
      await api("/api/watchlist", { method: "POST", body: JSON.stringify({ batch_no: r?.batch_no || batch, drug_name: r?.drug_name }) });
      setMsg("Added to your watchlist.");
    } catch (e: any) { setMsg(e.message); }
  }

  if (err) return <ErrorNote msg={err} />;
  if (!d) return <Loading />;

  return (
    <div className="max-w-4xl">
      <Link href="/" className="text-sm">&larr; New search</Link>
      <p className="label mt-6">Batch number</p>
      <h1 className="mt-1 break-all font-mono text-4xl tracking-tight md:text-5xl">{batch}</h1>

      {!d.failed ? (
        <div className="mt-6 rounded-2xl bg-ok-light p-6">
          <p className="h-display text-3xl text-ok">No failure on record</p>
          <p className="mt-2 max-w-2xl text-sm text-ink">
            This batch number is not in any CDSCO Not of Standard Quality list up to {month(d.checked_until, true)}.
            This does not prove the batch was tested. Most batches are never sampled.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-light" onClick={() => watch(null)}>Watch this batch</button>
            <Link href="/" className="btn-light">Check another</Link>
          </div>
          {msg && <p className="mt-3 text-sm">{msg}</p>}
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-2xl bg-bad-light p-6 text-bad">
            <p className="h-display text-3xl md:text-4xl">
              Failed a quality test{d.records.length > 1 ? ` (${d.records.length} entries)` : ""}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-ink">
              This batch is listed by CDSCO (the Government of India&apos;s drug regulator) as Not of Standard Quality.
            </p>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[15px] font-medium"><span aria-hidden>&#129658;</span> If you or your family take this medicine</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink">
                <li><b>Do not stop it suddenly.</b> Call your doctor or pharmacist today.</li>
                <li>Ask for the <b>same medicine from a different batch</b>.</li>
                <li>Take the strip back to the shop where you bought it.</li>
              </ol>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[15px] font-medium"><span aria-hidden>&#127978;</span> If you are a pharmacy</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink">
                <li><b>Stop selling</b> this batch and keep it aside.</li>
                <li>Return it to your distributor with the <b>return letter</b> below.</li>
                <li>Check your other stock: add it to <Link href="/watchlist">My stock</Link>.</li>
              </ol>
            </div>
          </div>

          {d.records.map((r: any) => (
            <div key={r.id} className="card mt-4 overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-xl font-medium">{r.drug_name}</h2>
                  <p className="text-sm text-muted">CDSCO list of {month(r.report_month, true)}</p>
                </div>
                <div className="text-right">
                  <div className="label mb-1">Danger level</div>
                  <Danger level={r.danger} />
                </div>
              </div>
              <dl className="grid gap-x-8 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
                <Row k="Manufacturer"><Link href={`/companies/${r.company_id}`}>{r.manufacturer}</Link>{r.state ? `, ${r.state}` : ""}</Row>
                <Row k="Test failed">{r.failure_reason}</Row>
                <Row k="Failure type">{r.category}</Row>
                <Row k="Tested by">{r.testing_lab || "-"} ({r.reporting_source || "-"})</Row>
                <Row k="Manufactured">{month(r.mfg_date)}</Row>
                <Row k="Expiry">{month(r.expiry_date)}</Row>
              </dl>
              {r.expiry_date && (() => {
                const exp = new Date(r.expiry_date + "T00:00:00");
                const gone = exp < new Date();
                return (
                  <div className={`border-t border-line px-5 py-3 text-sm ${gone ? "bg-sand/70 text-ink" : "bg-warn-light text-ink"}`}>
                    {gone
                      ? <>&#9888;&#65039; This batch <b>expired in {month(r.expiry_date, true)}</b>. It should no longer be sold. If you still have it at home, do not use it.</>
                      : <>&#9888;&#65039; This batch is valid until <b>{month(r.expiry_date, true)}</b>, so it <b>may still be in shops and homes</b>. Check your strips.</>}
                  </div>
                );
              })()}
              {r.findings?.length > 0 && (
                <div className="border-t border-line bg-bad-light/50 px-5 py-3">
                  <div className="label text-bad">Test result</div>
                  <ul className="mt-1 space-y-0.5 text-sm font-medium text-ink">
                    {r.findings.map((x: string, i: number) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )}
              <p className="border-t border-line px-5 py-3 text-sm text-muted">{r.danger_note}</p>

              {r.company && (
                <div className="border-t border-line bg-paper px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">About {r.company.name}</span>
                    <Link href={`/companies/${r.company_id}`}>Full history</Link>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <div>Failed batches: <b>{r.company.total_failures}</b></div>
                    <div>Repeat score: <b>{Math.round(r.company.repeat_score)}</b>/100</div>
                    <div className="flex flex-wrap items-center gap-1.5">Risk rank: <RiskRank c={r.company} /></div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
                <Link href={`/letter/${r.id}`} className="btn">Return letter</Link>
                <button className="btn-light" onClick={() => watch(r)}>Add to my watchlist</button>
                <a className="btn-light" href="https://cdsco.gov.in/opencms/opencms/en/Notifications/Alerts/" target="_blank" rel="noreferrer">Original CDSCO list</a>
              </div>
            </div>
          ))}
          {msg && <p className="mt-3 text-sm">{msg}</p>}
        </>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
