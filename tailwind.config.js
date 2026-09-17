/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // White theme — brown text/accents, amber unchanged as the accent.
        base: "#FFFFFF", // page background — white
        surface: "#EDE0D3", // cards — warm light tan, visibly different from pure white
        amber: "#F5A623", // unchanged — yellow accent
        ink: "#170D0B", // primary text — dark brown (was the old dark background color)
        haze: "#6B584E", // secondary / muted text — muted brown
      },
      fontFamily: {
        display: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      boxShadow: {
        hero: "0 24px 60px -20px rgba(0,0,0,0.7)",
        card: "0 8px 24px -12px rgba(0,0,0,0.55)",
      },
    },
  },
  plugins: [],
}
