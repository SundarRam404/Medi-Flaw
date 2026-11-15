"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fmt, month, dateTime, looksLikeBatch, getUser } from "@/lib/api";
import { Danger, Table, Td, BatchLink, ErrorNote } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => { setUser(getUser()); api("/api/stats").then(setS).catch((e) => setErr(e.message)); }, []);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (t.length < 2) return;
    router.push(looksLikeBatch(t) ? `/batch/${encodeURIComponent(t)}` : `/search?q=${encodeURIComponent(t)}`);
  }
  const ex = "text-ink underline decoration-[#d9b8a6] underline-offset-4 hover:decoration-brand";

  return (
    <div>
      <section className="relative overflow-hidden">
        <img src="/landscape.svg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-44 text-center md:pb-32 md:pt-56">
          <p className="mx-auto inline-block rounded-full bg-white/60 px-3 py-1 text-xs text-ink backdrop-blur">
            Live data from CDSCO drug quality alerts, India
          </p>
          <h1 className="h-display mx-auto mt-5 max-w-3xl text-5xl md:text-7xl">
            Has your medicine batch failed?
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-[#5b4d47]">
            Type the batch number printed on the strip, or a medicine or company name.
          </p>
          <form onSubmit={go} className="mx-auto mt-8 flex max-w-2xl items-center rounded-full bg-white p-1.5 shadow-soft">
            <input className="min-w-0 flex-1 bg-transparent px-5 py-3 text-base text-ink outline-none placeholder:text-[#a8988f]"
              placeholder="Batch number, medicine or company" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <button className="btn px-7 py-3 text-base">Check</button>
          </form>
          <p className="mt-4 text-sm text-[#5b4d47]">
            Try <button className={`font-mono ${ex}`} onClick={() => router.push("/batch/SHT7550")}>SHT7550</button>,{" "}
            <button className={ex} onClick={() => router.push("/search?q=paracetamol")}>paracetamol</button> or{" "}
            <button className={ex} onClick={() => router.push("/search?q=Jackson%20Laboratories")}>Jackson Laboratories</button>
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        {err && <div className="mt-6"><ErrorNote msg={err} /></div>}

        {s && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Info label="Failed batches on record" value={fmt(s.records)} />
              <Info label="Companies" value={fmt(s.companies)} />
              <Info label="Lists covered" value={`${month(s.first_month)} – ${month(s.last_month)}`} small />
              <Info label="Last updated" value={s.last_update ? dateTime(s.last_update) : "-"} small />
            </div>

            <div className="mt-14">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <h2 className="h-display text-3xl md:text-4xl">Latest list: {month(s.last_month, true)}</h2>
                <Link href="/reports" className="text-sm">See all reports &rarr;</Link>
              </div>
              <div className="card overflow-hidden p-2">
                <Table head={["Batch", "Medicine", "Company", "Failed test", "Danger"]}>
                  {s.latest.map((r: any) => (
                    <tr key={r.id} className="transition hover:bg-paper">
                      <Td><BatchLink batch={r.batch_no} norm={r.batch_norm} /></Td>
                      <Td className="max-w-xs">{r.drug_name}</Td>
                      <Td><Link href={`/companies/${r.company_id}`} className="text-ink">{r.manufacturer}</Link></Td>
                      <Td className="text-muted">{r.category}</Td>
                      <Td><Danger level={r.danger} /></Td>
                    </tr>
                  ))}
                </Table>
              </div>
            </div>
          </>
        )}

        <div className="mt-14 grid gap-3 md:grid-cols-3">
          <How n="1" t="Check a batch" d="Search any batch number against every CDSCO failed-quality list since 2022." />
          <How n="2" t="Watch what you hold" d="Save your batches. You get an email the day one of them fails a test." />
          <How n="3" t="Know the company" d="See each maker's failure history and its chance of failing again." />
        </div>

        {!user && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-sand px-6 py-5">
            <p className="text-sm text-[#5b4d47]">You are using Medi-Flaw without an account. Nothing is saved.</p>
            <Link href="/welcome" className="btn hover:no-underline">Create a free account</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="card px-5 py-4">
      <div className="label">{label}</div>
      <div className={`mt-1 tracking-[-0.02em] tabular-nums ${small ? "text-lg" : "text-3xl"}`}>{value}</div>
    </div>
  );
}

function How({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="card p-6">
      <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-light text-sm font-medium text-brand">{n}</div>
      <h3 className="mt-4 text-lg font-medium">{t}</h3>
      <p className="mt-1 text-sm text-muted">{d}</p>
    </div>
  );
}
