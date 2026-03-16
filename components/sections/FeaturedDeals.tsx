"use client";

import { useInView } from "../hooks";
import DealCard from "../ui/DealCard";
import { mockDeals } from "../data";

export default function FeaturedDeals() {
  const { ref, visible } = useInView();
  return (
    <section id="featured-deals" className="py-20 px-5" style={{ background: "var(--surface-off-white)" }}>
      <div className="max-w-[1120px] mx-auto">
        <div
          ref={ref}
          className="text-center mb-12"
          style={{ opacity: visible ? 1 : 0, animation: visible ? "fadeUp 0.5s ease both" : "none" }}
        >
          <div className="font-display text-xs font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "var(--brand-primary)" }}>
            This Week&apos;s Drops
          </div>
          <h2 className="font-display font-bold leading-tight" style={{ fontSize: "clamp(24px, 4vw, 36px)", letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Deals Going Fast
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockDeals.map((deal, i) => (
            <DealCard key={deal.id} deal={deal} delay={i * 120} />
          ))}
        </div>
      </div>
    </section>
  );
}
