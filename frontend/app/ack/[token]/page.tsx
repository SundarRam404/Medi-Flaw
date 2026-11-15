"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loading, ErrorNote } from "@/components/ui";

export default function Ack({ params }: { params: { token: string } }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api(`/api/ack/${params.token}`).then(setD).catch((e) => setErr(e.message)); }, [params.token]);
  if (err) return <ErrorNote msg={err} />;
  if (!d) return <Loading />;
  return (
    <div className="card max-w-lg p-6">
      <h1 className="h-display text-4xl">Thank you</h1>
      <p className="mt-2 text-muted">You have confirmed the alert for batch <b className="font-mono text-ink">{d.batch_no}</b> ({d.drug_name}). No reminder will be sent.</p>
      <Link href="/watchlist" className="btn mt-4">Go to my watchlist</Link>
    </div>
  );
}
