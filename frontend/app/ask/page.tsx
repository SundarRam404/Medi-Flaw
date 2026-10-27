"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageTitle, ErrorNote } from "@/components/ui";

const EXAMPLES = [
  "How many failed batches were listed in 2025?",
  "Which companies had the most failures in 2024?",
  "What failed most often for Jackson Laboratories?",
  "Tell me about batch SHT7550",
  "Which failure type is most common?",
];

// turns "[R12]" into a small grey tag and "- " lines into a spaced list
function Cite({ line }: { line: string }) {
  const parts = line.split(/(\[[A-Z][\w\-]*\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[[A-Z][\w\-]*\]$/.test(p)
          ? <span key={i} className="ml-1 rounded bg-paper px-1 py-0.5 align-middle font-mono text-[11px] text-muted">{p.slice(1, -1)}</span>
          : <span key={i}>{p.replace(/\*\*/g, "")}</span>)}
    </>
  );
}

function Answer({ text }: { text: string }) {
  const blocks: { type: "p" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^([-*•]|\d+[.)])\s+/.test(line);
    const clean = line.replace(/^([-*•]|\d+[.)])\s+/, "");
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === "ul") last.lines.push(clean); else blocks.push({ type: "ul", lines: [clean] });
    } else blocks.push({ type: "p", lines: [line] });
  }
  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((b, i) =>
        b.type === "p" ? <p key={i}><Cite line={b.lines[0]} /></p> : (
          <ul key={i} className="space-y-2.5">
            {b.lines.map((l, j) => (
              <li key={j} className="border-l-2 border-line pl-3"><Cite line={l} /></li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function srcLink(s: any) {
  if (s.kind === "record") return `/records/${s.ref}`;
  if (s.kind === "company") return `/companies/${s.ref}`;
  return null;
}

export default function Ask() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [asked, setAsked] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState<any>(null);

  useEffect(() => { api("/api/ask/status").then(setStatus).catch(() => {}); }, []);

  async function send(text?: string) {
    const question = (text ?? q).trim();
    if (question.length < 3) return;
    setBusy(true); setErr(""); setRes(null); setAsked(question);
    try { setRes(await api("/api/ask", { method: "POST", body: JSON.stringify({ question }) })); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="max-w-3xl">
      <PageTitle title="Ask a question" />
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about a company, batch, year or failure type" />
        <button className="btn" disabled={busy}>{busy ? "Working..." : "Ask"}</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button key={e} className="rounded-full border border-line bg-white px-3 py-1 text-xs text-muted hover:text-ink"
            onClick={() => { setQ(e); send(e); }}>{e}</button>
        ))}
      </div>

      {err && <div className="mt-4"><ErrorNote msg={err} /></div>}

      {res && (
        <div className="mt-6 rounded-md border border-line bg-white">
          <div className="border-b border-line px-5 py-3 text-sm text-muted">{asked}</div>
          <div className={`px-5 py-4 ${res.refused ? "text-muted" : ""}`}><Answer text={res.answer} /></div>
          {res.sources.length > 0 && (
            <div className="border-t border-line px-5 py-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Sources</h3>
              <ul className="space-y-2 text-sm">
                {res.sources.map((s: any) => {
                  const href = srcLink(s);
                  return (
                    <li key={s.id} className="flex gap-2">
                      <span className="shrink-0 font-mono text-xs text-muted">[{s.id}]</span>
                      <span>{href ? <Link href={href}>{s.text.slice(0, 220)}{s.text.length > 220 ? "..." : ""}</Link> : s.text.slice(0, 220)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="border-t border-line px-5 py-2 text-xs text-muted">Answered by: {res.engine}</div>
        </div>
      )}

    </div>
  );
}
