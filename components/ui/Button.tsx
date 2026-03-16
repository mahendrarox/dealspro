"use client";

import { useState } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  full?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function Button({
  children,
  variant = "primary",
  full = false,
  disabled = false,
  onClick,
  className = "",
  style = {},
}: ButtonProps) {
  const [hover, setHover] = useState(false);

  const base = "font-display font-bold text-sm tracking-wide border-none rounded-lg transition-all duration-200 inline-flex items-center justify-center";
  const padding = "px-7 py-3.5";
  const width = full ? "w-full" : "";
  const cursor = disabled ? "cursor-not-allowed" : "cursor-pointer";

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: disabled
        ? "var(--neutral-200)"
        : hover
        ? "var(--brand-primary-hover)"
        : "var(--brand-primary)",
      color: disabled ? "var(--neutral-400)" : "#fff",
      boxShadow: hover && !disabled ? "var(--shadow-md)" : "var(--shadow-sm)",
      transform: hover && !disabled ? "translateY(-1px)" : "none",
    },
    secondary: {
      background: "transparent",
      color: "var(--text-primary)",
      border: `2px solid ${hover ? "var(--neutral-400)" : "var(--neutral-300)"}`,
      transform: hover ? "translateY(-1px)" : "none",
    },
    ghost: {
      background: hover ? "var(--neutral-50)" : "transparent",
      color: "var(--text-secondary)",
    },
  };

  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={disabled ? undefined : onClick}
      className={`${base} ${padding} ${width} ${cursor} ${className}`}
      style={{ ...variantStyles[disabled ? "primary" : variant], ...style }}
    >
      {children}
    </button>
  );
}
