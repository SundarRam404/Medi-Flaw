import "./globals.css";
import type { Metadata } from "next";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Medi-Flaw - Check failed medicine batches",
  description: "Search medicine batches that failed CDSCO quality tests.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/funnel-display-latin-300-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/funnel-display-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body className="min-h-screen">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
