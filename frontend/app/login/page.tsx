"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, saveLogin } from "@/lib/api";
import { ErrorNote, Loading } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/watchlist";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ email: "", password: "", name: "", organisation: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const body = mode === "login" ? { email: f.email, password: f.password } : f;
      const r = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
      saveLogin(r.token, r.user);
      router.push(r.user.role === "admin" && next === "/watchlist" ? "/admin" : next);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="h-display mb-6 text-4xl">{mode === "login" ? "Welcome back" : "Create account"}</h1>
      <div className="mb-4 flex gap-1 border-b-2 border-ink">
        <button className={`tab ${mode === "login" ? "tab-on" : ""}`} onClick={() => setMode("login")}>Log in</button>
        <button className={`tab ${mode === "register" ? "tab-on" : ""}`} onClick={() => setMode("register")}>Create account</button>
      </div>
      <form onSubmit={submit} className="space-y-3 card p-5">
        {mode === "register" && (
          <>
            <label className="block text-sm">Your name<input className="input mt-1" required value={f.name} onChange={set("name")} /></label>
            <label className="block text-sm">Shop or organisation<input className="input mt-1" value={f.organisation} onChange={set("organisation")} placeholder="e.g. Sri Ram Medicals, Chennai" /></label>
          </>
        )}
        <label className="block text-sm">Email<input className="input mt-1" type="email" required value={f.email} onChange={set("email")} /></label>
        <label className="block text-sm">Password<input className="input mt-1" type="password" required minLength={6} value={f.password} onChange={set("password")} /></label>
        {err && <ErrorNote msg={err} />}
        <button className="btn w-full" disabled={busy}>{mode === "login" ? "Log in" : "Create account"}</button>
        {mode === "register" && <p className="text-xs text-muted">Alerts are sent to this email. We do not share it with anyone.</p>}
      </form>
    </div>
  );
}

export default function Login() {
  return <Suspense fallback={<Loading />}><LoginForm /></Suspense>;
}
