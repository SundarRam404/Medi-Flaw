/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1f23",
        muted: "#5f6670",
        line: "#dfe2e6",
        paper: "#f6f7f8",
        brand: { DEFAULT: "#0f5c4c", dark: "#0a4639", light: "#e6f0ed" },
        bad: { DEFAULT: "#b3261e", light: "#fbeceb" },
        warn: { DEFAULT: "#9a5b00", light: "#fdf3e1" },
        ok: { DEFAULT: "#1e6b34", light: "#e8f3eb" },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
