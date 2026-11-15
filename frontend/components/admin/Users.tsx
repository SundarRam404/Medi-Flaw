"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { api, dateTime, month } from "@/lib/api";
import { Loading, ErrorNote, Danger } from "@/components/ui";
import Avatar from "@/components/Avatar";

const EVENT: Record<string, string> = {
  signup: "Signed up", login: "Logged in", logout: "Logged out", login_failed: "Wrong password", password_changed: "Changed password", password_reset: "Set password with email code",
};

function ago(d?: string | null) {
  if (!d) return "-";
  const t = new Date(d.endsWith("Z") ? d : d + "Z").getTime();
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return dateTime(d);
}

function nextCheck() {
  const n = new Date(), t = new Date();
  t.setHours(21, 0, 0, 0);
  if (n >= t) t.setDate(t.getDate() + 1);
  return t.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Users() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [det, setDet] = useState<any>(null);

  const load = () => api("/api/admin/users").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    setDet(null);
    if (open != null) api(`/api/admin/users/${open}`).then(setDet).catch((e) => setErr(e.message));
  }, [open]);

  const rows = useMemo(() => (d?.items || []).filter((u: any) =>
    (!kind || (kind === "admin" ? u.role === "admin" : u.account_type === kind && u.role !== "admin")) &&
    (!q || [u.name, u.email, u.organisation].some((x: string) => (x || "").toLowerCase().includes(q.toLowerCase())))), [d, q, kind]);

  if (err) return <ErrorNote msg={err} />;
  if (!d) return <Loading />;
  const all = d.items;
  const total = (f: (u: any) => number) => all.reduce((a: number, u: any) => a + f(u), 0);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Users", all.length], ["Pharmacies", all.filter((u: any) => u.account_type === "business" && u.role !== "admin").length],
          ["Personal", all.filter((u: any) => u.account_type === "personal").length], ["Medicines saved", total((u) => u.medicines)],
          ["Alerts sent", total((u) => u.alerts)]].map(([l, v]) => (
          <div key={l as string} className="card px-4 py-3"><div className="label">{l}</div><div className="mt-1 text-2xl tabular-nums">{v}</div></div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Next automatic check of every list: <b className="font-medium text-ink">{nextCheck()}</b> (daily at 9 PM). Unconfirmed alerts get one reminder after {d.followup_days} days.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search name, email or shop" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Everyone</option><option value="business">Pharmacy &amp; Business</option>
          <option value="personal">Personal</option><option value="admin">Admins</option>
        </select>
      </div>

      <div className="card mt-3 overflow-x-auto p-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              {["User", "Type", "Sign-in", "Joined", "Last login", "Last logout", "Medicines", "Alerts", "Next reminder", "Emails"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">{h}</th>))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {rows.map((u: any) => (
              <Fragment key={u.id}>
                <tr className={`cursor-pointer transition hover:bg-paper ${open === u.id ? "bg-paper" : ""}`} onClick={() => setOpen(open === u.id ? null : u.id)}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={u} size={30} />
                      <div className="min-w-0"><div className="truncate font-medium">{u.name}{u.role === "admin" && <span className="ml-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[10px] text-white">admin</span>}</div>
                        <div className="truncate text-xs text-muted">{u.email}</div></div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{u.account_type === "personal" ? "Personal" : "Pharmacy"}{u.organisation && <div className="text-xs text-muted">{u.organisation}</div>}</td>
                  <td className="px-3 py-2.5">{u.auth_provider === "google" ? "Google" : u.auth_provider === "google+password" ? "Google + email" : "Email"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">{ago(u.joined)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{ago(u.last_login)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">{ago(u.last_logout)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{u.medicines}{u.failed_in_stock > 0 && <span className="ml-1.5 rounded-full bg-bad-light px-1.5 text-xs text-bad">{u.failed_in_stock} failed</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{u.alerts}{u.alerts > 0 && <span className="text-xs text-muted"> ({u.alerts_confirmed} confirmed)</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{u.next_reminder ? dateTime(u.next_reminder) : "-"}</td>
                  <td className="px-3 py-2.5">{u.email_alerts ? <span className="text-ok">On</span> : <span className="text-muted">Off</span>}</td>
                </tr>
                {open === u.id && (
                  <tr><td colSpan={10} className="bg-paper px-3 pb-4 pt-1">
                    {!det ? <Loading /> : <Detail d={det} onDeleted={() => { setOpen(null); load(); }} />}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-muted">No users match.</p>}
      </div>
    </div>
  );
}

function Detail({ d, onDeleted }: { d: any; onDeleted: () => void }) {
  const u = d.user;
  const [ask, setAsk] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function del() {
    setBusy(true); setMsg("");
    try { await api(`/api/admin/users/${u.id}`, { method: "DELETE" }); onDeleted(); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="card p-4 text-sm lg:col-span-2">
        <div className="mb-2 font-medium">Medicines ({d.medicines.length})</div>
        {d.medicines.length === 0 ? <p className="text-muted">Nothing saved yet.</p> : (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-line text-left text-muted">
                <th className="py-1.5 pr-2 font-medium">Medicine</th><th className="py-1.5 pr-2 font-medium">Batch</th>
                <th className="py-1.5 pr-2 font-medium">{u.account_type === "personal" ? "Taken by" : "Supplier"}</th>
                <th className="py-1.5 pr-2 font-medium">Added</th><th className="py-1.5 font-medium">Status</th></tr></thead>
              <tbody className="divide-y divide-line/70">
                {d.medicines.map((m: any) => (
                  <tr key={m.id}>
                    <td className="py-1.5 pr-2">{m.drug_name || "-"}</td>
                    <td className="py-1.5 pr-2 font-mono">{m.batch_no}</td>
                    <td className="py-1.5 pr-2">{(u.account_type === "personal" ? m.taken_by : m.supplier) || "-"}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-muted">{dateTime(m.added)}</td>
                    <td className="py-1.5">{m.status === "returned" ? <span className="text-muted">Returned</span>
                      : m.failed ? <span className="flex items-center gap-1"><span className="text-bad">Failed</span><Danger level={m.record.danger} /><span className="text-muted">{month(m.record.report_month)}</span></span>
                      : <span className="text-ok">Clear</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mb-2 mt-4 font-medium">Alert emails ({d.alerts.length})</div>
        {d.alerts.length === 0 ? <p className="text-muted">No alerts yet. One is sent the day a saved batch appears in a CDSCO list.</p> : (
          <ul className="space-y-1.5 text-xs">
            {d.alerts.map((a: any) => (
              <li key={a.id} className="rounded-lg bg-white px-3 py-2">
                <div className="font-medium">{a.subject}</div>
                <div className="mt-0.5 text-muted">
                  Sent {dateTime(a.sent_at)} &middot; {a.delivery === "sent" ? "delivered" : a.delivery === "off" ? "email off" : a.delivery}
                  {" "}&middot; {a.acknowledged_at ? <span className="text-ok">confirmed {dateTime(a.acknowledged_at)}</span>
                    : a.followup_at ? `reminder sent ${dateTime(a.followup_at)}`
                    : a.reminder_due ? `reminder due ${dateTime(a.reminder_due)}` : "not confirmed"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <div className="card p-4 text-sm">
          <div className="mb-2 font-medium">Account</div>
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-muted">Joined</dt><dd>{dateTime(u.joined)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Sign-in</dt><dd>{u.auth_provider === "google" ? "Google" : u.auth_provider === "google+password" ? "Google or email" : "Email + password"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Email alerts</dt><dd>{u.email_alerts ? "On" : "Off"}</dd></div>
            {u.extra_emails?.length > 0 && <div><dt className="text-muted">Staff emails</dt><dd>{u.extra_emails.join(", ")}</dd></div>}
          </dl>
          <a href={`mailto:${u.email}`} className="btn-light mt-3 w-full py-1.5 text-xs hover:no-underline">Email this user</a>
          {u.role !== "admin" && (!ask ? (
            <button onClick={() => setAsk(true)} className="mt-2 w-full rounded-full border border-bad/30 py-1.5 text-xs text-bad hover:bg-bad-light">Delete this account</button>
          ) : (
            <div className="mt-2 rounded-xl border border-bad/30 bg-bad-light p-3 text-xs">
              <p className="text-bad">This deletes <b>{u.email}</b>, their {d.medicines.length} medicines, {d.alerts.length} alerts and history. It cannot be undone.</p>
              <p className="mt-2 text-muted">Type the email to confirm:</p>
              <input className="input mt-1 py-1.5 text-xs" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={u.email} />
              {msg && <p className="mt-1 text-bad">{msg}</p>}
              <div className="mt-2 flex gap-2">
                <button className="btn-light flex-1 py-1 text-xs" onClick={() => { setAsk(false); setTyped(""); }}>Cancel</button>
                <button className="flex-1 rounded-full bg-bad py-1 text-xs text-white disabled:opacity-40" disabled={busy || typed.trim().toLowerCase() !== u.email.toLowerCase()} onClick={del}>
                  {busy ? "Deleting..." : "Delete forever"}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="card p-4 text-sm">
          <div className="mb-2 font-medium">Activity</div>
          {d.events.length === 0 ? <p className="text-xs text-muted">No activity recorded yet (tracking started with this update).</p> : (
            <ul className="max-h-60 space-y-1 overflow-auto text-xs">
              {d.events.map((e: any, i: number) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className={e.kind === "login_failed" ? "text-bad" : ""}>{EVENT[e.kind] || e.kind}{e.method ? ` (${e.method})` : ""}</span>
                  <span className="whitespace-nowrap text-muted">{dateTime(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
