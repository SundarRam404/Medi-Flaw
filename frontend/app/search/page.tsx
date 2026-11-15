"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, month } from "@/lib/api";
import { Danger, Band, Table, Td, BatchLink, Loading, ErrorNote } from "@/components/ui";

function Results() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get("q") || "";
  const [term, setTerm] = useState(q);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setTerm(q);
    setD(null);
    if (q.length >= 2) api(`/api/search?q=${encodeURIComponent(q)}`).then(setD).catch((e) => setErr(e.message));
  }, [q]);

  return (
    <div>
      <form className="flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(term)}`); }}>
        <input className="input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Batch number, medicine or company" />
        <button className="btn">Search</button>
      </form>
      {err && <div className="mt-4"><ErrorNote msg={err} /></div>}
      {!d && !err && <Loading />}
      {d && (
        <div className="mt-6 space-y-6">
          {d.companies.length > 0 && (
            <div>
              <h2 className="h-display mb-3 text-3xl">Companies</h2>
              <div className="card">
                <Table head={["Company", "State", "Failed batches", "Risk"]}>
                  {d.companies.map((c: any) => (
                    <tr key={c.id}>
                      <Td><Link href={`/companies/${c.id}`}>{c.name}</Link></Td>
                      <Td className="text-muted">{c.state || "-"}</Td>
                      <Td>{c.total_failures}</Td>
                      <Td><Band band={c.risk_band} /></Td>
                    </tr>
                  ))}
                </Table>
              </div>
            </div>
          )}
          <div>
            <h2 className="h-display mb-3 text-3xl">Failed batches {d.records.length === 50 ? "(first 50)" : `(${d.records.length})`}</h2>
            {d.records.length === 0 ? (
              <p className="text-muted">No failed batches match "{q}".</p>
            ) : (
              <div className="card">
                <Table head={["Batch", "Medicine", "Company", "List", "Failed test", "Danger"]}>
                  {d.records.map((r: any) => (
                    <tr key={r.id}>
                      <Td><BatchLink batch={r.batch_no} norm={r.batch_norm} /></Td>
                      <Td className="max-w-xs">{r.drug_name}</Td>
                      <Td><Link href={`/companies/${r.company_id}`}>{r.manufacturer}</Link></Td>
                      <Td className="whitespace-nowrap text-muted">{month(r.report_month)}</Td>
                      <Td className="text-muted">{r.category}</Td>
                      <Td><Danger level={r.danger} /></Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<Loading />}><Results /></Suspense>;
}
