"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fmt, month, dateTime, looksLikeBatch } from "@/lib/api";
import { Danger, Table, Td, BatchLink, ErrorNote } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => { api("/api/stats").then(setS).catch((e) => setErr(e.message)); }, []);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (t.length < 2) return;
    router.push(looksLikeBatch(t) ? `/batch/${encodeURIComponent(t)}` : `/search?q=${encodeURIComponent(t)}`);
  }

  return (
    <div>
      <section className="rounded-md border border-line bg-white px-6 py-10 md:px-10">
        <h1 className="max-w-2xl text-3xl font-semibold leading-tight text-ink">
          Has your medicine batch failed a quality test?
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Enter the batch number from the strip, or a medicine or company name.
        </p>
        <form onSubmit={go} className="mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row">
          <input className="input text-base" placeholder="Batch number, medicine or company" value={q}
            onChange={(e) => setQ(e.target.value)} autoFocus />
          <button className="btn px-6">Check</button>
        </form>
        <p className="mt-2 text-xs text-muted">Example: <button className="text-brand hover:underline" onClick={() => router.push("/batch/SHT7550")}>SHT7550</button>, paracetamol, Jackson Laboratories</p>
      </section>

      {err && <div className="mt-6"><ErrorNote msg={err} /></div>}

      {s && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Info label="Failed batches on record" value={fmt(s.records)} />
            <Info label="Companies" value={fmt(s.companies)} />
            <Info label="Lists covered" value={`${month(s.first_month)} to ${month(s.last_month)}`} small />
            <Info label="Last updated" value={s.last_update ? dateTime(s.last_update) : "-"} small />
          </div>

          <div className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Latest list: {month(s.last_month, true)}</h2>
              <Link href="/reports" className="text-sm">See all reports</Link>
            </div>
            <div className="rounded-md border border-line bg-white">
              <Table head={["Batch", "Medicine", "Company", "Failed test", "Danger"]}>
                {s.latest.map((r: any) => (
                  <tr key={r.id}>
                    <Td><BatchLink batch={r.batch_no} norm={r.batch_norm} /></Td>
                    <Td className="max-w-xs">{r.drug_name}</Td>
                    <Td><Link href={`/companies/${r.company_id}`}>{r.manufacturer}</Link></Td>
                    <Td className="text-muted">{r.category}</Td>
                    <Td><Danger level={r.danger} /></Td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>

        </>
      )}
    </div>
  );
}

function Info({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-white px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${small ? "text-base" : "text-2xl"}`}>{value}</div>
    </div>
  );
}
