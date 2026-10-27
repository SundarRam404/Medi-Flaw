"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, month } from "@/lib/api";
import { Band, PageTitle, Table, Td, Pager, Loading, ErrorNote } from "@/components/ui";

export default function Companies() {
  const [sort, setSort] = useState("risk");
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/api/companies?sort=${sort}&q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}&period=${period}&page=${page}&size=50`)
        .then(setD).catch((e) => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [sort, q, state, period, page]);

  return (
    <div>
      <PageTitle title="Companies"
        sub="Every manufacturer with at least one failed batch. Risk is the chance of another failed batch in the next 6 months, based on its past record." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Company name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input w-auto" value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}>
          <option value="">All states</option>
          {d?.states?.map((s: string) => <option key={s}>{s}</option>)}
        </select>
        <select className="input w-auto" value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }}>
          <option value="all">All time</option>
          <option value="year">This year</option>
          <option value="1m">Last month</option>
          <option value="3m">Last 3 months</option>
          <option value="6m">Last 6 months</option>
          <option value="1y">Last 1 year</option>
          <option value="2y">Last 2 years</option>
          <option value="3y">Last 3 years</option>
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          <option value="risk">Sort by risk</option>
          <option value="failures">Sort by failed batches</option>
          <option value="repeat">Sort by repeat score</option>
          <option value="recent">Most recent failure</option>
          <option value="name">Name A-Z</option>
        </select>
      </div>
      {d?.period && (
        <p className="mb-2 text-sm text-muted">
          {d.period.from
            ? <>Failed batches in CDSCO lists from <b className="text-ink">{month(d.period.from, true)}</b> to <b className="text-ink">{month(d.period.to, true)}</b> &middot; {d.total} companies</>
            : <>All CDSCO lists on record, up to <b className="text-ink">{month(d.period.to, true)}</b> &middot; {d.total} companies</>}
        </p>
      )}
      {err && <ErrorNote msg={err} />}
      {!d ? <Loading /> : (
        <div className="rounded-md border border-line bg-white p-2">
          <Table head={["Company", "State", period === "all" ? "Failed batches" : "Failed in period", "Last failure", "Repeat score", "Risk (6 months)"]}>
            {d.items.map((c: any) => (
              <tr key={c.id}>
                <Td><Link href={`/companies/${c.id}`}>{c.name}</Link></Td>
                <Td className="text-muted">{c.state || "-"}</Td>
                <Td className="tabular-nums">{c.period_failures}{period !== "all" && <span className="text-xs text-muted"> of {c.total_failures}</span>}</Td>
                <Td className="whitespace-nowrap text-muted">{month(c.last_month)}</Td>
                <Td className="tabular-nums">{Math.round(c.repeat_score)}</Td>
                <Td className="whitespace-nowrap tabular-nums">{c.risk_score}% <Band band={c.risk_band} /></Td>
              </tr>
            ))}
          </Table>
          <div className="px-2 pb-2"><Pager page={page} total={d.total} size={50} onPage={setPage} /></div>
        </div>
      )}
    </div>
  );
}
