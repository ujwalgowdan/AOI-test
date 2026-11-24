import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        innotech: {
          DEFAULT: "rgb(var(--blue-rgb) / <alpha-value>)",
          dark: "rgb(var(--blue-dark-rgb) / <alpha-value>)",
          accent: "rgb(var(--pass-rgb) / <alpha-value>)",
        },
        pass: "rgb(var(--pass-rgb) / <alpha-value>)",
        fail: "rgb(var(--fail-rgb) / <alpha-value>)",
        bull: "#ff9800",
        neutral: "#475569",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
