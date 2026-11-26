// "What is Medi-Flaw?" text, shown in the Help panel and on /about.
// Facts and sources (checked Nov 2026):
// - 3,000+ companies, ~10,500 manufacturing units: PIB backgrounder (pib.gov.in, PRID 2243248)
// - ~100-200 failed samples a month: CDSCO monthly NSQ alerts (Aug 2025: 94, Sep 2025: 112, Dec 2025: 167)
// - ~89% of retail pharmacies are local medical stores (2021 industry analysis)
// - Coldrif 2025: DEG 48.6% vs 0.1% limit, 20+ children died in Madhya Pradesh (news reports, Oct 2025)
// - Gambia 2022: 70 children, India-made syrups (Gambian government taskforce)
// - Uzbekistan: deaths linked to an Indian-made syrup; maker's licence cancelled (Pulitzer Center)
export default function AboutContent({ compact = false }: { compact?: boolean }) {
  const h = compact ? "mt-4 text-[13px] font-semibold text-ink" : "mt-8 text-xl font-medium text-ink";
  const p = compact ? "mt-1.5 text-[13px] leading-relaxed text-[#4a3d38]" : "mt-2 leading-relaxed text-[#4a3d38]";
  const li = compact ? "text-[13px] leading-relaxed text-[#4a3d38]" : "leading-relaxed text-[#4a3d38]";
  return (
    <div>
      <p className={p}>
        Every month, the Government of India&apos;s drug regulator (CDSCO) and state drug labs pick medicines at random and
        test them. The batches that fail are put in a list called <b>&ldquo;Not of Standard Quality&rdquo;</b> and published
        as a PDF. There is no fixed date. A new list comes out whenever it is ready. By then, most of those batches are
        already in medicine shops and in people&apos;s homes.
      </p>

      <h3 className={h}>Why this matters</h3>
      <p className={p}>
        India has <b>over 3,000 medicine companies</b> running about <b>10,500 factories</b>. Even if each factory made only
        10 batches a month, that is <b>more than 1 lakh new batches every month</b>. Of the batches tested, about
        <b> 100 to 200 fail every month</b>.
      </p>
      <p className={p}>
        India also has lakhs of medicine shops, and <b>about 9 out of 10 are small local stores</b>. Their medicines come
        through many middlemen, so when a batch fails, nobody comes to take it back from these small shops.
      </p>
      <p className={p}>
        One shop can hold hundreds or even thousands of different batches. Checking each one by hand against a long PDF
        takes hours, every single month. <b>Medi-Flaw does it in seconds.</b>
      </p>

      <h3 className={h}>How it works</h3>
      <ol className={`mt-2 list-decimal space-y-1 pl-5 ${li}`}>
        <li>Save the medicines you have in Medi-Flaw.</li>
        <li>Every day, Medi-Flaw&apos;s automatic system checks for a new government list. When one comes, it downloads it, cleans it and saves it.</li>
        <li>If any medicine you saved is on the failed list, you get an <b>email straight away</b>, with a <b>ready return letter</b> to send back the stock to your distributor.</li>
      </ol>
      <p className={p}>No more worrying that you sold or gave out a medicine from a failed batch.</p>

      <h3 className={h}>Is it only for shops?</h3>
      <p className={p}>
        No. <b>Anyone can use it, even without logging in.</b> Turn the strip or bottle around, find the batch number
        (usually written as B.No.), type it in, and see if that batch failed. If it is not on any failed list, there is no
        known problem with it.
      </p>

      <h3 className={h}>Adding your medicines is easy</h3>
      <p className={p}>
        Scan the QR code on the strip, upload your purchase invoice (PDF), take a photo of the invoice, or just type the
        batch number.
      </p>

      <h3 className={h}>What the danger levels mean</h3>
      <ul className={`mt-2 space-y-2 ${li}`}>
        <li>
          <span className="mr-1.5 rounded-full bg-bad-light px-2 py-0.5 text-[11px] font-semibold text-bad">HIGH</span>
          The most serious. <b>Fake medicine</b>, a product that should be germ-free but is not (<b>sterility</b>),
          <b> particles</b> inside, or <b>germs</b> found. Also a wrong amount of medicine in an <b>injection or eye drop</b>.
          Stop using it and talk to your doctor today.
        </li>
        <li>
          <span className="mr-1.5 rounded-full bg-warn-light px-2 py-0.5 text-[11px] font-semibold text-warn">MEDIUM</span>
          The medicine may not work as it should. <b>Wrong amount</b> of medicine (too little or too much), the tablet
          <b> does not dissolve</b> properly, <b>too many impurities</b>, or a physical test failed (like pH or volume).
        </li>
        <li>
          <span className="mr-1.5 rounded-full bg-sand px-2 py-0.5 text-[11px] font-semibold text-muted">LOW</span>
          The <b>label is wrong</b> or the medicine <b>looks different</b> (colour, shape, smell). The medicine itself may be fine.
        </li>
      </ul>

      <h3 className={h}>Why I built Medi-Flaw</h3>
      <p className={p}>
        In 2025, in Madhya Pradesh, small children with a simple cough were given a syrup called Coldrif. Lab tests later
        found it had <b>48.6% diethylene glycol</b>, a poison used in paint and brake fluid. The safe limit is 0.1%.
        <b> More than 20 children died</b> of kidney failure. Most of them were under five years old. Their parents trusted
        the medicine. They had no way to know.
      </p>
      <p className={p}>
        It was not the first time. In 2022, <b>70 children in The Gambia</b> died after taking cough syrups made in India.
        Children in <b>Uzbekistan</b> also died from an Indian-made syrup, and that company&apos;s licence was cancelled. <b>But cancelling a licence cannot bring back the lives that were lost.</b>
      </p>
      <p className={p}>
        A medicine should heal, not harm. When a batch is found to be bad, every day counts. The faster shops and families
        know, the fewer people take it. That is why I built Medi-Flaw.
      </p>

      <p className={`${compact ? "mt-4 text-[14px]" : "mt-8 text-2xl"} font-semibold leading-snug text-ink`}>
        Check with Medi-Flaw, and give medicine to your parents and children with peace of mind.
      </p>
    </div>
  );
}
