import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'DM Sans'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        brand: {
          primary: "var(--brand-primary)",
          hover: "var(--brand-primary-hover)",
          active: "var(--brand-primary-active)",
          muted: "var(--brand-primary-muted)",
          disabled: "var(--brand-primary-disabled)",
        },
        surface: {
          white: "var(--surface-white)",
          "off-white": "var(--surface-off-white)",
          dark: "var(--surface-dark)",
          "dark-elevated": "var(--surface-dark-elevated)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          inverse: "var(--text-inverse)",
        },
        border: {
          subtle: "var(--border-subtle)",
          DEFAULT: "var(--border-default)",
          strong: "var(--border-strong)",
          focus: "var(--border-focus)",
        },
        feedback: {
          error: "var(--error)",
          "error-light": "var(--error-light)",
          success: "var(--success)",
          "success-light": "var(--success-light)",
          warning: "var(--warning)",
        },
      },
      boxShadow: {
        "deal-card": "var(--shadow-deal-card)",
        "deal-card-hover": "var(--shadow-deal-card-hover)",
        focus: "var(--shadow-focus)",
      },
      borderRadius: {
        DEFAULT: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
