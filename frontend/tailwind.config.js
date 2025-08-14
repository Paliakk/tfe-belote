/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0f152b",
        card: "#141b35",
        accent: "#7df1b9",
        ink: "#e8ecf3",
        mute: "#aab3c5",
      },
      boxShadow: {
        soft: "0 8px 30px rgba(0,0,0,.35)",
      },
      borderRadius: {
        xl2: "1rem",
      }
    },
  },
  plugins: [],
}
