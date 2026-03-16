"use client";

import { useState } from "react";
import Badge from "./Badge";
import Button from "./Button";
import { useInView } from "../hooks";
import type { Deal } from "../data";

export default function DealCard({
  deal,
  delay = 0,
}: {
  deal: Deal;
  delay?: number;
}) {
  const [hover, setHover] = useState(false);
  const { ref, visible } = useInView();
  const sold = deal.status === "sold-out";
  const pct = Math.round((1 - deal.dealPrice / deal.originalPrice) * 100);

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="overflow-hidden relative"
      style={{
        background: "var(--surface-white)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-subtle)",
        boxShadow: sold
          ? "var(--shadow-sm)"
          : hover
          ? "var(--shadow-deal-card-hover)"
          : "var(--shadow-deal-card)",
        transform: hover && !sold ? "translateY(-4px)" : "none",
        transition: "all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        opacity: visible ? 1 : 0,
        animation: visible ? `fadeUp 0.5s ease ${delay}ms both` : "none",
        filter: sold ? "grayscale(0.3)" : "none",
      }}
    >
      {/* Card Hero */}
      <div
        className="p-5 relative"
        style={{
          background: "linear-gradient(135deg, var(--neutral-950), var(--neutral-800))",
        }}
      >
        {sold && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: "rgba(0,0,0,0.5)" }}>
            <span className="font-mono text-sm font-extrabold tracking-[0.15em] uppercase" style={{ color: "var(--neutral-400)", background: "rgba(0,0,0,0.6)", padding: "8px 20px", borderRadius: "var(--radius-full)" }}>
              SOLD OUT
            </span>
          </div>
        )}
        <Badge>DROP</Badge>
        <div className="font-display text-xl font-bold text-white mt-3">{deal.restaurant}</div>
        <div className="font-display text-[13px] mt-1" style={{ color: "var(--neutral-400)" }}>
          {deal.cuisine} · {deal.distance}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5">
        <div className="flex items-baseline gap-2 mb-3 flex-wrap">
          <span className="font-mono text-4xl font-extrabold leading-none" style={{ color: "var(--brand-primary)" }}>
            ${deal.dealPrice}
          </span>
          <span className="font-mono text-lg line-through" style={{ color: "var(--neutral-400)" }}>
            ${deal.originalPrice}
          </span>
          <Badge type="savings">{pct}% OFF</Badge>
        </div>

        <div className="flex justify-between items-center mb-4">
          <span className="font-display text-[13px] font-semibold" style={{ color: sold ? "var(--neutral-400)" : "var(--amber-500)" }}>
            {sold ? "All claimed this week" : `🔥 Only ${deal.remaining} left`}
          </span>
          {!sold && (
            <span
              className="font-mono text-xs font-bold"
              style={{
                color: "var(--brand-primary)",
                background: "var(--red-50)",
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
              }}
            >
              {deal.expiresIn}
            </span>
          )}
        </div>

        <Button full disabled={sold}>
          {sold ? "Sold Out" : "Grab This Drop"}
        </Button>
      </div>
    </div>
  );
}
