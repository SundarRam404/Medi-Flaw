"use client";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { api, getUser, dateTime } from "@/lib/api";
import { Box, PageTitle, Table, Td, Loading, ErrorNote } from "@/components/ui";

const STEP_NAMES: Record<string, string> = {
  fetch: "Fetch new CDSCO data", clean: "Clean", score: "Risk scores", index: "Search index",
  alerts: "Watchlist alerts", followups: "Reminders",
};

function stepSummary(name: string, r: any) {
  if (!r) return "";
  if (r.skipped) return `Skipped: ${r.skipped}`;
  switch (name) {
    case "fetch": return `${r.new_total ?? 0} new rows. Portal: ${r.portal}${r.files_imported?.length ? `. Files: ${r.files_imported.join(", ")}` : ""}`;
    case "clean": return `${r.added ?? 0} added, ${r.duplicates ?? 0} duplicates, ${r.new_companies ?? 0} new companies`;
    case "score": return `${r.companies_scored ?? 0} companies scored, test F1 ${r.test_f1}, ${r.spikes} unusual months`;
    case "index": return `${r.documents} documents (${r.search})`;
    case "alerts": return `${r.matched ?? 0} matches, ${r.sent ?? 0} emailed, ${r.outbox ?? 0} saved`;
    case "followups": return `${r.reminders ?? 0} reminders`;
  }
  return JSON.stringify(r);
}

export default function Admin() {
  const [user, setUser] = useState<any>(undefined);
  const [tab, setTab] = useState<"runs" | "outbox" | "model">("runs");
  const [runs, setRuns] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [model, setModel] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  function load() {
    api("/api/pipeline/runs").then(setRuns).catch((e) => setErr(e.message));
    api("/api/alerts").then((d) => setAlerts(d.items)).catch(() => {});
    api("/api/model").then(setModel).catch(() => {});
  }
  useEffect(() => { const u = getUser(); setUser(u); if (u?.role === "admin") load(); }, []);
  useEffect(() => {
    if (!runs?.items?.some((r: any) => r.status === "running")) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [runs]);

  async function runNow() {
    setMsg(""); setErr("");
    try { const r = await api("/api/pipeline/run-now", { method: "POST" }); setMsg(r.message); setTimeout(load, 1500); }
    catch (e: any) { setErr(e.message); }
  }

  if (user === undefined) return <Loading />;
  if (user?.role !== "admin") return <div><PageTitle title="Admin" sub="Admins only." /><Link href="/login?next=/admin" className="btn">Log in</Link></div>;

  const m = model?.risk_model;
  const ev = model?.ai_eval;

  return (
    <div>
      <PageTitle title="Admin" sub="Daily runs, alert emails and model results." />

      <Box title="Daily update">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm text-muted">
            Runs every morning at 5 AM: fetch new CDSCO data, clean it, email shops whose batches appear, and send
            reminders for alerts nobody confirmed. Risk scores and the search index are rebuilt when new data arrives,
            and fully on the 1st of each month.
            {runs && (runs.n8n ? " Run now goes through n8n." : " n8n link not set, Run now runs on the server.")}
          </p>
          <button className="btn" onClick={runNow}>Run now</button>
        </div>
        {msg && <p className="mt-3 text-sm text-ok">{msg}</p>}
        {err && <div className="mt-3"><ErrorNote msg={err} /></div>}
      </Box>

      <div className="tabs mt-8">
        <button className={`tab ${tab === "runs" ? "tab-on" : ""}`} onClick={() => setTab("runs")}>Run history</button>
        <button className={`tab ${tab === "outbox" ? "tab-on" : ""}`} onClick={() => setTab("outbox")}>Alert emails {alerts ? `(${alerts.length})` : ""}</button>
        <button className={`tab ${tab === "model" ? "tab-on" : ""}`} onClick={() => setTab("model")}>Model results</button>
      </div>

      {tab === "runs" && (
        <div className="mt-4 space-y-3">
          {!runs ? <Loading /> : runs.items.map((r: any) => (
            <div key={r.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-sm">
                <span><b>Run #{r.id}</b> &middot; {r.trigger} &middot; {dateTime(r.started_at)}</span>
                <span className={r.status === "done" ? "text-ok" : r.status === "failed" ? "text-bad" : "text-warn"}>{r.status}</span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {Object.entries(r.steps).map(([k, s]: any) => (
                    <tr key={k}>
                      <td className="w-40 px-4 py-1.5 text-muted">{STEP_NAMES[k] || k}</td>
                      <td className={`w-12 py-1.5 ${s.status === "ok" ? "text-ok" : "text-bad"}`}>{s.status}</td>
                      <td className="px-2 py-1.5">{s.status === "ok" ? stepSummary(k, s.result) : s.error}</td>
                      <td className="w-16 px-4 py-1.5 text-right text-xs text-muted">{s.seconds != null ? `${s.seconds}s` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.error && <p className="border-t border-line px-4 py-2 text-sm text-bad">{r.error}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "outbox" && (
        <Box className="mt-4">
          {!alerts ? <Loading /> : alerts.length === 0 ? <p className="text-sm text-muted">No alerts yet.</p> : (
            <Table head={["Sent", "To", "Subject", "Delivery", "Confirmed", "Reminder"]}>
              {alerts.map((a) => (
                <Fragment key={a.id}>
                  <tr className="cursor-pointer hover:bg-paper" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <Td className="whitespace-nowrap text-xs">{dateTime(a.sent_at)}</Td>
                    <Td>{a.to}</Td>
                    <Td>{a.subject}</Td>
                    <Td>{a.delivery === "sent" ? "Emailed" : a.delivery === "outbox" ? "Saved (no email set up)" : a.delivery === "off" ? "User turned email off" : "Failed"}</Td>
                    <Td className="text-xs">{a.acknowledged_at ? dateTime(a.acknowledged_at) : "-"}</Td>
                    <Td className="text-xs">{a.followup_at ? dateTime(a.followup_at) : "-"}</Td>
                  </tr>
                  {open === a.id && (
                    <tr><td colSpan={6} className="bg-paper px-3 py-3"><pre className="whitespace-pre-wrap font-mono text-xs">{a.body}</pre></td></tr>
                  )}
                </Fragment>
              ))}
            </Table>
          )}
        </Box>
      )}

      {tab === "model" && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Box title="Company risk model (XGBoost)">
            {!m ? <p className="text-sm text-muted">Not trained yet.</p> : (
              <>
                <p className="text-sm">{m.question}</p>
                <p className="mt-1 text-xs text-muted">Trained on {m.train_period} ({m.train_rows.toLocaleString()} rows), tested on {m.test_period} ({m.test_rows.toLocaleString()} rows). Only past data is used to predict later months.</p>
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1.5">Measure</th><th>Model</th><th>Simple rule</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {["precision", "recall", "f1"].map((k) => (
                      <tr key={k}><td className="py-1.5 capitalize">{k === "f1" ? "F1 score" : k}</td><td className="font-medium">{m.model[k]}</td><td className="text-muted">{m.baseline[k]}</td></tr>
                    ))}
                    <tr><td className="py-1.5">ROC AUC</td><td className="font-medium">{m.model.roc_auc}</td><td className="text-muted">-</td></tr>
                    <tr><td className="py-1.5">Precision in top 50</td><td className="font-medium">{m.precision_top50.model}</td><td className="text-muted">{m.precision_top50.baseline}</td></tr>
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted">Simple rule: {m.baseline_rule}. Share of companies that did fail again: {m.positive_rate_test}.</p>
                <h3 className="label mb-2 mt-4 text-ink">What the model relies on most</h3>
                {m.importance.slice(0, 8).map((x: any) => (
                  <div key={x.feature} className="flex items-center gap-2 text-xs">
                    <span className="w-52 shrink-0 text-muted">{x.feature}</span>
                    <span className="h-2 rounded-full bg-brand/80" style={{ width: `${x.value * 250}px` }} />
                  </div>
                ))}
              </>
            )}
          </Box>
          <Box title="Question answering test (50 questions)">
            {!ev ? (
              <p className="text-sm text-muted">Not run yet. Run <code className="rounded bg-paper px-1">python3 -m eval.ai_eval</code> in the project folder.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    <tr><td className="py-1.5">Answerable questions correct</td><td className="font-medium">{ev.summary.answered_correctly} / {ev.summary.answerable}</td></tr>
                    <tr><td className="py-1.5">Outside questions refused</td><td className="font-medium">{ev.summary.refused_correctly} / {ev.summary.outside_data}</td></tr>
                    <tr><td className="py-1.5">Made-up answers</td><td className="font-medium">{ev.summary.made_up_answers}</td></tr>
                    <tr><td className="py-1.5">Answered by</td><td className="text-muted">{ev.summary.engine}</td></tr>
                  </tbody>
                </table>
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-brand">All 50 questions</summary>
                  <ul className="mt-2 space-y-1">
                    {ev.rows.map((r: any, i: number) => (
                      <li key={i}><span className={r.pass ? "text-ok" : "text-bad"}>{r.pass ? "Pass" : "Fail"}</span> &middot; {r.q}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
            {model && <p className="mt-4 text-xs text-muted">Questions asked on the site: {model.questions_asked}, refused: {model.questions_refused}.</p>}
          </Box>
        </div>
      )}
    </div>
  );
}
