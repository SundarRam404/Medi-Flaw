"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api, month } from "@/lib/api";
import { Danger, Band, Box, Stat, Table, Td, BatchLink, Loading, ErrorNote } from "@/components/ui";

export default function Company({ params }: { params: { id: string } }) {
  const [c, setC] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api(`/api/companies/${params.id}`).then(setC).catch((e) => setErr(e.message)); }, [params.id]);
  if (err) return <ErrorNote msg={err} />;
  if (!c) return <Loading />;
  const maxCat = Math.max(...c.by_category.map((x: any) => x.count));

  return (
    <div>
      <Link href="/companies" className="text-sm">&larr; All companies</Link>
      <h1 className="mt-3 text-2xl font-semibold">{c.name}</h1>
      <p className="text-muted">{c.state || "State not known"} &middot; failures from {month(c.first_month)} to {month(c.last_month)}</p>
      {c.aliases.length > 0 && <p className="mt-1 text-xs text-muted">Also written as: {c.aliases.join("; ")}</p>}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Failed batches" value={c.total_failures} />
        <Stat label="Repeat score" value={`${Math.round(c.repeat_score)}/100`} note="How often, how recent, same fault again" />
        <Stat label="Risk, next 6 months" value={`${c.risk_score}%`} note={`${c.risk_band} risk`} />
        <Stat label="Unusual months" value={c.spikes.length} note="Far more failures than usual" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Box title="Failed batches per year">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={c.by_year}>
                <CartesianGrid stroke="#eceef0" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
                <Tooltip />
                <Bar dataKey="count" name="Failed batches" fill="#0f5c4c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Box>
        <Box title="Why this risk score">
          <p className="mb-3 text-sm text-muted">The main things in this company's record that moved the score:</p>
          <ul className="space-y-1.5 text-sm">
            {c.risk_reasons.map((r: string, i: number) => (
              <li key={i} className={r.includes("raises") ? "text-ink" : "text-muted"}>
                <span className={`mr-2 inline-block w-3 ${r.includes("raises") ? "text-bad" : "text-ok"}`}>{r.includes("raises") ? "+" : "-"}</span>
                {r.replace(/ \((raises|lowers) risk\)/, "")}
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Failure types</h3>
          <div className="space-y-1.5">
            {c.by_category.map((x: any) => (
              <div key={x.category} className="flex items-center gap-2 text-sm">
                <span className="w-36 shrink-0 text-muted">{x.category}</span>
                <span className="h-2.5 rounded-sm bg-brand/70" style={{ width: `${(x.count / maxCat) * 60}%` }} />
                <span className="tabular-nums">{x.count}</span>
              </div>
            ))}
          </div>
        </Box>
      </div>

      {c.spikes.length > 0 && (
        <Box title="Unusual months" className="mt-4">
          <p className="mb-2 text-sm text-muted">Months where this company had far more failed batches than its own usual level.</p>
          <ul className="text-sm">
            {c.spikes.map((s: any) => (
              <li key={s.month}>{month(s.month, true)}: {s.failures} failed batches ({s.usual ? `usual about ${s.usual} a month` : "no earlier failures"})</li>
            ))}
          </ul>
        </Box>
      )}

      <Box title={`All failed batches (${c.records.length})`} className="mt-4">
        <Table head={["List", "Batch", "Medicine", "Failed test", "Danger"]}>
          {c.records.map((r: any) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap text-muted">{month(r.report_month)}</Td>
              <Td><BatchLink batch={r.batch_no} norm={r.batch_norm} /></Td>
              <Td className="max-w-xs">{r.drug_name}</Td>
              <Td className="max-w-xs text-muted">{r.failure_reason}</Td>
              <Td><Danger level={r.danger} /></Td>
            </tr>
          ))}
        </Table>
      </Box>
    </div>
  );
}
