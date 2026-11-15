"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loading, ErrorNote } from "@/components/ui";

export default function Letter({ params }: { params: { id: string } }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { api(`/api/letter/${params.id}`).then(setD).catch((e) => setErr(e.message)); }, [params.id]);
  if (err) return <ErrorNote msg={err} />;
  if (!d) return <Loading />;
  return (
    <div className="max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/batch/${d.record.batch_norm}`} className="text-sm">&larr; Back to batch</Link>
        <div className="flex gap-2">
          <button className="btn-light" onClick={() => { navigator.clipboard.writeText(d.text); setCopied(true); }}>{copied ? "Copied" : "Copy text"}</button>
          <button className="btn" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      <p className="no-print mb-3 text-sm text-muted">Fill in the blanks, sign, and send it with the returned stock.</p>
      <pre className="whitespace-pre-wrap card p-8 font-mono text-sm leading-relaxed">{d.text}</pre>
    </div>
  );
}
