"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const EMAIL = "mediflaw@gmail.com";
const GROUPS: { t: string; links: [string, string][] }[] = [
  { t: "Explore", links: [["/", "Search a batch"], ["/companies", "Companies and risk"], ["/reports", "Reports and charts"], ["/data", "Raw and cleaned data"], ["/ask", "Ask questions (full page)"]] },
  { t: "Your account", links: [["/watchlist", "My medicines"], ["/welcome", "Log in or sign up"]] },
  { t: "Legal", links: [["/privacy", "Privacy policy"], ["/terms", "Terms of use"]] },
];

// Bottom-left help button: every page that is not in the top bar, plus contact.
export default function Help() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={box} className="no-print fixed bottom-5 left-5 z-40">
      {open && (
        <div role="dialog" aria-label="Help" className="absolute bottom-14 left-0 w-[290px] rounded-2xl border border-line bg-white p-4 text-sm shadow-soft">
          <div className="flex items-center justify-between">
            <span className="font-medium">Help</span>
            <button aria-label="Close help" onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-full text-lg text-muted hover:bg-sand">&times;</button>
          </div>
          <p className="mt-1 text-xs text-muted">Type a batch number on the home page. Save batches to get an email if one fails. Click the robot to ask questions.</p>
          {GROUPS.map((g) => (
            <div key={g.t} className="mt-3">
              <div className="label mb-1">{g.t}</div>
              {g.links.map(([h, l]) => (
                <Link key={h + l} href={h} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-1 text-ink hover:bg-paper hover:no-underline">{l}</Link>
              ))}
            </div>
          ))}
          <div className="mt-3 rounded-xl bg-sand p-3">
            <div className="label">Contact us</div>
            <a href={`mailto:${EMAIL}`} className="mt-0.5 block font-medium">{EMAIL}</a>
            <p className="mt-1 text-xs text-muted">Wrong data, a bug, or want your account deleted? Email us.</p>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-line bg-white/90 px-3.5 py-2 text-sm text-ink shadow-soft backdrop-blur transition hover:bg-white">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] font-medium text-white">?</span> Help
      </button>
    </div>
  );
}
