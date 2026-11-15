// 10 preset avatars (emoji on a soft colour). Users pick one in their profile menu.
export const AVATARS: { id: string; e: string; bg: string }[] = [
  { id: "a1", e: "\u{1F48A}", bg: "#fde4dc" }, { id: "a2", e: "\u{1FA7A}", bg: "#e3f1e7" },
  { id: "a3", e: "\u{1F9EA}", bg: "#ede4f3" }, { id: "a4", e: "\u{1F33F}", bg: "#e8f0dc" },
  { id: "a5", e: "\u{1F989}", bg: "#f4ece4" }, { id: "a6", e: "\u{1F43C}", bg: "#ececec" },
  { id: "a7", e: "\u{1F42F}", bg: "#fdf0d5" }, { id: "a8", e: "\u{1F422}", bg: "#dff1ee" },
  { id: "a9", e: "\u{1F98B}", bg: "#e4ecfb" }, { id: "a10", e: "\u{1F338}", bg: "#fbe4ef" },
];

export default function Avatar({ user, size = 34 }: { user: any; size?: number }) {
  const a = AVATARS.find((x) => x.id === user?.avatar);
  const letter = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full border border-white shadow-sm"
      style={{ width: size, height: size, background: a ? a.bg : "#fdeee6", fontSize: a ? size * 0.55 : size * 0.42 }}>
      {a ? <span aria-hidden>{a.e}</span> : <span className="font-medium text-brand">{letter}</span>}
    </span>
  );
}
