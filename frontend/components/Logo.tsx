// The Medi-Flaw wordmark: "medı" + "flaw", with a two-colour capsule as the dot of the i.
export default function Logo({ size = 24, light = false }: { size?: number; light?: boolean }) {
  const main = light ? "#ffffff" : "#2b2320";
  return (
    <span aria-label="Medi-Flaw" role="img"
      className="inline-block select-none whitespace-nowrap font-semibold leading-none tracking-[-0.03em]"
      style={{ fontSize: size }}>
      <span style={{ color: main }}>
        med
        <span className="relative inline-block">
          {"ı"}
          <i aria-hidden className="absolute left-1/2 top-[0.02em] block"
            style={{
              width: "0.44em", height: "0.22em", borderRadius: "0.11em",
              transform: "translateX(-50%) rotate(-35deg)",
              background: `linear-gradient(90deg, ${main} 50%, #c2410c 50%)`,
            }} />
        </span>
      </span>
      <span style={{ color: "#c2410c" }}>flaw</span>
    </span>
  );
}
