import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core surfaces
        surface: "#FDFDFB",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f3f4f2",
        "surface-container": "#edeeec",
        "surface-container-high": "#e6e9e6",
        // On-surface (ink)
        "on-surface": "#2D2D2D",
        "on-surface-variant": "#5c605e",
        // Primary (Matcha Green)
        primary: "#4a664c",
        "primary-container": "#C1E1C1",
        "on-primary": "#e9ffe7",
        matcha: "#C1E1C1",
        // Secondary (Pale Yellow)
        secondary: "#6a6003",
        "secondary-container": "#FEF08A",
        // Tertiary (Soft Lavender)
        tertiary: "#68587c",
        "tertiary-container": "#E9D5FF",
        // Error
        error: "#aa371c",
        "error-container": "#fa7150",
        // Outline
        outline: "#787c79",
        "outline-variant": "#afb3b0",
      },
      fontFamily: {
        headline: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Be Vietnam Pro", "sans-serif"],
        label: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.75rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
        full: "9999px",
      },
      boxShadow: {
        hard: "4px 4px 0px 0px rgba(45,45,45,1)",
        "hard-sm": "2px 2px 0px 0px rgba(45,45,45,1)",
        "hard-xs": "1px 1px 0px 0px rgba(45,45,45,1)",
      },
      keyframes: {
        pulse_record: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(250,113,80,0.5)" },
          "50%": { boxShadow: "0 0 0 8px rgba(250,113,80,0)" },
        },
      },
      animation: {
        pulse_record: "pulse_record 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
