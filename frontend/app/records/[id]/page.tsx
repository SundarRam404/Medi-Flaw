"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loading, ErrorNote } from "@/components/ui";

export default function RecordRedirect({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  useEffect(() => {
    api(`/api/records/${params.id}`).then((r) => router.replace(`/batch/${encodeURIComponent(r.batch_norm)}`)).catch((e) => setErr(e.message));
  }, [params.id, router]);
  return err ? <ErrorNote msg={err} /> : <Loading />;
}
