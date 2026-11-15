"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Logo from "@/components/Logo";
import RoboChat from "@/components/RoboChat";
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
      <footer className="mt-16 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-muted">
          <span className="flex items-center gap-2"><Logo size={18} /><span>— Making Medicine Quality Transparent</span></span>
          <span>Data: CDSCO &ldquo;Not of Standard Quality&rdquo; drug alerts, Government of India. Information only, not medical advice.</span>
        </div>
      </footer>
      <RoboChat />
    </div>
  );
}
