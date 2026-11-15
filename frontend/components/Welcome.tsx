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

const WITHOUT = [
  "Check if any batch failed a government lab test",
  "See each company's failure history and risk",
  "Reports, raw data and Ask questions",
  "No email needed. Nothing you do is saved",
];
const WITH: Record<Kind, string[]> = {
  business: [
    "Save your whole stock: one by one, CSV, invoice PDF or photo",
    "Automatic email the day a batch you hold fails",
    "Reminders until you act, and ready-to-print return letters",
    "See which suppliers and makers are high-risk",
  ],
  personal: [
    "Save the medicines your family takes",
    "Automatic email the day one of them fails",
    "Reminder if you miss the first email",
    "Free. Your email is used only for alerts",
  ],
};

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
      g.accounts.id.renderButton(gBox.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 340 });
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
      done(await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) }));
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  function guest() {
    setGuest(true);
    router.push(next && !next.startsWith("/watchlist") && !next.startsWith("/admin") ? next : "/");
  }

  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_1fr]">
      {/* left: picture and the why */}
      <section className="relative overflow-hidden">
        <img src="/landscape.svg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        <div className="relative flex h-full flex-col px-6 py-8 md:px-12 md:py-10">
          <Logo size={26} />
          <div className="mt-14 max-w-xl lg:mt-auto">
            <h1 className="h-display text-4xl md:text-6xl">Know if a medicine batch failed, before it reaches anyone.</h1>
            <p className="mt-4 max-w-md text-[#5b4d47]">
              Medi-Flaw checks every batch against the Government of India&apos;s (CDSCO) &ldquo;Not of Standard Quality&rdquo; lists, updated every day.
            </p>
          </div>
          <div className="mt-8 grid gap-3 pb-2 md:grid-cols-2">
            <Why title="Without an account" tag="Instant" items={WITHOUT} />
            <Why title="With a free account" tag={kind === "business" ? "Pharmacy & Business" : "Personal"} items={WITH[kind]} strong />
          </div>
        </div>
      </section>

      {/* right: choose and sign in */}
      <section className="flex items-center justify-center px-5 py-10 md:px-10">
        <div className="w-full max-w-md">
          <h2 className="h-display text-4xl">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-2 text-sm text-muted">{mode === "login" ? "Log in to see your medicines and alerts." : "Free. Takes 30 seconds."}</p>

          <p className="label mt-7">I am using Medi-Flaw for</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {KINDS.map((x) => (
              <button key={x.k} type="button" onClick={() => setKind(x.k)}
                className={`rounded-2xl border p-3.5 text-left transition ${kind === x.k ? "border-ink bg-white shadow-soft" : "border-line bg-white/60 hover:border-[#d9c7ba]"}`}>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className={`grid h-4 w-4 place-items-center rounded-full border ${kind === x.k ? "border-ink" : "border-[#cbbbb0]"}`}>
                    {kind === x.k && <span className="h-2 w-2 rounded-full bg-ink" />}
                  </span>
                  {x.title}
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted">{x.who}</span>
              </button>
            ))}
          </div>

          {gid && (
            <>
              <div ref={gBox} className="mt-6 flex justify-center" />
              <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" /></div>
            </>
          )}

          <form onSubmit={submit} className={`space-y-3 ${gid ? "" : "mt-6"}`}>
            {mode === "register" && (
              <>
                <Field label="Your name"><input className="input" required value={f.name} onChange={set("name")} autoComplete="name" /></Field>
                {kind === "business" && (
                  <Field label="Pharmacy or business name">
                    <input className="input" required value={f.organisation} onChange={set("organisation")} placeholder="e.g. Sri Ram Medicals, Chennai" autoComplete="organization" />
                  </Field>
                )}
              </>
            )}
            <Field label="Email"><input className="input" type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></Field>
            <Field label="Password">
              <input className="input" type="password" required minLength={mode === "register" ? 8 : 1} value={f.password} onChange={set("password")}
                autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "register" ? "At least 8 characters" : ""} />
            </Field>
            {err && <p className="rounded-xl bg-bad-light px-3.5 py-2.5 text-sm text-bad">{err}</p>}
            <button className="btn w-full py-3" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button>
          </form>

          <p className="mt-4 text-center text-sm text-muted">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <button className="font-medium text-brand hover:underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
              {mode === "login" ? "Create a free account" : "Log in"}
            </button>
          </p>

          <div className="mt-8 rounded-2xl border border-dashed border-[#d9c7ba] p-4">
            <button onClick={guest} className="btn-light w-full py-3">Continue without an account &rarr;</button>
            <p className="mt-2.5 text-center text-xs leading-relaxed text-muted">
              You can check any batch, company or report. Nothing is saved and no alerts are sent.
            </p>
          </div>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-[#a8988f]">
            Your email is used only for batch alerts. You can turn alerts off or delete your list any time.
            {" "}<Link href="/" onClick={(e) => { e.preventDefault(); guest(); }} className="text-[#a8988f] underline">Skip</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label mb-1 block">{label}</span>{children}</label>;
}

function Why({ title, tag, items, strong }: { title: string; tag: string; items: string[]; strong?: boolean }) {
  return (
    <div className={`glass p-5 ${strong ? "bg-white/75" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-medium">{title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${strong ? "bg-ink text-white" : "bg-white/80 text-ink"}`}>{tag}</span>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-[#4a3d38]">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${strong ? "bg-brand" : "bg-[#9c7a9e]"}`} />{t}
          </li>
        ))}
      </ul>
    </div>
  );
}
