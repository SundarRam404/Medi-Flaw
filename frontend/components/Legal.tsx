import Link from "next/link";
import Logo from "@/components/Logo";

export default function Legal({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Link href="/" className="hover:no-underline"><Logo size={24} /></Link>
        <h1 className="h-display mt-10 text-4xl md:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-8 space-y-6 leading-relaxed text-[#3d322e] [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-medium [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
        <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
          Questions? Email <a href="mailto:mediflaw@gmail.com">mediflaw@gmail.com</a>.
          {" "}<Link href="/privacy">Privacy</Link> &middot; <Link href="/terms">Terms</Link> &middot; <Link href="/welcome">Back to Medi-Flaw</Link>
        </p>
      </div>
    </div>
  );
}
