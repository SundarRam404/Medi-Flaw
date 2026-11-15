/** @type {import('tailwindcss').Config} */
// Medi-Flaw "Warm" theme: cream paper, warm ink, terracotta accent, soft round shapes, Funnel Display.
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#2b2320",
        muted: "#7a6a62",
        line: "#ece2d9",
        paper: "#fbf7f2",
        sand: "#f4ece4",
        brand: { DEFAULT: "#c2410c", dark: "#9a3412", light: "#fdeee6" },
        bad: { DEFAULT: "#b42318", light: "#fde4dc" },
        warn: { DEFAULT: "#9a5b00", light: "#fdf0d5" },
        ok: { DEFAULT: "#2f7a4a", light: "#e3f1e7" },
      },
      fontFamily: {
        sans: ["'Funnel Display'", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(120, 70, 60, 0.25)",
      },
    },
  },
  plugins: [],
};
