"use client";

/**
 * DealsPro Logo Component
 * 
 * PRODUCTION NOTE: Replace the SVG fallback below with your actual logo:
 *   <img src="/logo.png" alt="DealsPro" ... />
 * 
 * Put your logo file at: /public/logo.png
 * Then uncomment the img tag and remove the SVG.
 */
export default function Logo({
  size = 36,
  dark = false,
}: {
  size?: number;
  dark?: boolean;
}) {
  const s = size / 36;

  return (
    <div className="inline-flex items-center" style={{ gap: `${8 * s}px` }}>
      {/* 
        UNCOMMENT THIS when you add /public/logo.png:
        <img 
          src="/logo.png" 
          alt="DealsPro" 
          style={{ width: `${40 * s}px`, height: `${46 * s}px`, objectFit: 'contain' }}
        />
      */}

      {/* SVG fallback — remove when using real logo PNG */}
      <svg
        width={40 * s}
        height={46 * s}
        viewBox="0 0 80 92"
        fill="none"
        style={{ flexShrink: 0, transform: "rotate(-5deg)" }}
      >
        <rect x="3" y="3" width="74" height="60" rx="14" stroke="white" strokeWidth="4" fill="white" />
        <polygon points="44,61 58,82 34,61" fill="white" />
        <rect x="5" y="5" width="70" height="56" rx="12" fill="var(--red-500)" />
        <polygon points="44,59 56,78 34,59" fill="var(--red-500)" />
        <text x="40" y="32" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize="19" fontWeight="400" fill="white">deals</text>
        <text x="40" y="54" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize="25" fontWeight="800" fill="white" letterSpacing="2">PRO</text>
      </svg>

      <span
        className="font-display font-extrabold leading-none"
        style={{
          fontSize: `${20 * s}px`,
          letterSpacing: "-0.02em",
          color: dark ? "var(--text-inverse)" : "var(--text-primary)",
        }}
      >
        Deals<span style={{ color: "var(--brand-primary)" }}>Pro</span>
      </span>
    </div>
  );
}
