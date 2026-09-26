/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ahununu Logistics brand palette — swap here to retheme the entire app.
        // Primary: #0B7A6B  (Ahununu teal-green)
        // Secondary: #AED580 (Ahununu light-green)
        brand: {
          DEFAULT: "#0B7A6B", // Ahununu primary teal-green
          light: "#0D9A87",   // lighter shade for hover states
          dark: "#085E52",    // darker shade for pressed / active states
        },
        accent: {
          DEFAULT: "#AED580", // Ahununu secondary light-green — highlights, badges, CTAs
          light: "#C5E8A0",   // lighter tint for backgrounds
          dark: "#7DAA50",    // darker shade for text on light backgrounds
        },
        // Neutral scale — unchanged, used for text / borders / backgrounds
        slate2: {
          50: "#F6F7F9",
          100: "#EEF1F4",
          200: "#E4E7EC",
          300: "#CBD2DA",
          400: "#98A5B3",
          500: "#5B6B7A",
          600: "#3B5166",
          700: "#28394A",
          800: "#16202A",
        },
        // Semantic colors — kept as-is; do NOT replace these with brand colors.
        success: "#1F9D63",   // green for success states
        danger: "#D64545",    // red for errors / destructive / delete
        warning: "#D97706",   // amber for warnings / pending
      },
      fontFamily: {
        sans: ["'Roboto'", "sans-serif"],
        display: ["'Roboto'", "sans-serif"],
        body: ["'Roboto'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(16, 24, 40, 0.06), 0 1px 3px 0 rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
};
