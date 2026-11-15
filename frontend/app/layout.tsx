import "./globals.css";
import type { Metadata } from "next";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Medi-Flaw — Making Medicine Quality Transparent",
  description: "Check if a medicine batch failed a CDSCO quality test, and get alerts for the batches you hold.",
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
