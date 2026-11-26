import AboutContent from "@/components/AboutContent";

export const metadata = { title: "What is Medi-Flaw? — Making Medicine Quality Transparent" };

export default function About() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="h-display text-4xl md:text-5xl">What is Medi-Flaw?</h1>
      <div className="mt-6"><AboutContent /></div>
    </div>
  );
}
