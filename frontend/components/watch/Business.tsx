"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, dateTime, month } from "@/lib/api";
import { Box, Table, Td, Danger, Band, Loading, ErrorNote } from "@/components/ui";
import ScanButton from "@/components/ScanButton";

declare global { interface Window { Tesseract: any } }

function loadOCR(): Promise<any> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = () => res(window.Tesseract);
    s.onerror = () => rej(new Error("Could not load the photo reader. Check the internet connection."));
    document.body.appendChild(s);
  });
}

type Tab = "one" | "csv" | "pdf" | "photo";

export default function Business({ user, onSettings }: { user: any; onSettings?: (s: any) => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("one");
  const [f, setF] = useState({ batch_no: "", drug_name: "", manufacturer: "", quantity: "", purchased_on: "", supplier: "" });
  const [preview, setPreview] = useState<any>(null);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState({ month: "", status: "", q: "" });
  const [open, setOpen] = useState<number | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  function load() {
    api("/api/watchlist").then((d) => setItems(d.items)).catch((e) => setErr(e.message));
    api("/api/alerts").then((d) => setAlerts(d.items)).catch(() => {});
    api("/api/me/settings").then((x) => { setSettings(x); onSettings?.(x); }).catch(() => {});
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const months = useMemo(() => {
    const m = new Set<string>();
    items?.forEach((i) => i.purchased_on && m.add(i.purchased_on.slice(0, 7)));
    return Array.from(m).sort().reverse();
  }, [items]);

  const shown = useMemo(() => (items || []).filter((i) => {
    if (filter.month && !(i.purchased_on || "").startsWith(filter.month)) return false;
    if (filter.status === "failed" && !(i.failed && i.status !== "returned")) return false;
    if (filter.status === "ok" && i.failed) return false;
    if (filter.status === "returned" && i.status !== "returned") return false;
    if (filter.q) {
      const q = filter.q.toLowerCase();
      if (![i.drug_name, i.batch_no, i.manufacturer, i.supplier].some((x) => (x || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }), [items, filter]);

  const stats = useMemo(() => {
    const all = items || [];
    return {
      total: all.length,
      inStock: all.filter((i) => i.status !== "returned").length,
      toReturn: all.filter((i) => i.failed && i.status !== "returned").length,
      returned: all.filter((i) => i.status === "returned").length,
      highRisk: new Set(all.filter((i) => i.company?.risk_band === "High").map((i) => i.company.id)).size,
    };
  }, [items]);

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return;
    setAdding(true); setErr(""); setMsg("");
    try {
      const body: any = { ...f, quantity: f.quantity ? Number(f.quantity) : null, purchased_on: f.purchased_on || null };
      const d = await api("/api/watchlist", { method: "POST", body: JSON.stringify(body) });
      setItems(d.items); setF({ batch_no: "", drug_name: "", manufacturer: "", quantity: "", purchased_on: "", supplier: "" });
      const added = d.items.find((i: any) => i.batch_no === body.batch_no.trim());
      setErr("");
      setMsg(added?.failed ? `Added. This batch is in a CDSCO failed list. Stop selling it.` : "Added. No failure on record for this batch.");
      // the alert email is sent in the background; refresh the alert list once it has had time
      api("/api/alerts").then((x) => setAlerts(x.items));
      setTimeout(() => api("/api/alerts").then((x) => setAlerts(x.items)).catch(() => {}), 6000);
    } catch (e: any) { setErr(e.message); }
    finally { setAdding(false); }
  }

  async function uploadCSV() {
    const fl = csvRef.current?.files?.[0]; if (!fl) return;
    const fd = new FormData(); fd.append("file", fl);
    setBusy("Reading CSV...");
    try { const d = await api("/api/watchlist/upload", { method: "POST", body: fd }); setItems(d.items); setMsg(`${d.added} medicines added.`); }
    catch (e: any) { setErr(e.message); }
    setBusy(""); if (csvRef.current) csvRef.current.value = "";
  }

  async function readInvoice(kind: "pdf" | "photo") {
    setErr(""); setMsg(""); setPreview(null);
    const fl = (kind === "pdf" ? pdfRef : photoRef).current?.files?.[0]; if (!fl) return;
    const fd = new FormData();
    try {
      if (kind === "pdf") {
        setBusy("Reading the PDF...");
        fd.append("file", fl);
      } else {
        setBusy("Loading photo reader...");
        const T = await loadOCR();
        setBusy("Reading text from the photo (about 10-20 seconds)...");
        const r = await T.recognize(fl, "eng");
        fd.append("text", r.data.text || "");
      }
      setBusy("Finding medicines and batch numbers...");
      const d = await api("/api/watchlist/parse", { method: "POST", body: fd });
      if (!d.items.length) setErr("No batch numbers found. Try a clearer file, or add them one by one.");
      setPreview({ ...d, kind });
      setPicked(Object.fromEntries(d.items.map((_: any, i: number) => [i, true])));
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  async function addPicked() {
    const rows = preview.items.filter((_: any, i: number) => picked[i]).map((i: any) => ({
      batch_no: i.batch_no, drug_name: i.drug_name, manufacturer: i.manufacturer || null,
      quantity: Number(i.quantity) || null, supplier: null,
    }));
    try {
      const d = await api("/api/watchlist/bulk", { method: "POST", body: JSON.stringify({ items: rows, source: preview.kind }) });
      setItems(d.items); setMsg(`${d.added} medicines added from the invoice.`); setPreview(null);
      api("/api/alerts").then((x) => setAlerts(x.items));
    } catch (e: any) { setErr(e.message); }
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

  // supplier report: who sent the failed batches
  const suppliers = useMemo(() => {
    const m = new Map<string, { name: string; total: number; failed: number; returned: number }>();
    (items || []).forEach((i) => {
      const k = (i.supplier || "").trim() || "Supplier not given";
      const r = m.get(k.toLowerCase()) || { name: k, total: 0, failed: 0, returned: 0 };
      r.total += 1;
      if (i.failed) r.failed += 1;
      if (i.status === "returned") r.returned += 1;
      m.set(k.toLowerCase(), r);
    });
    return Array.from(m.values()).sort((a, b) => b.failed - a.failed || b.total - a.total);
  }, [items]);

  const [staffInput, setStaffInput] = useState("");
  const [staffMsg, setStaffMsg] = useState("");
  async function saveStaff(list: string[]) {
    setStaffMsg("");
    try {
      const d = await api("/api/me/settings", { method: "PATCH", body: JSON.stringify({ extra_emails: list }) });
      setSettings(d); setStaffInput("");
    } catch (e: any) { setStaffMsg(e.message); }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="h-display text-4xl md:text-5xl">My stock</h1>
          <p className="mt-1 text-muted">{settings?.organisation || user.name} &middot; checked against every new CDSCO list</p>
          <Link href="/watchlist/report" className="btn-light mt-3 hover:no-underline">Monthly report (PDF)</Link>
        </div>
        {settings && (
          <div className="card px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <span>Email alerts</span>
              <button onClick={toggleEmail} role="switch" aria-checked={settings.email_alerts}
                className={`relative h-6 w-11 rounded-full transition ${settings.email_alerts ? "bg-ink" : "bg-line"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${settings.email_alerts ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <span className="text-muted">{settings.email_alerts ? "On" : "Off"}</span>
            </div>
            <p className="mt-1 max-w-xs text-xs text-muted">
              {settings.email_ready
                ? `Alerts are emailed to ${settings.email}.`
                : "Email sending is not set up yet. Alerts are saved below until it is."}
            </p>
            <div className="mt-3 border-t border-line pt-3">
              <div className="label">Staff who also get alerts (up to 3)</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(settings.extra_emails || []).map((e: string) => (
                  <span key={e} className="chip flex items-center gap-1">{e}
                    <button aria-label={`Remove ${e}`} className="text-muted hover:text-bad" onClick={() => saveStaff(settings.extra_emails.filter((x: string) => x !== e))}>&times;</button>
                  </span>
                ))}
              </div>
              {(settings.extra_emails || []).length < 3 && (
                <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (staffInput.trim()) saveStaff([...(settings.extra_emails || []), staffInput.trim()]); }}>
                  <input className="input h-8 py-1 text-xs" type="email" placeholder="staff@email.com" value={staffInput} onChange={(e) => setStaffInput(e.target.value)} />
                  <button className="btn-light shrink-0 px-3 py-1 text-xs">Add</button>
                </form>
              )}
              {staffMsg && <p className="mt-1 text-xs text-bad">{staffMsg}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="To return" value={stats.toReturn} tone={stats.toReturn ? "bad" : undefined} />
        <Card label="Returned" value={stats.returned} />
        <Card label="In stock" value={stats.inStock} />
        <Card label="High-risk companies in stock" value={stats.highRisk} tone={stats.highRisk ? "warn" : undefined} />
      </div>

      <Box className="mt-4" title="Add medicines">
        <div className="tabs mb-4">
          {([["one", "One batch"], ["csv", "CSV file"], ["pdf", "Invoice PDF"], ["photo", "Invoice photo"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? "tab-on" : ""}`} onClick={() => { setTab(k); setPreview(null); setErr(""); setMsg(""); }}>{l}</button>
          ))}
        </div>

        {tab === "one" && (
          <form onSubmit={addOne} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-2">
              <input className="input min-w-0 flex-1 font-mono" placeholder="Batch number *" required value={f.batch_no} onChange={(e) => setF({ ...f, batch_no: e.target.value })} />
              <ScanButton onResult={(r) => setF((x) => ({ ...x, batch_no: r.batch || r.candidates[0] || x.batch_no,
                drug_name: x.drug_name || r.name || "", manufacturer: x.manufacturer || r.maker || "" }))} />
            </div>
            <input className="input lg:col-span-2" placeholder="Medicine name" value={f.drug_name} onChange={(e) => setF({ ...f, drug_name: e.target.value })} />
            <input className="input" placeholder="Company" value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} />
            <input className="input" placeholder="Quantity" type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
            <input className="input" type="date" title="Bought on" value={f.purchased_on} onChange={(e) => setF({ ...f, purchased_on: e.target.value })} />
            <input className="input sm:col-span-2" placeholder="Supplier" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
            <button className="btn" disabled={adding}>{adding ? "Adding..." : "Add"}</button>
          </form>
        )}
        {tab === "csv" && (
          <div className="text-sm">
            <p className="mb-2 text-muted">Columns: <code>batch_no, drug_name, manufacturer, quantity, purchased_on (YYYY-MM-DD), supplier</code>. Only batch_no is needed.</p>
            <input ref={csvRef} type="file" accept=".csv" onChange={uploadCSV} />
          </div>
        )}
        {tab === "pdf" && (
          <div className="text-sm">
            <p className="mb-2 text-muted">Upload a supplier invoice PDF. The medicines and batch numbers are read from it, and you check them before adding.</p>
            <input ref={pdfRef} type="file" accept=".pdf" onChange={() => readInvoice("pdf")} />
          </div>
        )}
        {tab === "photo" && (
          <div className="text-sm">
            <p className="mb-2 text-muted">Take a clear photo of the invoice, flat and in good light. The text is read on this computer, then the batches are found.</p>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={() => readInvoice("photo")} />
          </div>
        )}

        {busy && <p className="mt-3 text-sm text-muted">{busy}</p>}
        {err && <div className="mt-3"><ErrorNote msg={err} /></div>}
        {msg && <p className="mt-3 text-sm text-ok">{msg}</p>}

        {preview && preview.items.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-3 py-2 text-sm">
              <span>Found {preview.items.length} medicines (read by {preview.read_by}). Untick any that are wrong.</span>
              <button className="btn" onClick={addPicked}>Add {Object.values(picked).filter(Boolean).length} medicines</button>
            </div>
            <Table head={["", "Medicine", "Batch", "Company", "Qty", "CDSCO check"]}>
              {preview.items.map((it: any, i: number) => (
                <tr key={i}>
                  <Td><input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })} /></Td>
                  <Td>{it.drug_name}</Td>
                  <Td className="font-mono">{it.batch_no}</Td>
                  <Td className="text-muted">{it.manufacturer || "-"}</Td>
                  <Td>{it.quantity || "-"}</Td>
                  <Td>{it.failed ? <span className="text-bad">Failed: {it.failed_note}</span> : <span className="text-ok">No failure on record</span>}</Td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Box>

      <Box className="mt-4" title={`Medicines (${shown.length})`}
        right={<div className="flex flex-wrap gap-2">
          <input className="input h-8 w-44 py-1 text-sm" placeholder="Search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          <select className="input h-8 w-auto py-1 text-sm" value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })}>
            <option value="">All months</option>
            {months.map((m) => <option key={m} value={m}>Bought in {month(m + "-01", true)}</option>)}
          </select>
          <select className="input h-8 w-auto py-1 text-sm" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">All</option>
            <option value="failed">Failed, return needed</option>
            <option value="ok">No failure</option>
            <option value="returned">Returned</option>
          </select>
        </div>}>
        {!items ? <Loading /> : shown.length === 0 ? <p className="text-sm text-muted">Nothing to show.</p> : (
          <Table head={["Bought", "Medicine", "Batch", "Company", "Qty", "Status", ""]}>
            {shown.map((w) => (
              <tr key={w.id} className={w.failed && w.status !== "returned" ? "bg-bad-light/40" : ""}>
                <Td className="whitespace-nowrap text-muted">{w.purchased_on ? new Date(w.purchased_on).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-"}</Td>
                <Td>{w.drug_name || "-"}<div className="text-xs text-muted">{w.supplier || ""}</div></Td>
                <Td className="font-mono">{w.batch_no}</Td>
                <Td>
                  {w.company ? <Link href={`/companies/${w.company.id}`}>{w.manufacturer || w.company.name}</Link> : (w.manufacturer || "-")}
                  {w.company && <div className="text-xs text-muted">Risk {w.company.risk_score}% <Band band={w.company.risk_band} /> &middot; {w.company.failures} failed batches</div>}
                </Td>
                <Td className="tabular-nums">{w.quantity ?? "-"}</Td>
                <Td>
                  {w.status === "returned" ? (
                    <div>
                      <span className="text-muted">Returned</span>
                      <button className="btn-light ml-2 px-2 py-0.5 text-xs" onClick={() => setStatus(w.id, "in_stock")}>Undo return</button>
                    </div>
                  )
                    : w.failed ? (
                      <div>
                        <span className="font-medium text-bad">Failed</span> <Danger level={w.record.danger} />
                        <div className="text-xs text-muted">{w.record.category} &middot; in CDSCO list of {month(w.record.report_month)}</div>
                        {w.record.findings?.map((x: string, i: number) => (
                          <div key={i} className="mt-0.5 max-w-xs text-xs font-medium text-bad">{x}</div>
                        ))}
                        {w.record.failure_reason && w.record.failure_reason.toLowerCase() !== w.record.category.toLowerCase() && (
                          <div className="mt-0.5 max-w-xs text-xs text-ink/80">CDSCO says: &ldquo;{w.record.failure_reason.length > 160 ? w.record.failure_reason.slice(0, 160) + "..." : w.record.failure_reason}&rdquo;</div>
                        )}
                        {w.match_note && <div className="text-xs text-muted">Match: {w.match_note}</div>}
                        <div className="mt-1 flex gap-2 text-xs">
                          <Link href={`/letter/${w.record.id}`}>Return letter</Link>
                          <button className="text-brand hover:underline" onClick={() => setStatus(w.id, "returned")}>Mark returned</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-ok">No failure on record</span>
                        {w.mismatch && <div className="text-xs text-muted">Note: {w.mismatch}. Different company, so not the same batch.</div>}
                      </div>
                    )}
                </Td>
                <Td>
                  <button className="text-xs text-muted hover:text-bad" onClick={() => remove(w.id)}>Remove</button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Box>

      <Box className="mt-4" title="Supplier report" right={<span className="text-xs text-muted">Who sent you failed batches</span>}>
        {suppliers.length === 0 ? <p className="text-sm text-muted">Add medicines with a supplier name to see this.</p> : (
          <Table head={["Supplier / distributor", "Batches from them", "Failed", "Returned", ""]}>
            {suppliers.slice(0, 10).map((r) => (
              <tr key={r.name}>
                <Td className={r.name === "Supplier not given" ? "text-muted" : ""}>{r.name}</Td>
                <Td className="tabular-nums">{r.total}</Td>
                <Td className={`tabular-nums ${r.failed ? "font-medium text-bad" : ""}`}>{r.failed}</Td>
                <Td className="tabular-nums">{r.returned}</Td>
                <Td className="w-40">
                  <span className="block h-2 rounded-full bg-sand">
                    <span className="block h-2 rounded-full bg-bad/70" style={{ width: `${r.total ? Math.round((r.failed / r.total) * 100) : 0}%` }} />
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Box>

      <Box className="mt-4" title={`Alerts (${alerts.length})`}>
        {alerts.length === 0 ? <p className="text-sm text-muted">No alerts yet.</p> : (
          <ul className="divide-y divide-line">
            {alerts.map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <button className="text-left hover:underline" onClick={() => setOpen(open === a.id ? null : a.id)}>{a.subject}</button>
                <span className="ml-2 text-xs text-muted">
                  {dateTime(a.sent_at)} &middot; {a.delivery === "sent" ? "emailed" : a.delivery === "off" ? "email alerts off" : a.delivery === "outbox" ? "saved (email not set up)" : "email could not be sent"}
                </span>
                {open === a.id && <pre className="mt-2 whitespace-pre-wrap rounded bg-paper p-3 font-mono text-xs">{a.body}</pre>}
              </li>
            ))}
          </ul>
        )}
      </Box>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" }) {
  const c = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className={`mt-1 text-3xl tracking-[-0.02em] tabular-nums ${c}`}>{value}</div>
    </div>
  );
}
