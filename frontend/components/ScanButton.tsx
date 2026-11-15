"use client";
import { useRef, useState } from "react";
import { scanMedicine, ScanResult } from "@/lib/scan";

// Camera button: reads the QR / DataMatrix code on a strip, or its printed text if there is no code.
export default function ScanButton({ onResult, className = "", label = "Scan" }:
  { onResult: (r: ScanResult) => void; className?: string; label?: string }) {
  const cam = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  async function go() {
    const fl = cam.current?.files?.[0]; if (!fl) return;
    setErr("");
    try {
      const r = await scanMedicine(fl, setStatus);
      if (r.how === "none") setErr("No batch number found. Take a closer, sharp photo of the QR code or the part that says B.No. / Batch, or type it.");
      else if (!r.batch && !r.candidates.length && r.url) setErr("This QR code is only a link to the maker's website, without the batch number. Please type the batch number.");
      onResult(r);
    } catch (e: any) { setErr(e.message || "Could not read the photo"); }
    setStatus("");
    if (cam.current) cam.current.value = "";
  }

  return (
    <>
      <button type="button" onClick={() => cam.current?.click()} disabled={!!status}
        className={`btn-light shrink-0 px-3 ${className}`} title="Scan the QR code or the printed batch number with your camera">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><rect x="7" y="7" width="10" height="10" rx="1" />
        </svg>
        {status ? "Reading..." : label}
      </button>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={go} />
      {(status || err) && (
        <span className={`basis-full text-xs ${err ? "text-bad" : "text-muted"}`}>{err || status}</span>
      )}
    </>
  );
}
