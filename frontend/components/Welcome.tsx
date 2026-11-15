"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, saveLogin, getUser } from "@/lib/api";
import { setGuest } from "@/components/Shell";
import Logo from "@/components/Logo";

declare global { interface Window { google?: any } }

type Kind = "business" | "personal";
const KINDS: { k: Kind; title: string; who: string }[] = [
  { k: "business", title: "Pharmacy & Business", who: "Pharmacies, hospitals, clinics and distributors" },
  { k: "personal", title: "Personal", who: "For you and your family's medicines at home" },
];


function loadGoogle(): Promise<any> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => res(window.google);
    s.onerror = () => rej(new Error("Could not load Google sign-in"));
    document.head.appendChild(s);
  });
}

export default function Welcome() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "";
  const [kind, setKind] = useState<Kind>("business");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ email: "", password: "", name: "", organisation: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [gid, setGid] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // email waiting for its code
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const gBox = useRef<HTMLDivElement>(null);
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { if (getUser()) router.replace(next || "/"); }, [router, next]);
  useEffect(() => { api("/api/auth/config").then((c) => setGid(c.google_client_id)).catch(() => {}); }, []);

  function done(r: any) {
    saveLogin(r.token, r.user);
    setGuest(false);
    router.push(next || (r.user.role === "admin" ? "/admin" : "/watchlist"));
  }

  useEffect(() => {
    if (!gid || !gBox.current) return;
    let live = true;
    loadGoogle().then((g) => {
      if (!live || !gBox.current) return;
      g.accounts.id.initialize({
        client_id: gid,
        callback: async (resp: any) => {
          setBusy(true); setErr("");
          try {
            done(await api("/api/auth/google", { method: "POST",
              body: JSON.stringify({ credential: resp.credential, account_type: kindRef.current }) }));
          } catch (e: any) { setErr(e.message); }
          setBusy(false);
        },
      });
      gBox.current.innerHTML = "";
      g.accounts.id.renderButton(gBox.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: Math.min(340, gBox.current.offsetWidth || 340) });
    }).catch(() => setGid(null));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gid]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const body = mode === "login"
        ? { email: f.email, password: f.password }
        : { ...f, organisation: kind === "business" ? f.organisation : null, account_type: kind };
      const r = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
      if (r.verify) { setPending(r.email); setCode(""); setNote(""); } else done(r);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { done(await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ email: pending, code }) })); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  async function resend() {
    setErr(""); setNote("");
    try {
      await api("/api/auth/register", { method: "POST",
        body: JSON.stringify({ ...f, organisation: kind === "business" ? f.organisation : null, account_type: kind }) });
      setNote("New code sent.");
    } catch (e: any) { setErr(e.message); }
  }

  function guest() {
    setGuest(true);
    router.push(next && !next.startsWith("/watchlist") && !next.startsWith("/admin") ? next : "/");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6">
      <img src="/landscape.svg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative w-full max-w-[400px] rounded-3xl border border-white/70 bg-white/85 p-6 shadow-soft backdrop-blur-xl sm:p-7">
        <Logo size={22} />
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand">Making Medicine Quality Transparent</p>
        {pending ? (
          <>
            <h1 className="h-display mt-5 text-[34px]">Check your email</h1>
            <p className="mt-1 text-sm text-muted">We sent a 6-digit code to <b className="font-medium text-ink">{pending}</b>. It works for 10 minutes.</p>
            <form onSubmit={verify} className="mt-5 space-y-2.5">
              <input className="input py-3 text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} placeholder="------" value={code} autoFocus
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              {err && <p className="rounded-xl bg-bad-light px-3 py-2 text-sm text-bad">{err}</p>}
              {note && <p className="rounded-xl bg-ok-light px-3 py-2 text-sm text-ok">{note}</p>}
              <button className="btn w-full py-2.5" disabled={busy || code.length !== 6}>{busy ? "Checking..." : "Verify and create account"}</button>
            </form>
            <p className="mt-3 text-center text-sm text-muted">
              No email? Check spam, or <button className="font-medium text-brand hover:underline" onClick={resend}>send a new code</button>
            </p>
            <p className="mt-1 text-center text-sm">
              <button className="text-muted hover:text-ink" onClick={() => { setPending(null); setErr(""); setNote(""); }}>&larr; Change email</button>
            </p>
          </>
        ) : (<>
        <h1 className="h-display mt-5 text-[34px]">{mode === "login" ? "Welcome" : "Create account"}</h1>
        <p className="mt-1 text-sm text-muted">Check any medicine batch against government lab results.</p>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-sand p-1 text-sm">
          {KINDS.map((x) => (
            <button key={x.k} type="button" onClick={() => setKind(x.k)} title={x.who}
              className={`rounded-full py-1.5 transition ${kind === x.k ? "bg-white font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
              {x.k === "business" ? "Pharmacy" : "Personal"}
            </button>
          ))}
        </div>

        {gid && (
          <>
            <div ref={gBox} className="mt-4 flex h-[44px] justify-center" />
            <div className="my-3 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          </>
        )}

        <form onSubmit={submit} className={`space-y-2.5 ${gid ? "" : "mt-4"}`}>
          {mode === "register" && (
            <>
              <input className="input py-2" required placeholder="Your name" value={f.name} onChange={set("name")} autoComplete="name" />
              {kind === "business" && (
                <input className="input py-2" required placeholder="Pharmacy or business name" value={f.organisation} onChange={set("organisation")} autoComplete="organization" />
              )}
            </>
          )}
          <input className="input py-2" type="email" required placeholder="Email" value={f.email} onChange={set("email")} autoComplete="email" />
          <input className="input py-2" type="password" required minLength={mode === "register" ? 8 : 1} value={f.password} onChange={set("password")}
            placeholder={mode === "register" ? "Password (8+ characters)" : "Password"} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          {err && <p className="rounded-xl bg-bad-light px-3 py-2 text-sm text-bad">{err}</p>}
          <button className="btn w-full py-2.5" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button>
        </form>

        <p className="mt-3 text-center text-sm text-muted">
          {mode === "login" ? "New here? " : "Have an account? "}
          <button className="font-medium text-brand hover:underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
            {mode === "login" ? "Create a free account" : "Log in"}
          </button>
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-[#5b4d47]">
          {["Save your batches", "Email alerts if one fails", "Free"].map((t) => (
            <span key={t} className="flex items-center gap-1"><span className="text-brand">&#10003;</span>{t}</span>
          ))}
        </div>

        <div className="mt-4 border-t border-line pt-4 text-center">
          <button onClick={guest} className="btn-light w-full py-2.5">Continue without an account</button>
          <p className="mt-1.5 text-[11px] text-muted">Search freely. Nothing is saved.</p>
        </div>

        </>)}

        <p className="mt-3 text-center text-[11px] text-[#a8988f]">
          <Link href="/privacy" className="text-[#a8988f]">Privacy</Link> &middot; <Link href="/terms" className="text-[#a8988f]">Terms</Link>
        </p>
      </div>
    </div>
  );
}


