// The Medi-Flaw wordmark: "medi-flaw", with a small two-colour capsule as the dot of the i.
export default function Logo({ size = 24, light = false }: { size?: number; light?: boolean }) {
  const main = light ? "#ffffff" : "#2b2320";
  return (
    <span aria-label="Medi-Flaw" role="img"
      className="inline-block select-none whitespace-nowrap font-semibold leading-none tracking-[-0.02em]"
      style={{ fontSize: size }}>
      <span style={{ color: main }}>
        med
        <span className="relative inline-block" style={{ padding: "0 0.03em" }}>
          {"ı"}
          <i aria-hidden className="absolute block"
            style={{
              left: "50%", top: "0.13em",
              width: "0.26em", height: "0.12em", borderRadius: "0.06em",
              transform: "translateX(-50%) rotate(-35deg)",
              background: `linear-gradient(90deg, ${main} 50%, #c2410c 50%)`,
            }} />
        </span>
        <span style={{ margin: "0 0.02em" }}>-</span>
      </span>
      <span style={{ color: "#c2410c" }}>flaw</span>
    </span>
  );
}
