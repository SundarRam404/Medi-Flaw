/** @type {import('tailwindcss').Config} */
// Medi-Flaw "Swiss Grid" theme: black, white, signal red, sharp corners, Funnel Display.
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    borderRadius: { none: "0", sm: "0", DEFAULT: "0", md: "0", lg: "0", xl: "0", full: "9999px" },
    extend: {
      colors: {
        ink: "#111111",
        muted: "#5c5c5c",
        line: "#dcdcdc",
        paper: "#f3f3f1",
        brand: { DEFAULT: "#E10600", dark: "#111111", light: "#fdeceb" },
        bad: { DEFAULT: "#E10600", light: "#fdeceb" },
        warn: { DEFAULT: "#a35200", light: "#fdf1e2" },
        ok: { DEFAULT: "#0a7a3b", light: "#e7f4ec" },
      },
      fontFamily: {
        sans: ["'Funnel Display'", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
