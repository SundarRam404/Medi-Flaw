import Legal from "@/components/Legal";

export const metadata = { title: "Privacy policy - Medi-Flaw" };

export default function Privacy() {
  return (
    <Legal title="Privacy policy" updated="15 November 2026">
      <p>
        Medi-Flaw is a student project from Sai University, Chennai. It helps pharmacies and people check whether a
        medicine batch appears in the Government of India&apos;s CDSCO &ldquo;Not of Standard Quality&rdquo; lists.
        This page explains what we keep and why. We do not sell or share your data, and we show no ads.
      </p>

      <h2>If you use Medi-Flaw without an account</h2>
      <ul>
        <li>We do not ask for your name or email.</li>
        <li>Batch and company searches are not linked to you.</li>
        <li>Questions typed into &ldquo;Ask&rdquo; are stored with their answers, without your name, so we can check answer quality.</li>
      </ul>

      <h2>If you create an account</h2>
      <ul>
        <li><b>Account details:</b> your name, email, account type (Pharmacy &amp; Business or Personal) and, for businesses, the business name.</li>
        <li><b>Sign-in:</b> with email, we store only a scrambled (bcrypt) version of your password. With Google, we receive your name and verified email from Google. We do not see your Google password and we do not access your Gmail, contacts or files.</li>
        <li><b>Your medicine list:</b> the batches you save, with any details you add (medicine, company, quantity, purchase date, supplier).</li>
        <li><b>Alerts:</b> a copy of each alert email we send you and whether you confirmed it.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To check your saved batches against every new CDSCO list.</li>
        <li>To email you when one of your batches fails, and to send a reminder if you have not confirmed it.</li>
        <li>Nothing else. No marketing emails.</li>
      </ul>

      <h2>Services that process data for us</h2>
      <ul>
        <li>Vercel (website), Render (server) and Neon (database) host the app.</li>
        <li>Brevo sends sign-up codes and alert emails.</li>
        <li>Groq answers questions in &ldquo;Ask&rdquo;. Only the question text is sent, never your account details.</li>
        <li>Google provides &ldquo;Sign in with Google&rdquo; if you choose it.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Turn email alerts off any time on the &ldquo;My medicines&rdquo; page.</li>
        <li>Remove any saved batch at any time.</li>
        <li>To delete your account and all its data, email us from your account&apos;s email address. We delete it within 7 days.</li>
      </ul>

      <h2>Medical note</h2>
      <p>
        Medi-Flaw shows public government test results. It is not medical advice. If you are worried about a
        medicine, speak to your pharmacist or doctor before stopping it.
      </p>
    </Legal>
  );
}
