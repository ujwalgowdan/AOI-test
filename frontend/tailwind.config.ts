import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        innotech: {
          DEFAULT: "#0d4d8c",
          dark: "#0a3a6a",
          accent: "#10b981",
        },
        pass: "#10b981",
        fail: "#ef4444",
        neutral: "#475569",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
