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
      <section className="relative overflow-hidden border-2 border-ink bg-white px-6 py-12 md:px-12 md:py-16">
        <div aria-hidden className="absolute -bottom-20 -right-20 h-64 w-64 bg-brand md:h-80 md:w-80" />
        <div className="relative">
          <p className="label text-brand">CDSCO drug quality alerts &middot; India</p>
          <h1 className="h-display mt-3 max-w-3xl text-5xl md:text-7xl">
            Has your medicine batch failed?
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Type the batch number printed on the strip, or a medicine or company name.
          </p>
          <form onSubmit={go} className="mt-7 flex max-w-2xl flex-col gap-2 sm:flex-row">
            <input className="input h-14 text-lg" placeholder="Batch number, medicine or company" value={q}
              onChange={(e) => setQ(e.target.value)} autoFocus />
            <button className="btn h-14 px-8 text-base">Check</button>
          </form>
          <p className="mt-3 text-sm text-muted">
            Try: <button className="font-mono font-semibold text-ink underline decoration-brand decoration-2 underline-offset-[3px] hover:text-brand" onClick={() => router.push("/batch/SHT7550")}>SHT7550</button>
            {" "}&middot; <button className="font-semibold text-ink underline decoration-brand decoration-2 underline-offset-[3px] hover:text-brand" onClick={() => router.push("/search?q=paracetamol")}>paracetamol</button>
            {" "}&middot; <button className="font-semibold text-ink underline decoration-brand decoration-2 underline-offset-[3px] hover:text-brand" onClick={() => router.push("/search?q=Jackson%20Laboratories")}>Jackson Laboratories</button>
          </p>
        </div>
      </section>

      {err && <div className="mt-6"><ErrorNote msg={err} /></div>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-[2px] border-x-2 border-b-2 border-ink bg-ink md:grid-cols-4">
            <Info label="Failed batches on record" value={fmt(s.records)} dark />
            <Info label="Companies" value={fmt(s.companies)} />
            <Info label="Lists covered" value={`${month(s.first_month)} – ${month(s.last_month)}`} small />
            <Info label="Last updated" value={s.last_update ? dateTime(s.last_update) : "-"} small />
          </div>

          <div className="mt-12">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b-4 border-ink pb-3">
              <h2 className="h-display text-3xl">Latest list: {month(s.last_month, true)}</h2>
              <Link href="/reports" className="text-sm font-bold uppercase tracking-wide">See all reports &rarr;</Link>
            </div>
            <Table head={["Batch", "Medicine", "Company", "Failed test", "Danger"]}>
              {s.latest.map((r: any) => (
                <tr key={r.id} className="hover:bg-paper">
                  <Td><BatchLink batch={r.batch_no} norm={r.batch_norm} /></Td>
                  <Td className="max-w-xs">{r.drug_name}</Td>
                  <Td><Link href={`/companies/${r.company_id}`}>{r.manufacturer}</Link></Td>
                  <Td className="text-muted">{r.category}</Td>
                  <Td><Danger level={r.danger} /></Td>
                </tr>
              ))}
            </Table>
          </div>

          <div className="mt-12 grid gap-[2px] border-2 border-ink bg-ink md:grid-cols-3">
            <How n="01" t="Check a batch" d="Search any batch number against every CDSCO failed-quality list." />
            <How n="02" t="Watch your stock" d="Add the batches you buy. You get an email if one fails later." />
            <How n="03" t="Know the company" d="See each maker's failure history and its risk of failing again." />
          </div>
        </>
      )}
    </div>
  );
}

function Info({ label, value, small, dark }: { label: string; value: string; small?: boolean; dark?: boolean }) {
  return (
    <div className={`px-5 py-4 ${dark ? "bg-ink text-white" : "bg-white"}`}>
      <div className={`label ${dark ? "text-white/70" : ""}`}>{label}</div>
      <div className={`mt-1 font-extrabold tracking-[-0.02em] tabular-nums ${small ? "text-lg" : "text-4xl"}`}>{value}</div>
    </div>
  );
}

function How({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="bg-white p-6">
      <div className="text-5xl font-extrabold text-brand">{n}</div>
      <h3 className="mt-3 text-lg font-extrabold uppercase tracking-wide">{t}</h3>
      <p className="mt-1 text-sm text-muted">{d}</p>
    </div>
  );
}
