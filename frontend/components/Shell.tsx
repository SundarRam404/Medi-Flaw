"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Logo from "@/components/Logo";
import RoboChat from "@/components/RoboChat";
import Help from "@/components/Help";
import Link from "next/link";
import { getUser } from "@/lib/api";

// Pages that open without the welcome screen (links from alert emails, printouts, the welcome page itself)
const OPEN = ["/welcome", "/login", "/ack", "/letter", "/records", "/privacy", "/terms"];
const FULL = ["/welcome", "/login", "/privacy", "/terms"]; // full-screen pages: no header or footer

export function isGuest() { try { return localStorage.getItem("mf_guest") === "1"; } catch { return false; } }
export function setGuest(on: boolean) { try { on ? localStorage.setItem("mf_guest", "1") : localStorage.removeItem("mf_guest"); } catch {} }

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const router = useRouter();
  const open = OPEN.some((p) => path === p || path.startsWith(p + "/"));
  const [ready, setReady] = useState(open);

  useEffect(() => {
    if (open) { setReady(true); return; }
    if (getUser() || isGuest()) { setReady(true); return; }
    const next = path + (typeof window !== "undefined" ? window.location.search : "");
    router.replace(`/welcome${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
  }, [path, open, router]);

  if (FULL.some((p) => path.startsWith(p))) return <>{children}</>;
  if (!ready) return <div className="min-h-screen bg-paper" />;

  const home = path === "/";
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className={home ? "w-full flex-1" : "mx-auto w-full max-w-6xl flex-1 px-4 py-10"}>{children}</main>
      <footer className="mt-20 border-t border-line bg-sand/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Logo size={20} />
            <p className="mt-2 text-muted">Making Medicine Quality Transparent</p>
          </div>
          <FooterCol title="Explore" links={[["/", "Search a batch"], ["/companies", "Companies"], ["/reports", "Reports"], ["/data", "Data"], ["/ask", "Ask questions"]]} />
          <FooterCol title="Account" links={[["/watchlist", "My medicines"], ["/welcome", "Log in or sign up"]]} />
          <FooterCol title="Help and legal" links={[["mailto:mediflaw@gmail.com", "mediflaw@gmail.com"], ["/privacy", "Privacy policy"], ["/terms", "Terms of use"]]} />
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-muted">
            <span>Data: CDSCO &ldquo;Not of Standard Quality&rdquo; drug alerts, Government of India. Information only, not medical advice.</span>
            <span>A Sai University, Chennai student project</span>
          </div>
        </div>
      </footer>
      <RoboChat />
      <Help />
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="label mb-2">{title}</div>
      <ul className="space-y-1.5">
        {links.map(([h, l]) => (
          <li key={h}>{h.startsWith("mailto:") ? <a href={h} className="text-ink">{l}</a> : <Link href={h} className="text-ink">{l}</Link>}</li>
        ))}
      </ul>
    </div>
  );
}
