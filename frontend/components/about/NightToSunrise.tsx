"use client";
// "What is Medi-Flaw?" as one long scroll from a glowing night to sunrise.
// The sky colour, the floating seeds, the stars and the sun all follow the scroll position.
// Facts and sources (checked Nov 2026): PIB backgrounder (3,000+ companies, ~10,500 units);
// CDSCO monthly NSQ alerts (about 100-200 failed samples a month in 2025); industry analysis
// (~89% of retail pharmacies are local stores); news reports on Coldrif (Oct 2025, DEG 48.6%,
// 20+ children); Gambian government taskforce (70 children, 2022); Pulitzer Center (Uzbekistan).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// sky at different points of the scroll: [progress, top colour, bottom colour]
const SKY: [number, string, string][] = [
  [0.0, "#03161c", "#073640"],   // night, deep teal
  [0.55, "#021116", "#05262e"],
  [0.78, "#010608", "#031419"],  // darkest: the story
  [0.86, "#0b1430", "#3a2450"],  // first light
  [0.92, "#2a3a6e", "#d9765c"],  // dawn
  [0.97, "#f3b98a", "#f3c6c0"],  // sunrise
  [1.0, "#fbf7f2", "#fbf2e8"],   // day
];

function skyAt(p: number) {
  for (let i = 1; i < SKY.length; i++) {
    if (p <= SKY[i][0]) {
      const [p0, t0, b0] = SKY[i - 1], [p1, t1, b1] = SKY[i];
      const t = smooth(p0, p1, p);
      return [mix(hex(t0), hex(t1), t), mix(hex(b0), hex(b1), t)];
    }
  }
  return [hex(SKY[SKY.length - 1][1]), hex(SKY[SKY.length - 1][2])];
}

// ---------- scroll + visibility helpers
function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.2);
  return (
    <div ref={ref} className={className}
      style={{ transition: `opacity 1.1s ease ${delay}ms, transform 1.1s cubic-bezier(.2,.7,.2,1) ${delay}ms, filter 1.1s ease ${delay}ms`,
        opacity: seen ? 1 : 0, transform: seen ? "none" : "translateY(28px)", filter: seen ? "none" : "blur(6px)" }}>
      {children}
    </div>
  );
}

function CountUp({ to, suffix = "", prefix = "" }: { to: number; suffix?: string; prefix?: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.5);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    let raf = 0;
    const t0 = performance.now(), dur = 1900;
    const step = (t: number) => {
      const k = clamp((t - t0) / dur);
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, to]);
  return <span ref={ref} className="tabular-nums">{prefix}{n.toLocaleString("en-IN")}{suffix}</span>;
}

// ---------- the living sky: stars, floating seeds, sun
function Sky({ progress }: { progress: React.MutableRefObject<number> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0;
    type Seed = { x: number; y: number; r: number; v: number; sway: number; ph: number };
    let seeds: Seed[] = [], stars: { x: number; y: number; r: number; ph: number }[] = [];
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth; h = window.innerHeight;
      c.width = w * dpr; c.height = h * dpr; c.style.width = w + "px"; c.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(110, (w * h) / 14000));
      seeds = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2.6,
        v: 0.12 + Math.random() * 0.38, sway: 0.3 + Math.random() * 1.2, ph: Math.random() * Math.PI * 2 }));
      stars = Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: Math.random() * w, y: Math.random() * h * 0.75,
        r: Math.random() * 1.1 + 0.2, ph: Math.random() * Math.PI * 2 }));
    };
    resize();
    window.addEventListener("resize", resize);
    const draw = (t: number) => {
      const p = progress.current;
      const night = 1 - smooth(0.84, 0.95, p);        // stars and blue glow fade at dawn
      const glow = 1 - smooth(0.94, 0.995, p);        // seeds stay a bit longer, turning gold
      const warm = smooth(0.82, 0.95, p);
      ctx.clearRect(0, 0, w, h);
      if (night > 0.01) {
        for (const s of stars) {
          const a = (0.35 + 0.65 * Math.abs(Math.sin(t / 1400 + s.ph))) * night;
          ctx.fillStyle = `rgba(220,245,255,${a})`;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (glow > 0.01) {
        const hue = 178 - 140 * warm, sat = 85, light = 72 - 8 * warm;
        for (const s of seeds) {
          if (!still) {
            s.y -= s.v; s.x += Math.sin(t / 1600 + s.ph) * 0.18 * s.sway;
            if (s.y < -10) { s.y = h + 10; s.x = Math.random() * w; }
          }
          const tw = 0.55 + 0.45 * Math.sin(t / 900 + s.ph);
          const a = tw * glow;
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
          g.addColorStop(0, `hsla(${hue},${sat}%,${light + 15}%,${0.95 * a})`);
          g.addColorStop(0.35, `hsla(${hue},${sat}%,${light}%,${0.35 * a})`);
          g.addColorStop(1, `hsla(${hue},${sat}%,${light}%,0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [progress]);
  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[1]" />;
}

// ---------- page
export default function NightToSunrise() {
  const progress = useRef(0);
  const sky = useRef<HTMLDivElement>(null);
  const sun = useRef<HTMLDivElement>(null);
  const aurora = useRef<HTMLDivElement>(null);
  const [day, setDay] = useState(false);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp(window.scrollY / max) : 0;
      progress.current = p;
      const [top, bottom] = skyAt(p);
      if (sky.current) sky.current.style.background = `linear-gradient(180deg, ${css(top)} 0%, ${css(bottom)} 100%)`;
      if (sun.current) {
        const rise = smooth(0.82, 0.99, p);
        sun.current.style.transform = `translate(-50%, ${(1 - rise) * 70}vh)`;
        sun.current.style.opacity = String(smooth(0.82, 0.9, p) * (1 - smooth(0.98, 1, p) * 0.4));
      }
      if (aurora.current) aurora.current.style.opacity = String(0.55 * (1 - smooth(0.6, 0.75, p)));
      setDay(p > 0.95);
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);

  const glowText = "drop-shadow-[0_0_18px_rgba(120,240,230,0.45)]";

  return (
    <div className="relative text-[#e9fbf8]">
      <style>{`
        @keyframes mf-flicker { 0%,100% { opacity:.95; transform:scale(1) } 40% { opacity:.6; transform:scale(.88) } 70% { opacity:1; transform:scale(1.06) } }
        @keyframes mf-light-in { from { opacity:0; transform:translateY(8px) scale(.4) } to { opacity:1; transform:none } }
        @keyframes mf-drift { 0%,100% { transform:translate(-10%,0) scaleX(1) } 50% { transform:translate(10%,3%) scaleX(1.15) } }
        @keyframes mf-cue { 0% { transform:translateY(0); opacity:0 } 30% { opacity:1 } 100% { transform:translateY(22px); opacity:0 } }
        .mf-candle { width:10px; height:10px; border-radius:999px; background:radial-gradient(circle, #fff6d8 0%, #ffd27a 35%, rgba(255,170,60,.35) 60%, transparent 72%);
          box-shadow:0 0 14px 4px rgba(255,190,90,.35); animation: mf-light-in .8s ease both, mf-flicker 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .mf-candle, .mf-cue, .mf-aurora { animation:none !important } }
      `}</style>

      {/* fixed scenery: sky colour, aurora, sun, stars and seeds */}
      <div ref={sky} aria-hidden className="fixed inset-0 z-0" style={{ background: "linear-gradient(180deg,#03161c,#073640)" }} />
      <div ref={aurora} aria-hidden className="mf-aurora pointer-events-none fixed inset-x-0 top-0 z-0 h-[60vh]"
        style={{ background: "radial-gradient(60% 50% at 30% 20%, rgba(70,230,200,.35), transparent 70%), radial-gradient(50% 45% at 75% 10%, rgba(120,120,255,.25), transparent 70%)",
          animation: "mf-drift 18s ease-in-out infinite", filter: "blur(30px)" }} />
      <div ref={sun} aria-hidden className="pointer-events-none fixed bottom-[-18vh] left-1/2 z-0 h-[70vh] w-[70vh] rounded-full"
        style={{ opacity: 0, transform: "translate(-50%,70vh)", background: "radial-gradient(circle, rgba(255,236,190,1) 0%, rgba(255,196,120,.85) 22%, rgba(255,150,90,.35) 45%, rgba(255,140,90,0) 70%)" }} />
      <Sky progress={progress} />

      {/* small top bar */}
      <div className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 md:px-10">
        <Link href="/" className="hover:no-underline" aria-label="Medi-Flaw home"><Logo size={22} light={!day} /></Link>
        <Link href="/" className={`rounded-full px-4 py-2 text-sm backdrop-blur transition hover:no-underline ${day ? "bg-ink text-white hover:bg-black" : "border border-white/25 bg-white/10 text-white hover:bg-white/20"}`}>
          Open Medi-Flaw &rarr;
        </Link>
      </div>

      <main className="relative z-10">
        {/* 0. opening */}
        <section className="relative flex min-h-[72svh] flex-col items-center justify-center px-6 text-center">
          <Reveal><p className="text-xs uppercase tracking-[0.35em] text-[#8fe9dd]">Making Medicine Quality Transparent</p></Reveal>
          <Reveal delay={200}><h1 className={`h-display mt-6 text-5xl md:text-8xl ${glowText}`}>What is <span className="whitespace-nowrap">Medi-Flaw?</span></h1></Reveal>
          <Reveal delay={450}><p className="mx-auto mt-6 max-w-xl text-lg text-[#b9e6e0]">A story about medicines, a list nobody reads, and the children who could not wait.</p></Reveal>
          <div className="absolute bottom-10 flex flex-col items-center gap-2 text-xs text-[#8fe9dd]/80">
            <span>Scroll</span>
            <span className="mf-cue block h-6 w-px bg-[#8fe9dd]" style={{ animation: "mf-cue 1.8s ease-in-out infinite" }} />
          </div>
        </section>

        {/* 1. the list */}
        <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <Reveal><p className="text-sm uppercase tracking-[0.25em] text-[#8fe9dd]">Every month</p></Reveal>
            <Reveal delay={150}><h2 className="h-display mt-3 text-4xl md:text-5xl">India tests its medicines.</h2></Reveal>
            <Reveal delay={300}>
              <p className="mt-6 text-lg leading-relaxed text-[#cdeee9]">
                The Government of India&apos;s drug regulator (CDSCO) and state drug labs pick medicines at random and test them.
                The batches that fail are put in a list called <b className="text-white">&ldquo;Not of Standard Quality&rdquo;</b> and published as a PDF.
              </p>
            </Reveal>
            <Reveal delay={450}>
              <p className="mt-4 text-lg leading-relaxed text-[#cdeee9]">
                There is no fixed date. A new list comes out whenever it is ready. <b className="text-white">By then, most of those batches are already in medicine shops and in people&apos;s homes.</b>
              </p>
            </Reveal>
          </div>
          <Reveal delay={250}>
            <div className="relative mx-auto w-full max-w-sm rotate-[-3deg] rounded-2xl border border-[#8fe9dd]/30 bg-white/5 p-6 shadow-[0_0_60px_rgba(80,220,200,0.18)] backdrop-blur-md">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#8fe9dd]">CDSCO · Drug Alert</div>
              <div className="mt-2 text-lg text-white">Not of Standard Quality</div>
              <div className="mt-4 space-y-2.5">
                {[80, 95, 70, 88, 60, 92, 75].map((wd, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="h-1.5 w-10 rounded-full bg-[#8fe9dd]/40" />
                    <span className="h-1.5 rounded-full bg-white/25" style={{ width: `${wd}%` }} />
                  </div>
                ))}
              </div>
              <div className="absolute -right-4 -top-4 rotate-[12deg] rounded-lg border-2 border-[#ff8a7a] px-3 py-1 text-xs font-semibold tracking-widest text-[#ff8a7a] shadow-[0_0_24px_rgba(255,120,100,0.35)]">FAILED</div>
            </div>
          </Reveal>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: 3000, s: "+", l: "medicine companies in India" },
              { n: 10500, s: "", l: "factories making medicines", pre: "~" },
              { n: 100000, s: "+", l: "new batches every month, even if each factory made just 10" },
              { n: 200, s: "", l: "failed batches in a single month, about 100 to 200 every month", pre: "up to " },
            ].map((x, i) => (
              <Reveal key={i} delay={i * 180}>
                <div className="h-full rounded-3xl border border-[#8fe9dd]/20 bg-white/[0.04] p-5 text-center backdrop-blur-sm">
                  <div className={`h-display text-4xl text-white md:text-5xl ${glowText}`}><CountUp to={x.n} suffix={x.s} prefix={x.pre || ""} /></div>
                  <p className="mt-3 text-sm leading-snug text-[#b9e6e0]">{x.l}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* 3. small shops */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-12 md:grid-cols-2 md:py-16">
          <Reveal>
            <div className="mx-auto grid max-w-sm grid-cols-5 gap-2.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className={`grid aspect-square place-items-center rounded-2xl border text-2xl ${i < 9 ? "border-[#8fe9dd]/40 bg-[#8fe9dd]/10 shadow-[0_0_24px_rgba(120,240,230,0.2)]" : "border-white/10 bg-white/5 opacity-60"}`}>
                  <span aria-hidden>{i < 9 ? "\u{1F3EA}" : "\u{1F3EC}"}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-[#8fe9dd]">About 9 out of 10 medicine shops are small local stores</p>
          </Reveal>
          <div>
            <Reveal><h2 className="h-display text-4xl md:text-5xl">Who gets left behind</h2></Reveal>
            <Reveal delay={150}>
              <p className="mt-6 text-lg leading-relaxed text-[#cdeee9]">
                India has lakhs of medicine shops, and <b className="text-white">about 9 out of 10 are small local stores</b>. Their medicines come through
                many middlemen, so when a batch fails, <b className="text-white">nobody comes to take it back</b> from these small shops.
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-[#cdeee9]">
                {["Factory", "Distributor", "Wholesaler", "Small shop", "Your home"].map((x, i, a) => (
                  <span key={x} className="flex items-center gap-2">
                    <span className="rounded-full border border-[#8fe9dd]/30 bg-white/5 px-3 py-1">{x}</span>
                    {i < a.length - 1 && <span className="text-[#8fe9dd]">&rarr;</span>}
                  </span>
                ))}
              </div>
            </Reveal>
            <Reveal delay={450}>
              <p className="mt-6 text-lg leading-relaxed text-[#cdeee9]">
                One shop can hold hundreds or even thousands of different batches. Checking each one by hand against a long PDF takes
                <b className="text-white"> hours, every single month</b>. Medi-Flaw does it in <b className={`text-[#8fe9dd] ${glowText}`}>seconds</b>.
              </p>
            </Reveal>
          </div>
        </section>

        {/* 6. how it works, in the dawn */}
        <section className="mx-auto flex max-w-6xl flex-col justify-center px-6 py-16 text-white md:py-20">
          <Reveal><h2 className="h-display text-center text-4xl md:text-5xl">How Medi-Flaw works</h2></Reveal>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {[
              ["1", "Save your medicines", "Scan the QR code on the strip, upload your purchase invoice (PDF), take a photo of it, or just type the batch number."],
              ["2", "It watches every day", "Every day, Medi-Flaw's automatic system checks for a new government list. When one comes, it downloads it, cleans it and saves it."],
              ["3", "You get an email at once", "If any medicine you saved is on the failed list, you get an email straight away, with a ready return letter for your distributor."],
            ].map(([n, t, d], i) => (
              <Reveal key={n} delay={i * 180}>
                <div className="h-full rounded-3xl border border-white/30 bg-white/15 p-6 backdrop-blur-md">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-sm font-medium text-[#2b2320]">{n}</div>
                  <h3 className="mt-4 text-xl font-medium">{t}</h3>
                  <p className="mt-2 leading-relaxed text-white/90">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <p className="mx-auto mt-10 max-w-2xl text-center text-lg text-white/95">
              <b>Is it only for shops? No.</b> Anyone can use it, even without logging in. Turn the strip or bottle around, find the
              batch number (usually B.No.), type it in, and see if that batch failed.
            </p>
          </Reveal>
        </section>

        {/* danger levels */}
        <section className="mx-auto flex max-w-6xl flex-col justify-center px-6 py-12 text-white md:py-16">
          <Reveal><h2 className="h-display text-center text-4xl md:text-5xl">What the danger levels mean</h2></Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["LOW", "bg-[#7a6a62]", "Usually a label problem", "The label is wrong or the medicine looks different (colour, shape, smell). The medicine itself may be fine."],
              ["MEDIUM", "bg-[#b46a00]", "May not work as it should", "Wrong amount of medicine (too little or too much), the tablet does not dissolve properly, too many impurities, or a physical test failed (like pH or volume)."],
              ["HIGH", "bg-[#b42318]", "The most serious", "Fake medicine, a product that should be germ-free but is not (sterility), particles inside, or germs found. Also a wrong amount of medicine in an injection or eye drop. Stop using it and talk to your doctor today."]
            ].map(([lvl, bg, t, d], i) => (
              <Reveal key={lvl} delay={i * 180}>
                <div className="h-full rounded-3xl border border-white/60 bg-white/80 p-6 text-[#2b2320] shadow-[0_20px_60px_-30px_rgba(120,60,40,0.5)] backdrop-blur-md">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wider text-white ${bg}`}>{lvl}</span>
                  <h3 className="mt-4 text-xl font-medium">{t}</h3>
                  <p className="mt-2 leading-relaxed text-[#4a3d38]">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* 4. the story: darkest part, one light for each child */}
        <section className="mx-auto flex max-w-5xl flex-col justify-center px-6 py-16 text-center md:py-20">
          <Reveal><p className="text-sm uppercase tracking-[0.3em] text-[#ffd9a8]/80">Why I built Medi-Flaw</p></Reveal>
          <Reveal delay={200}>
            <p className="mx-auto mt-8 max-w-2xl text-xl leading-relaxed text-[#f1e7da] md:text-2xl">
              In 2025, in Madhya Pradesh, small children with a simple cough were given a syrup called Coldrif.
            </p>
          </Reveal>
          <Reveal delay={350}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#d9cdbf]">
              Lab tests later found it had <b className="text-white">48.6% diethylene glycol</b>, a poison used in paint and brake fluid. The safe limit is 0.1%.
              <b className="text-white"> More than 20 children died</b> of kidney failure. Most of them were under five years old.
            </p>
          </Reveal>
          <Reveal delay={500}>
            <p className="mx-auto mt-6 max-w-2xl text-xl italic text-[#f1e7da]">Their parents trusted the medicine. They had no way to know.</p>
          </Reveal>

          <Reveal>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#d9cdbf]">
              It was not the first time. In 2022, <b className="text-white">70 children in The Gambia</b> died after taking cough syrups made in India.
              Children in <b className="text-white">Uzbekistan</b> also died from an Indian-made syrup, and that company&apos;s licence was cancelled.
            </p>
          </Reveal>

          <Reveal delay={250}>
            <p className="mx-auto mt-10 max-w-2xl text-2xl font-medium leading-snug text-white md:text-3xl">
              But cancelling a licence cannot bring back the lives that were lost.
            </p>
          </Reveal>
        </section>

        {/* 8. day */}
        <section className="relative flex min-h-[62svh] flex-col items-center justify-center overflow-hidden px-6 pb-24 text-center text-[#2b2320]">
          <img src="/landscape.svg" alt="" aria-hidden className="absolute inset-x-0 bottom-0 h-[75%] w-full object-cover opacity-90"
            style={{ maskImage: "linear-gradient(to bottom, transparent, black 35%)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black 35%)" }} />
          <div className="relative">
            <Reveal><h2 className="h-display mx-auto max-w-4xl text-4xl md:text-6xl">A medicine should heal, not harm.</h2></Reveal>
            <Reveal delay={150}>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[#4a3d38]">
                When a batch is found to be bad, every day counts. The faster shops and families know, the fewer people take it.
                <b> That is why I built Medi-Flaw.</b>
              </p>
            </Reveal>
            <Reveal delay={250}><div className="mt-10"><Logo size={34} /></div></Reveal>
            <Reveal delay={200}>
              <p className="h-display mx-auto mt-6 max-w-4xl text-3xl font-semibold leading-tight md:text-5xl">
                Check with Medi-Flaw, and give medicine to your parents and children with peace of mind.
              </p>
            </Reveal>
            <Reveal delay={400}>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link href="/" className="btn px-6 py-3 text-base hover:no-underline">Check a batch now</Link>
                <Link href="/welcome" className="btn-light px-6 py-3 text-base hover:no-underline">Create a free account</Link>
              </div>
            </Reveal>
            <p className="mt-10 text-xs text-[#5b4d47]">Data: CDSCO &ldquo;Not of Standard Quality&rdquo; drug alerts, Government of India. Information only, not medical advice.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
