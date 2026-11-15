import Legal from "@/components/Legal";

export const metadata = { title: "Terms of use - Medi-Flaw" };

export default function Terms() {
  return (
    <Legal title="Terms of use" updated="15 November 2026">
      <p>By using Medi-Flaw you agree to these simple terms.</p>

      <h2>What Medi-Flaw is</h2>
      <p>
        A free tool, built as a student project at Sai University, Chennai, that shows the Government of India&apos;s
        CDSCO &ldquo;Not of Standard Quality&rdquo; drug lists in a searchable form, with company risk scores and alerts.
      </p>

      <h2>Accuracy</h2>
      <ul>
        <li>The data comes from CDSCO&apos;s public lists. We clean it (for example, merging spellings of the same company), and errors can happen.</li>
        <li>&ldquo;No failure on record&rdquo; does not prove a batch is safe. Most batches are never tested.</li>
        <li>Risk scores and Ask answers are estimates made by software. Always check the original CDSCO list before acting.</li>
        <li>Medi-Flaw is not medical advice.</li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>Use a real email you own, so alerts reach you.</li>
        <li>Keep your password private. You are responsible for activity on your account.</li>
        <li>Do not misuse the service: no automated scraping, attacks or attempts to access other people&apos;s data.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        We try to keep Medi-Flaw running and alerts on time, but we cannot guarantee it. New data depends on when CDSCO
        publishes its lists. The service may change or stop. It is provided &ldquo;as is&rdquo;, without warranties.
      </p>

      <h2>Privacy</h2>
      <p>See our <a href="/privacy">privacy policy</a> for what we store and why.</p>
    </Legal>
  );
}
