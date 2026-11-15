// The Medi-Flaw wordmark: "medı" + "flaw", with a two-colour capsule as the dot of the i.
export default function Logo({ dark = true, size = 26 }: { dark?: boolean; size?: number }) {
  const main = dark ? "#ffffff" : "#111111";
  return (
    <span aria-label="Medi-Flaw" role="img"
      className="inline-block select-none whitespace-nowrap font-extrabold leading-none tracking-[-0.03em]"
      style={{ fontSize: size }}>
      <span style={{ color: main }}>
        med
        <span className="relative inline-block">
          {"ı"}
          <i aria-hidden className="absolute left-1/2 top-[0.02em] block"
            style={{
              width: "0.44em", height: "0.22em", borderRadius: "0.11em",
              transform: "translateX(-50%) rotate(-35deg)",
              background: `linear-gradient(90deg, ${main} 50%, #E10600 50%)`,
            }} />
        </span>
      </span>
      <span style={{ color: "#E10600" }}>flaw</span>
    </span>
  );
}
