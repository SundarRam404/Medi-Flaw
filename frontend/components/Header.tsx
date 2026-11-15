"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, getUser, getToken, saveLogin, logout } from "@/lib/api";
import Logo from "@/components/Logo";
import Avatar, { AVATARS } from "@/components/Avatar";

export default function Header() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [menu, setMenu] = useState(false);
  const [pick, setPick] = useState(false);
  const [pw, setPw] = useState(false);
  const [f, setF] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const home = path === "/";

  useEffect(() => {
    const load = () => setUser(getUser());
    load();
    window.addEventListener("pa-auth", load);
    return () => window.removeEventListener("pa-auth", load);
  }, []);
  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => {
    if (!menu) { setPick(false); setPw(false); setMsg(null); return; }
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

  async function chooseAvatar(id: string) {
    try {
      await api("/api/me/settings", { method: "PATCH", body: JSON.stringify({ avatar: id }) });
      const t = getToken();
      if (t) saveLogin(t, { ...user, avatar: id });
      setPick(false);
    } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current: f.current, new: f.next }) });
      setMsg({ ok: true, t: "Password changed." }); setF({ current: "", next: "" }); setPw(false);
    } catch (e: any) { setMsg({ ok: false, t: e.message }); }
    setBusy(false);
  }

  const searchOn = path === "/" || path.startsWith("/batch") || path.startsWith("/search");
  const mine = !user ? "My medicines" : user.account_type === "personal" ? "My family’s medicines" : "My stock";
  const kind = user?.account_type === "personal" ? "Personal account" : "Pharmacy & Business account";

  return (
    <header className={home ? "absolute inset-x-0 top-0 z-30" : "sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md"}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="mr-auto flex shrink-0 items-center hover:no-underline" aria-label="Medi-Flaw home">
          <Logo size={24} />
        </Link>
        <Link href="/" className={`hidden shrink-0 rounded-full px-3.5 py-1.5 text-sm text-ink transition hover:no-underline sm:inline-block ${
          searchOn ? "bg-white/80 font-medium shadow-sm" : "opacity-75 hover:bg-white/50 hover:opacity-100"}`}>Search</Link>
        <Link href="/watchlist" className="btn shrink-0 px-4 py-2 hover:no-underline">{mine}</Link>

        {!user ? (
          <Link href="/welcome" className="shrink-0 rounded-full px-3.5 py-1.5 text-sm text-ink opacity-80 hover:bg-white/50 hover:no-underline hover:opacity-100">Log in</Link>
        ) : (
          <div ref={box} className="relative ml-1">
            <button aria-label="Your profile" aria-expanded={menu} onClick={() => setMenu(!menu)}
              className="rounded-full transition hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f6dccf]">
              <Avatar user={user} size={36} />
            </button>
            {menu && (
              <div className="absolute right-0 top-12 z-50 w-[300px] rounded-2xl border border-line bg-white p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <button onClick={() => setPick(!pick)} className="group relative" title="Change avatar">
                    <Avatar user={user} size={52} />
                    <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-line bg-white text-[10px] text-muted group-hover:text-ink">&#9998;</span>
                  </button>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{user.name}</div>
                    <div className="truncate text-sm text-muted">{user.email}</div>
                    <div className="mt-0.5 text-[11px] text-brand">{kind}</div>
                  </div>
                </div>

                {pick && (
                  <div className="mt-3 rounded-xl bg-paper p-2.5">
                    <div className="label mb-2">Choose your avatar</div>
                    <div className="grid grid-cols-5 gap-2">
                      {AVATARS.map((a) => (
                        <button key={a.id} onClick={() => chooseAvatar(a.id)} aria-label={`Avatar ${a.id}`}
                          className={`grid aspect-square place-items-center rounded-full text-xl transition hover:scale-110 ${user.avatar === a.id ? "ring-2 ring-ink ring-offset-2" : ""}`}
                          style={{ background: a.bg }}>{a.e}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-0.5 border-t border-line pt-2 text-sm">
                  <Link href="/watchlist" className="block rounded-lg px-2 py-1.5 text-ink hover:bg-paper hover:no-underline">{mine}</Link>
                  {user.role === "admin" && <Link href="/admin" className="block rounded-lg px-2 py-1.5 text-ink hover:bg-paper hover:no-underline">Admin panel</Link>}
                  {user.auth_provider === "google" ? (
                    <p className="px-2 py-1.5 text-xs text-muted">You sign in with Google, so there is no password to change.</p>
                  ) : (
                    <button onClick={() => { setPw(!pw); setMsg(null); }} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-paper">Change password</button>
                  )}
                  {pw && (
                    <form onSubmit={changePw} className="space-y-2 px-2 pb-2 pt-1">
                      <input className="input py-2 text-sm" type="password" placeholder="Current password" required autoComplete="current-password"
                        value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
                      <input className="input py-2 text-sm" type="password" placeholder="New password (8+ characters)" required minLength={8} autoComplete="new-password"
                        value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
                      <button className="btn w-full py-2" disabled={busy}>{busy ? "Saving..." : "Save new password"}</button>
                    </form>
                  )}
                  {msg && <p className={`mx-2 rounded-lg px-2.5 py-1.5 text-xs ${msg.ok ? "bg-ok-light text-ok" : "bg-bad-light text-bad"}`}>{msg.t}</p>}
                  <button onClick={() => { setMenu(false); logout(); router.push("/welcome"); }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-bad hover:bg-bad-light">Log out</button>
                </div>
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
