"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// "Medi", the floating assistant: waves every 4 s, can be dragged anywhere, opens a chat on click.
// On phones only the head is shown, smaller, so it covers less of the screen.
const BIG = { w: 92, h: 112 }, HEAD = { w: 58, h: 46 };
let W = BIG.w, H = BIG.h;
const LINES = ["Hi! Ask me anything \u{1F44B}", "Click me to chat", "Is your batch safe? Ask me!", "I’m powered by AI ✨"];
const DRAG_LINES = ["Wheee!", "Whoa, careful!", "I can fly!", "Put me down! \u{1F604}", "Weeeee!"];
const HIDE = ["/welcome", "/login", "/privacy", "/terms", "/letter", "/ask", "/watchlist/report"];
const WAIT = [[0, "Reading the records..."], [3, "Finding the right batches..."], [7, "Writing the answer..."], [14, "Almost there, thanks for waiting..."]] as const;
const EXAMPLES = ["Is batch SHT7550 safe?", "Which companies failed most in 2025?", "What is the most common failure?"];

type Msg = { role: "you" | "bot"; text: string; sources?: any[] };

function clampPos(x: number, y: number) {
  return {
    x: Math.min(Math.max(8, x), window.innerWidth - W - 8),
    y: Math.min(Math.max(8, y), window.innerHeight - H - 8),
  };
}

function Answer({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="space-y-1.5">
      {lines.map((l, i) => {
        const bullet = /^([-*•]|\d+[.)])\s+/.test(l);
        const clean = l.replace(/^([-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, "");
        const parts = clean.split(/(\[[A-Z][\w\-]*\])/g);
        return (
          <p key={i} className={bullet ? "border-l-2 border-line pl-2" : ""}>
            {parts.map((p, j) => /^\[[A-Z][\w\-]*\]$/.test(p)
              ? <span key={j} className="ml-0.5 rounded bg-sand px-1 font-mono text-[10px] text-muted">{p.slice(1, -1)}</span>
              : <span key={j}>{p}</span>)}
          </p>
        );
      })}
    </div>
  );
}

function srcLink(s: any) {
  if (s.kind === "record") return `/records/${s.ref}`;
  if (s.kind === "company") return `/companies/${s.ref}`;
  return null;
}

function Robot({ drag, busy, head = false }: { drag: boolean; busy: boolean; head?: boolean }) {
  const eye = "#ffe7d6", ink = "#2b2320", shell = "#fffaf5", mauve = "#9c7a9e", tc = "#c2410c";
  return (
    <svg viewBox={head ? "9 0 82 62" : "0 0 100 122"} width={head ? HEAD.w : BIG.w} height={head ? HEAD.h : BIG.h} aria-hidden className={`overflow-visible ${head ? "headonly" : ""}`}>
      <defs>
        <clipPath id="mfpill"><rect x="-7" y="-3.2" width="14" height="6.4" rx="3.2" /></clipPath>
      </defs>
      {!head && <ellipse className="sh" cx="50" cy="117" rx="22" ry="4" fill="rgba(43,35,32,.18)" />}
      <g className="b">
        {!head && <>
        {/* legs */}
        <g className="lg1"><rect x="38" y="90" width="9" height="13" rx="4.5" fill={mauve} stroke={ink} strokeWidth="2" /><ellipse cx="42.5" cy="104" rx="7" ry="4.5" fill={tc} stroke={ink} strokeWidth="2" /></g>
        <g className="lg2"><rect x="53" y="90" width="9" height="13" rx="4.5" fill={mauve} stroke={ink} strokeWidth="2" /><ellipse cx="57.5" cy="104" rx="7" ry="4.5" fill={tc} stroke={ink} strokeWidth="2" /></g>
        {/* arms */}
        <g className="al"><rect x="21" y="64" width="9" height="20" rx="4.5" fill={mauve} stroke={ink} strokeWidth="2" /><circle cx="25.5" cy="86" r="5" fill={shell} stroke={ink} strokeWidth="2" /></g>
        <g className="ar"><rect x="70" y="64" width="9" height="20" rx="4.5" fill={mauve} stroke={ink} strokeWidth="2" /><circle cx="74.5" cy="86" r="5" fill={shell} stroke={ink} strokeWidth="2" /></g>
        {/* body */}
        <rect x="44" y="55" width="12" height="7" fill="#e9ddd3" stroke={ink} strokeWidth="2" />
        <rect x="30" y="60" width="40" height="32" rx="15" fill={shell} stroke={ink} strokeWidth="2.5" />
        <circle cx="50" cy="75" r="8" fill="none" stroke="#ecd9cc" strokeWidth="2" />
        <circle className="heart" cx="50" cy="75" r="5" fill={tc} />
        </>}
        {/* antenna with the logo pill */}
        <line x1="50" y1="14" x2="50" y2="6" stroke={ink} strokeWidth="2" />
        <g transform="translate(50 4) rotate(-35)">
          <g clipPath="url(#mfpill)"><rect x="-7" y="-3.2" width="7" height="6.4" fill={ink} /><rect x="0" y="-3.2" width="7" height="6.4" fill={tc} /></g>
        </g>
        {/* head */}
        <circle cx="18" cy="35" r="6" fill={tc} stroke={ink} strokeWidth="2" />
        <circle cx="82" cy="35" r="6" fill={tc} stroke={ink} strokeWidth="2" />
        <rect x="20" y="13" width="60" height="44" rx="20" fill={shell} stroke={ink} strokeWidth="2.5" />
        <rect x="27" y="21" width="46" height="29" rx="13" fill={ink} />
        <path d="M31 25 Q36 22 44 22" stroke="rgba(255,255,255,.18)" strokeWidth="2" fill="none" strokeLinecap="round" />
        {drag ? (
          <>
            <polyline points="36,29 42,33.5 36,38" stroke={eye} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="64,29 58,33.5 64,38" stroke={eye} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <ellipse cx="50" cy="44" rx="3" ry="3.4" fill={eye} />
          </>
        ) : (
          <>
            <g className={busy ? "look" : ""}>
              <rect className="eye" x="36" y="28" width="8" height="11" rx="4" fill={eye} />
              <rect className="eye" x="56" y="28" width="8" height="11" rx="4" fill={eye} />
              <circle cx="42" cy="30.5" r="1.3" fill={ink} opacity=".35" />
              <circle cx="62" cy="30.5" r="1.3" fill={ink} opacity=".35" />
            </g>
            <path d="M45 43.5 Q50 47.5 55 43.5" stroke={eye} strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        )}
        <circle cx="32.5" cy="44" r="2.4" fill={tc} opacity=".55" />
        <circle cx="67.5" cy="44" r="2.4" fill={tc} opacity=".55" />
      </g>
    </svg>
  );
}

export default function RoboChat() {
  const path = usePathname() || "/";
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [tilt, setTilt] = useState(0);
  const [landed, setLanded] = useState(false);
  const [line, setLine] = useState(0);
  const [dragLine, setDragLine] = useState("");
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [waited, setWaited] = useState(0);
  const st = useRef({ sx: 0, sy: 0, ox: 0, oy: 0, moved: false, active: false, lx: 0, lt: 0, skipClick: false });
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const small = window.innerWidth < 640;
    setMobile(small);
    W = small ? HEAD.w : BIG.w; H = small ? HEAD.h : BIG.h;
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem("mf_bot") || "null"); } catch {}
    setPos(saved ? clampPos(saved.x, saved.y) : clampPos(window.innerWidth - W - 24, window.innerHeight - H - 24));
    const onResize = () => {
      const sm = window.innerWidth < 640;
      setMobile(sm);
      W = sm ? HEAD.w : BIG.w; H = sm ? HEAD.h : BIG.h;
      setPos((p) => (p ? clampPos(p.x, p.y) : p));
    };
    window.addEventListener("resize", onResize);
    const t = setInterval(() => setLine((l) => (l + 1) % LINES.length), 4000);
    return () => { window.removeEventListener("resize", onResize); clearInterval(t); };
  }, []);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    if (!busy) { setWaited(0); return; }
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 50); }, [open]);

  if (!pos || HIDE.some((p) => path === p || path.startsWith(p + "/"))) return null;

  function down(e: React.PointerEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    st.current = { ...st.current, sx: e.clientX, sy: e.clientY, ox: pos!.x, oy: pos!.y, moved: false, active: true, lx: e.clientX, lt: performance.now() };
  }
  function move(e: React.PointerEvent) {
    const s = st.current;
    if (!s.active) return;
    const dx = e.clientX - s.sx, dy = e.clientY - s.sy;
    if (!s.moved && Math.hypot(dx, dy) > 6) {
      s.moved = true;
      setDrag(true);
      setDragLine(DRAG_LINES[Math.floor(Math.random() * DRAG_LINES.length)]);
    }
    if (!s.moved) return;
    setPos(clampPos(s.ox + dx, s.oy + dy));
    const now = performance.now();
    const vx = ((e.clientX - s.lx) / Math.max(1, now - s.lt)) * 16;
    s.lx = e.clientX; s.lt = now;
    setTilt(Math.max(-28, Math.min(28, vx * 3)));
  }
  function up() {
    const s = st.current;
    if (!s.active) return;
    s.active = false;
    if (s.moved) {
      s.skipClick = true;
      setDrag(false); setTilt(0); setLanded(true);
      setTimeout(() => setLanded(false), 600);
      setPos((p) => { if (p) try { localStorage.setItem("mf_bot", JSON.stringify(p)); } catch {} return p; });
    }
  }
  function click() {
    if (st.current.skipClick) { st.current.skipClick = false; return; }
    setOpen((o) => !o);
  }

  async function ask(text?: string) {
    const question = (text ?? q).trim();
    if (question.length < 3 || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "you", text: question }]);
    setBusy(true);
    try {
      const r = await api("/api/ask", { method: "POST", body: JSON.stringify({ question }) });
      setMsgs((m) => [...m, { role: "bot", text: r.answer, sources: r.sources }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "bot", text: `Sorry, I could not answer that right now. ${e.message || ""}` }]);
    }
    setBusy(false);
  }

  const right = pos.x + W / 2 > (typeof window !== "undefined" ? window.innerWidth / 2 : 0);
  const nearTop = pos.y < 60;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const PW = Math.min(360, vw - 16), PH = Math.min(480, vh - 16);
  const panel = vw < 640
    ? { left: 8, top: vh - PH - 8 }
    : { left: right ? Math.max(8, pos.x - PW - 12) : Math.min(vw - PW - 8, pos.x + W + 12), top: Math.min(Math.max(8, pos.y + H - PH), vh - PH - 8) };

  const bubble = drag ? dragLine : open ? "" : LINES[line];

  return (
    <>
      <style>{`
        .mfbot .b{animation:mfbob 3s ease-in-out infinite}
        .mfbot .sh{transform-origin:50px 117px;animation:mfsh 3s ease-in-out infinite}
        .mfbot .ar{transform-origin:74px 66px;animation:mfwave 4s ease-in-out infinite}
        .mfbot .al{transform-origin:26px 66px}
        .mfbot .lg1{transform-origin:42px 91px}.mfbot .lg2{transform-origin:57px 91px}
        .mfbot .headonly .b{animation:mfnod 4s ease-in-out infinite;transform-origin:50px 40px}
        @keyframes mfnod{0%,100%{transform:rotate(0)}8%{transform:rotate(-10deg)}16%{transform:rotate(8deg)}24%{transform:rotate(-6deg)}32%{transform:rotate(0)}}
        .mfbot .eye{transform-box:fill-box;transform-origin:center;animation:mfblink 5s infinite}
        .mfbot .heart{transform-box:fill-box;transform-origin:center;animation:mfpulse 1.6s ease-in-out infinite}
        .mfbot .look{animation:mflook .9s ease-in-out infinite alternate}
        .mfbot-drag .b{animation:none}
        .mfbot-drag .ar{animation:mfflapR .2s ease-in-out infinite alternate}
        .mfbot-drag .al{animation:mfflapL .2s ease-in-out infinite alternate}
        .mfbot-drag .lg1{animation:mfkick .16s ease-in-out infinite alternate}
        .mfbot-drag .lg2{animation:mfkick .16s ease-in-out infinite alternate-reverse}
        .mfbot-drag .sh{animation:none;transform:scale(.55);opacity:.5}
        .mfbot-land{animation:mfsquash .55s ease-out;transform-origin:50% 100%}
        .mf-say{animation:mfsay 4s ease-in-out both}
        .mf-say-drag{animation:mfpop .25s ease-out both}
        @keyframes mfbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes mfsh{0%,100%{transform:scaleX(1);opacity:1}50%{transform:scaleX(.8);opacity:.6}}
        @keyframes mfwave{0%{transform:rotate(0)}6%{transform:rotate(-155deg)}10%{transform:rotate(-120deg)}14%{transform:rotate(-160deg)}18%{transform:rotate(-120deg)}22%{transform:rotate(-155deg)}30%,100%{transform:rotate(0)}}
        @keyframes mfblink{0%,93%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
        @keyframes mfpulse{50%{transform:scale(1.25);opacity:.75}}
        @keyframes mflook{from{transform:translateX(-2.5px)}to{transform:translateX(2.5px)}}
        @keyframes mfflapR{from{transform:rotate(-35deg)}to{transform:rotate(-125deg)}}
        @keyframes mfflapL{from{transform:rotate(35deg)}to{transform:rotate(125deg)}}
        @keyframes mfkick{from{transform:rotate(-22deg)}to{transform:rotate(22deg)}}
        @keyframes mfsquash{0%{transform:scale(1.18,.8)}40%{transform:scale(.9,1.12)}70%{transform:scale(1.05,.96)}100%{transform:scale(1)}}
        @keyframes mfsay{0%{opacity:0;transform:translateY(6px) scale(.9)}7%,38%{opacity:1;transform:none}46%,100%{opacity:0;transform:translateY(-3px)}}
        @keyframes mfpop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){.mfbot *,.mf-say{animation:none!important}}
      `}</style>

      <div className="fixed z-40" style={{ left: pos.x, top: pos.y, width: W, height: H, transition: drag ? "none" : "left .2s ease-out, top .2s ease-out" }}>
        {bubble && (
          <div key={drag ? "d" + dragLine : "l" + line}
            className={`pointer-events-none absolute whitespace-nowrap rounded-2xl border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-soft ${drag ? "mf-say-drag" : "mf-say"}`}
            style={{ [nearTop ? "top" : "bottom"]: nearTop ? H + 4 : H - 2, [right ? "right" : "left"]: 4 } as any}>
            {bubble}
          </div>
        )}
        <button type="button" aria-label="Chat with Medi, the Medi-Flaw assistant" aria-expanded={open}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}
          className={`mfbot block h-full w-full touch-none select-none outline-none focus-visible:ring-4 focus-visible:ring-[#f6dccf] ${drag ? "mfbot-drag cursor-grabbing" : "cursor-grab"} ${landed ? "mfbot-land" : ""}`}>
          <div style={{ transform: `rotate(${tilt}deg) scale(${drag ? 1.08 : 1})`, transition: "transform .15s ease-out", transformOrigin: "50% 20%" }}>
            <Robot drag={drag} busy={busy} head={mobile} />
          </div>
        </button>
      </div>

      {open && (
        <div role="dialog" aria-label="Chat with Medi"
          className="fixed z-50 flex flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-soft"
          style={{ left: panel.left, top: panel.top, width: PW, height: PH }}>
          <div className="flex items-center justify-between gap-2 border-b border-line bg-paper px-4 py-3">
            <div>
              <div className="text-sm font-medium">Medi, your medicine assistant</div>
              <div className="text-[11px] text-muted">Powered by AI &middot; answers only from CDSCO records</div>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/ask" className="rounded-full px-2 py-1 text-[11px] text-muted hover:bg-sand hover:text-ink hover:no-underline" onClick={() => setOpen(false)}>Full page</Link>
              <button aria-label="Close chat" className="grid h-7 w-7 place-items-center rounded-full text-lg text-muted hover:bg-sand hover:text-ink" onClick={() => setOpen(false)}>&times;</button>
            </div>
          </div>

          <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-sand px-3 py-2">
              Hi, I&rsquo;m Medi! Ask me about any batch, company, year or failure type. I only answer from the government records.
            </div>
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => ask(e)}>{e}</button>)}
              </div>
            )}
            {msgs.map((m, i) => m.role === "you" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-ink px-3 py-2 text-white">{m.text}</div>
            ) : (
              <div key={i} className="max-w-[92%] rounded-2xl rounded-tl-md bg-sand px-3 py-2 leading-relaxed">
                <Answer text={m.text} />
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 border-t border-line pt-1.5 text-[11px] text-muted">
                    Sources:{" "}
                    {m.sources.slice(0, 3).map((s: any, j: number) => {
                      const href = srcLink(s);
                      return <span key={s.id}>{j > 0 && ", "}{href ? <Link href={href} onClick={() => setOpen(false)}>{s.id}</Link> : s.id}</span>;
                    })}
                    {m.sources.length > 3 && ` +${m.sources.length - 3} more`}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="inline-flex items-center gap-2.5 rounded-2xl rounded-tl-md bg-sand px-3 py-2.5 text-xs text-muted">
                <span className="flex gap-1">
                  {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d * 0.15}s` }} />)}
                </span>
                {[...WAIT].reverse().find(([t]) => waited >= t)?.[1]}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-center gap-2 border-t border-line p-3">
            <input ref={input} className="input rounded-full py-2 text-sm" placeholder="Ask me anything..." value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn shrink-0 px-4 py-2" disabled={busy || q.trim().length < 3}>Send</button>
          </form>
        </div>
      )}
    </>
  );
}
