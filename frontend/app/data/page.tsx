"use client";
import { useEffect, useState } from "react";
import { api, fmt, month } from "@/lib/api";
import { Box, PageTitle, Table, Td, Pager, Loading, ErrorNote, Danger } from "@/components/ui";

const FIELDS = [
  ["", "All fields"], ["manufacturer", "Company name"], ["failure_reason", "Failure reason"],
  ["batch_no", "Batch number"], ["drug_name", "Medicine name"], ["testing_lab", "Testing lab"],
  ["reporting_source", "Source"], ["mfg_date", "Manufacture date"], ["expiry_date", "Expiry date"],
  ["state", "State"], ["row", "Duplicates removed"],
];

export default function DataPage() {
  const [sum, setSum] = useState<any>(null);
  const [tab, setTab] = useState<"raw" | "clean" | "changes">("raw");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [field, setField] = useState("");
  const [rawId, setRawId] = useState<number | null>(null);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => { api("/api/data/summary").then(setSum).catch((e) => setErr(e.message)); }, []);

  useEffect(() => {
    setD(null);
    const t = setTimeout(() => {
      const url = tab === "changes"
        ? `/api/data/changes?page=${page}&size=25&field=${field}${rawId ? `&raw_id=${rawId}` : ""}`
        : `/api/data/${tab}?page=${page}&size=25&q=${encodeURIComponent(q)}`;
      api(url).then(setD).catch((e) => setErr(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [tab, page, q, field, rawId]);

  function show(t: any) { setTab(t); setPage(1); }
  function changesFor(id: number) { setRawId(id); setField(""); setTab("changes"); setPage(1); }

  return (
    <div>
      <PageTitle title="Data" sub="The records exactly as CDSCO published them, the cleaned version we use, and every change made in between." />
      {err && <ErrorNote msg={err} />}

      {sum && (
        <Box title="Before and after cleaning">
          <div className="overflow-x-auto">
            <table className="w-full max-w-3xl text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-medium"></th>
                  <th className="py-2 pr-4 font-medium">As published</th>
                  <th className="py-2 pr-4 font-medium">After cleaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <Cmp k="Rows" a={sum.raw_rows} b={sum.clean_rows} note={`${sum.duplicates} duplicates removed`} />
                <Cmp k="Company names" a={sum.raw_company_spellings} b={sum.companies} note="Address removed, spellings merged" />
                <Cmp k="Failure reasons" a={sum.raw_reasons} b={sum.categories} note="Grouped into failure types" />
                <Cmp k="Testing lab names" a={sum.raw_labs} b={sum.labs} note="Same lab written differently" />
                <Cmp k="Source labels" a={sum.raw_sources.length} b={sum.sources.length}
                  note={sum.raw_sources.map((x: any) => x.value).join(", ")} />
              </tbody>
            </table>
          </div>
          <h3 className="label mb-2 mt-5 text-ink">Changes made</h3>
          <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {sum.changes_by_rule.map((c: any, i: number) => (
              <div key={i} className="flex justify-between border-b border-line/60 py-1">
                <span className="text-muted">{(FIELDS.find((f) => f[0] === c.field)?.[1] || c.field)}: {c.rule.toLowerCase()}</span><span className="tabular-nums">{fmt(c.count)}</span>
              </div>
            ))}
          </div>
        </Box>
      )}

      <div className="tabs mt-8">
        <button className={`tab ${tab === "raw" ? "tab-on" : ""}`} onClick={() => show("raw")}>As published</button>
        <button className={`tab ${tab === "clean" ? "tab-on" : ""}`} onClick={() => show("clean")}>Cleaned</button>
        <button className={`tab ${tab === "changes" ? "tab-on" : ""}`} onClick={() => { setRawId(null); show("changes"); }}>Changes</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tab !== "changes" ? (
          <input className="input max-w-sm" placeholder="Filter by company, medicine or batch" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        ) : (
          <>
            <select className="input w-auto" value={field} onChange={(e) => { setField(e.target.value); setPage(1); }}>
              {FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {rawId && <span className="text-sm">Showing row #{rawId} <button className="ml-1 text-brand" onClick={() => setRawId(null)}>show all</button></span>}
          </>
        )}
      </div>

      <div className="mt-3 card p-2">
        {!d ? <Loading /> : tab === "raw" ? (
          <>
            <Table head={["#", "List", "Medicine", "Batch", "Mfg", "Expiry", "Manufacturer (as written)", "Reason", "Source", "Lab", ""]}>
              {d.rows.map((r: any) => (
                <tr key={r.id} className="text-xs">
                  <Td className="text-muted">{r.id}</Td>
                  <Td className="whitespace-nowrap">{r.source_month}</Td>
                  <Td className="max-w-[12rem] whitespace-pre-wrap">{r.drug_name}</Td>
                  <Td className="font-mono">{r.batch_no}</Td>
                  <Td className="whitespace-nowrap">{r.mfg_date}</Td>
                  <Td className="whitespace-nowrap">{r.expiry_date}</Td>
                  <Td className="max-w-[18rem]">{r.manufacturer_raw}</Td>
                  <Td className="max-w-[12rem] whitespace-pre-wrap">{r.failure_reason}</Td>
                  <Td>{r.reporting_source}</Td>
                  <Td>{r.testing_lab}</Td>
                  <Td><button className="whitespace-nowrap text-brand hover:underline" onClick={() => changesFor(r.id)}>Changes</button></Td>
                </tr>
              ))}
            </Table>
            <div className="px-2 pb-1"><Pager page={page} total={d.total} size={25} onPage={setPage} /></div>
          </>
        ) : tab === "clean" ? (
          <>
            <Table head={["#", "List", "Medicine", "Batch", "Mfg", "Expiry", "Company", "State", "Failure type", "Danger", "Source", "Lab"]}>
              {d.rows.map((r: any) => (
                <tr key={r.id} className="text-xs">
                  <Td className="text-muted">{r.raw_id}</Td>
                  <Td className="whitespace-nowrap">{month(r.report_month)}</Td>
                  <Td className="max-w-[12rem]">{r.drug_name}</Td>
                  <Td className="font-mono">{r.batch_norm}</Td>
                  <Td className="whitespace-nowrap">{r.mfg_date || "-"}</Td>
                  <Td className="whitespace-nowrap">{r.expiry_date || "-"}</Td>
                  <Td>{r.manufacturer}</Td>
                  <Td>{r.state || "-"}</Td>
                  <Td>{r.category}</Td>
                  <Td><Danger level={r.danger} /></Td>
                  <Td>{r.reporting_source}</Td>
                  <Td>{r.testing_lab}</Td>
                </tr>
              ))}
            </Table>
            <div className="px-2 pb-1"><Pager page={page} total={d.total} size={25} onPage={setPage} /></div>
          </>
        ) : (
          <>
            <Table head={["Row", "Field", "Before", "After", "Why"]}>
              {d.rows.map((r: any, i: number) => (
                <tr key={i} className="text-xs">
                  <Td className="text-muted">{r.raw_id}</Td>
                  <Td>{r.field}</Td>
                  <Td className="max-w-[20rem] whitespace-pre-wrap text-bad/80">{r.before ?? <i className="text-muted">empty</i>}</Td>
                  <Td className="max-w-[16rem] text-ok">{r.after ?? <i className="text-muted">empty</i>}</Td>
                  <Td className="text-muted">{r.rule}</Td>
                </tr>
              ))}
            </Table>
            <div className="px-2 pb-1"><Pager page={page} total={d.total} size={25} onPage={setPage} /></div>
          </>
        )}
      </div>
    </div>
  );
}

function Cmp({ k, a, b, note }: { k: string; a: number; b: number; note: string }) {
  return (
    <tr>
      <td className="py-2 pr-4 font-medium">{k}</td>
      <td className="py-2 pr-4 tabular-nums">{fmt(a)}</td>
      <td className="py-2 pr-4 tabular-nums">{fmt(b)} <span className="ml-2 text-xs text-muted">{note}</span></td>
    </tr>
  );
}
