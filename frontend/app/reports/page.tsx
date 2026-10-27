"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api, month, fmt } from "@/lib/api";
import { Box, PageTitle, Stat, Table, Td, Band, Loading, ErrorNote } from "@/components/ui";

export default function Reports() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/api/insights").then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <ErrorNote msg={err} />;
  if (!d) return <Loading />;
  const dz = Object.fromEntries(d.per_danger.map((x: any) => [x.danger, x.count]));
  const r = d.repeat;

  return (
    <div>
      <PageTitle title="Reports" sub="What the CDSCO lists show across all months on record." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Failed batches" value={fmt(r.total)} />
        <Stat label="HIGH danger" value={fmt(dz.HIGH)} note="Sterility, fake, particles, microbes" />
        <Stat label="Companies failing more than once" value={fmt(r.repeat_cos)} note={`out of ${fmt(r.cos)}`} />
        <Stat label="Batches from repeat companies" value={`${Math.round((r.from_repeat / r.total) * 100)}%`} />
      </div>

      <Box title="Failed batches per month" className="mt-4">
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={d.per_month}>
              <CartesianGrid stroke="#eceef0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={5} />
              <YAxis tick={{ fontSize: 12 }} width={35} />
              <Tooltip labelFormatter={(m) => month(m as string, true)} />
              <Line type="monotone" dataKey="count" name="Failed batches" stroke="#0f5c4c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Box>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Box title="Per year">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={d.per_year}>
                <CartesianGrid stroke="#eceef0" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={35} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="All" fill="#0f5c4c" />
                <Bar dataKey="high" name="HIGH danger" fill="#b3261e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Box>
        <Box title="By failure type">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={d.per_category} layout="vertical" margin={{ left: 30 }}>
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={110} interval={0} />
                <Tooltip />
                <Bar dataKey="count" name="Failed batches" fill="#0f5c4c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Box>
        <Box title="By manufacturer's state (top 15)">
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={d.per_state} layout="vertical" margin={{ left: 30 }}>
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="state" tick={{ fontSize: 11 }} width={120} interval={0} />
                <Tooltip />
                <Bar dataKey="count" name="Failed batches" fill="#4a7d72" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Box>
        <Box title="Most failed batches">
          <Table head={["Company", "Failed", "Risk"]}>
            {d.top_companies.map((c: any) => (
              <tr key={c.id}>
                <Td><Link href={`/companies/${c.id}`}>{c.name}</Link><div className="text-xs text-muted">{c.state}</div></Td>
                <Td className="tabular-nums">{c.total_failures}</Td>
                <Td><Band band={c.risk_band} /></Td>
              </tr>
            ))}
          </Table>
        </Box>
      </div>

      <Box title="Unusual months" className="mt-4">
        <p className="mb-3 text-sm text-muted">
          Months where a company had far more failed batches than its own usual level. Found with an Isolation Forest model.
        </p>
        <Table head={["Month", "Company", "Failed that month", "Usual per month"]}>
          {d.spikes.map((s: any, i: number) => (
            <tr key={i}>
              <Td className="whitespace-nowrap">{month(s.month, true)}</Td>
              <Td><Link href={`/companies/${s.company_id}`}>{s.name}</Link></Td>
              <Td className="tabular-nums font-medium">{s.failures}</Td>
              <Td className="tabular-nums text-muted">{s.usual ? s.usual : "No earlier failures"}</Td>
            </tr>
          ))}
        </Table>
      </Box>
    </div>
  );
}
