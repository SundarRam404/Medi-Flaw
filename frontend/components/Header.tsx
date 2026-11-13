"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, logout } from "@/lib/api";

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
    `flex-1 whitespace-nowrap border-b-2 px-3 py-3.5 text-center text-sm hover:no-underline ${
      active ? "border-brand font-medium text-brand-dark" : "border-transparent text-ink hover:bg-paper"}`;

  return (
    <header className="border-b border-line bg-white">
      <nav className="mx-auto flex max-w-6xl items-stretch overflow-x-auto px-2">
        <Link href="/" className="mr-4 flex shrink-0 items-center py-2 hover:no-underline" aria-label="Medi-Flaw home">
          <img src="/logo.png" alt="Medi-Flaw" className="h-7 w-auto" />
        </Link>
        {links.map(([h, l]) => (
          <Link key={h} href={h} className={tab(on(h))}>{l}</Link>
        ))}
        {user ? (
          <button className={tab(false) + " text-muted"} onClick={() => setAsk(true)}>Log out</button>
        ) : (
          <Link href="/login" className={tab(path.startsWith("/login"))}>Log in</Link>
        )}
      </nav>
      {ask && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" onClick={() => setAsk(false)}>
          <div className="w-full max-w-sm rounded-md border border-line bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">Log out?</h2>
            <p className="mt-1 text-sm text-muted">You are logged in as {user?.email}.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-light" onClick={() => setAsk(false)}>Cancel</button>
              <button className="btn" onClick={() => { setAsk(false); logout(); router.push("/"); }}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
