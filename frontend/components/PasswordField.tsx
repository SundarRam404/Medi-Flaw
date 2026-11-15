"use client";
import { useState } from "react";

// Rules shared with the server: 8+ characters, a letter, a number and a symbol.
export const RULES: { id: string; label: string; test: (p: string) => boolean; required: boolean }[] = [
  { id: "len", label: "8+ characters", test: (p) => p.length >= 8, required: true },
  { id: "letter", label: "A letter", test: (p) => /[A-Za-z]/.test(p), required: true },
  { id: "num", label: "A number", test: (p) => /\d/.test(p), required: true },
  { id: "sym", label: "A symbol like @ # ! $", test: (p) => /[^A-Za-z0-9]/.test(p), required: true },
  { id: "case", label: "Capital and small letters", test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p), required: false },
];

export function passwordOk(p: string) { return RULES.every((r) => !r.required || r.test(p)); }

function strength(p: string) {
  if (!p) return 0;
  let s = RULES.filter((r) => r.test(p)).length;   // 0..5
  if (p.length >= 12) s += 1;
  if (/^(.)\1+$/.test(p) || /^(1234|abcd|pass|qwer)/i.test(p)) s = Math.min(s, 2);
  return Math.min(4, Math.max(1, s - 2));            // 1 weak .. 4 strong
}
const LEVEL = [
  { t: "", c: "" },
  { t: "Weak", c: "bg-bad" },
  { t: "Fair", c: "bg-warn" },
  { t: "Good", c: "bg-[#6f9a5a]" },
  { t: "Strong", c: "bg-ok" },
];

export default function PasswordField({ value, onChange, placeholder = "Password", autoComplete, checks = false, className = "" }:
  { value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; checks?: boolean; className?: string }) {
  const [show, setShow] = useState(false);
  const lvl = strength(value);
  return (
    <div>
      <div className="relative">
        <input className={`input pr-11 ${className}`} type={show ? "text" : "password"} required value={value} placeholder={placeholder}
          autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-sand hover:text-ink">
          {show ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 20c-7 0-10-8-10-8a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.6 9.6 0 0 1 12 4c7 0 10 8 10 8a18.6 18.6 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
      </div>
      {checks && value && (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 rounded-full transition-colors ${i <= lvl ? LEVEL[lvl].c : "bg-line"}`} />)}
            </div>
            <span className={`w-12 text-right text-xs font-medium ${lvl <= 1 ? "text-bad" : lvl === 2 ? "text-warn" : "text-ok"}`}>{LEVEL[lvl].t}</span>
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {RULES.map((r) => {
              const ok = r.test(value);
              return (
                <li key={r.id} className={ok ? "text-ok" : r.required ? "text-muted" : "text-[#a8988f]"}>
                  {ok ? "✓" : "○"} {r.label}{!r.required && !ok ? " (bonus)" : ""}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
