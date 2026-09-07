/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Nightlife palette — matched to the existing login screen:
        // warm near-black ground, one amber accent, warm-neutral text.
        base: "#170D0B", // page background — near-black, warm maroon undertone
        surface: "#221410", // cards and raised surfaces, one step up from base
        amber: "#F5A623", // the single accent — every CTA and every tier/price signal
        ink: "#F5F1EE", // primary text — warm white
        haze: "#C9B8AE", // secondary / muted text — warm tan-grey
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
