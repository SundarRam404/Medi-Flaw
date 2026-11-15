"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, logout } from "@/lib/api";
import Logo from "@/components/Logo";

const LINKS = [
  ["/", "Search"],
  ["/companies", "Companies"],
  ["/reports", "Reports"],
  ["/data", "Data"],
  ["/ask", "Ask"],
];

export default function Header() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [ask, setAsk] = useState(false);
  const home = path === "/";

  useEffect(() => {
    const load = () => setUser(getUser());
    load();
    window.addEventListener("pa-auth", load);
    return () => window.removeEventListener("pa-auth", load);
  }, []);

  const links = user?.role === "admin" ? [...LINKS, ["/admin", "Admin"]] : LINKS;
  const on = (h: string) => (h === "/" ? path === "/" || path.startsWith("/batch") || path.startsWith("/search") : path.startsWith(h));
  const tab = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm text-ink transition hover:no-underline ${
      active ? "bg-white/80 font-medium shadow-sm" : "opacity-75 hover:bg-white/50 hover:opacity-100"}`;

  return (
    <header className={home ? "absolute inset-x-0 top-0 z-20" : "sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur-md"}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 overflow-x-auto px-4">
        <Link href="/" className="mr-4 flex shrink-0 items-center hover:no-underline" aria-label="Medi-Flaw home">
          <Logo size={24} />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          {links.map(([h, l]) => (
            <Link key={h} href={h} className={tab(on(h))}>{l}</Link>
          ))}
          <Link href="/watchlist" className="btn ml-2 shrink-0 px-4 py-2 hover:no-underline">My medicines</Link>
          {user ? (
            <button className={tab(false)} onClick={() => setAsk(true)} title={user.email}>Log out</button>
          ) : (
            <Link href="/welcome" className={tab(false)}>Log in</Link>
          )}
        </div>
      </nav>
      {ask && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 px-4 backdrop-blur-sm" onClick={() => setAsk(false)}>
          <div className="card w-full max-w-sm p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <h2 className="h-display text-3xl">Log out?</h2>
            <p className="mt-2 text-sm text-muted">You are logged in as {user?.email}.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-light" onClick={() => setAsk(false)}>Cancel</button>
              <button className="btn" onClick={() => { setAsk(false); logout(); router.push("/welcome"); }}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
