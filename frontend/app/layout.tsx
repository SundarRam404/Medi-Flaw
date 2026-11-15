import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Medi-Flaw - Check failed medicine batches",
  description: "Search medicine batches that failed CDSCO quality tests.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/funnel-display-latin-800-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/funnel-display-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
        <footer className="mt-10 border-t-4 border-brand bg-ink text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-white/70">
            <Logo size={20} />
            <span>Data: CDSCO &ldquo;Not of Standard Quality&rdquo; drug alerts. Not medical advice.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
