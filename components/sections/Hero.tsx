"use client";

import CaptureForm from "../ui/CaptureForm";
import DealCard from "../ui/DealCard";
import { mockDeals } from "../data";

export default function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: "linear-gradient(170deg, var(--neutral-950) 0%, #0D0D10 60%, var(--neutral-800) 100%)",
        padding: "120px 20px 80px",
      }}
    >
      {/* Dot texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(var(--neutral-400) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      {/* Red glow */}
      <div
        className="absolute rounded-full"
        style={{
          top: "-20%", right: "-10%", width: "500px", height: "500px",
          background: "radial-gradient(circle, rgba(249,58,37,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-[1120px] mx-auto relative grid grid-cols-1 lg:grid-cols-2 gap-[60px] lg:gap-[60px] items-center">
        {/* Left */}
        <div className="animate-fade-up text-center lg:text-left flex flex-col items-center lg:items-start">
          <h1
            className="font-display font-extrabold leading-[1.15] mb-5"
            style={{
              fontSize: "clamp(28px, 5vw, 44px)",
              letterSpacing: "-0.03em",
              color: "#fff",
            }}
          >
            Exclusive Restaurant Deals.{" "}
            <span style={{ color: "var(--brand-primary)" }}>Limited Drops.</span>{" "}
            Sent to Your Phone.
          </h1>
          <p
            className="font-display text-[17px] leading-relaxed mb-8 max-w-[480px]"
            style={{ color: "var(--text-muted)" }}
          >
            $50 of food for $25. Only 20 per restaurant, per week. No app needed
            — deals delivered straight to your phone via text.
          </p>
          <CaptureForm dark />
        </div>

        {/* Right — Deal Card */}
        <div className="flex justify-center" style={{ animation: "fadeUp 0.6s ease 0.2s both" }}>
          <div className="animate-float max-w-[340px] w-full">
            <DealCard deal={mockDeals[0]} />
          </div>
        </div>
      </div>
    </section>
  );
}
