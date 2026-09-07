/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Nightlife palette — deep aubergine, one magenta CTA, one gold tier signal.
        base: "#14101F", // page background
        surface: "#1E1830", // cards and raised surfaces
        magenta: "#FF3D81", // primary CTAs only
        gold: "#FFB020", // premium / tier signals only
        ink: "#F5F1FA", // primary text
        haze: "#A99BC2", // secondary / muted text
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
        hero: "0 24px 60px -20px rgba(0,0,0,0.65)",
        card: "0 8px 24px -12px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
}
