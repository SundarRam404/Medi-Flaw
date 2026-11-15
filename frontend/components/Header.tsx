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
  ["/watchlist", "My medicines"],
];

export default function Header() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    const load = () => setUser(getUser());
    load();
    window.addEventListener("pa-auth", load);
    return () => window.removeEventListener("pa-auth", load);
  }, []);

  const links = user?.role === "admin" ? [...LINKS, ["/admin", "Admin"]] : LINKS;
  const on = (h: string) => (h === "/" ? path === "/" || path.startsWith("/batch") || path.startsWith("/search") : path.startsWith(h));
  const tab = (active: boolean) =>
    `relative flex shrink-0 items-center whitespace-nowrap px-3 text-[13px] font-bold uppercase tracking-[0.06em] no-underline hover:no-underline ${
      active ? "bg-brand text-white hover:text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`;

  return (
    <header className="bg-ink text-white">
      <nav className="mx-auto flex h-16 max-w-6xl items-stretch overflow-x-auto px-4">
        <Link href="/" className="mr-6 flex shrink-0 items-center no-underline hover:no-underline" aria-label="Medi-Flaw home">
          <Logo size={27} />
        </Link>
        <div className="ml-auto flex items-stretch">
          {links.map(([h, l]) => (
            <Link key={h} href={h} className={tab(on(h))}>{l}</Link>
          ))}
          {user ? (
            <button className={tab(false)} onClick={() => setAsk(true)}>Log out</button>
          ) : (
            <Link href="/login" className={tab(path.startsWith("/login"))}>Log in</Link>
          )}
        </div>
      </nav>
      {ask && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={() => setAsk(false)}>
          <div className="card w-full max-w-sm p-5 text-ink" onClick={(e) => e.stopPropagation()}>
            <h2 className="h-display text-2xl">Log out?</h2>
            <p className="mt-2 text-sm text-muted">You are logged in as {user?.email}.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-light" onClick={() => setAsk(false)}>Cancel</button>
              <button className="btn" onClick={() => { setAsk(false); logout(); router.push("/"); }}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
