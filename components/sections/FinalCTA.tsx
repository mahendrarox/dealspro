"use client";

import CaptureForm from "../ui/CaptureForm";

export default function FinalCTA() {
  return (
    <section
      id="get-deals"
      className="py-20 px-5 text-center"
      style={{ background: "linear-gradient(135deg, var(--red-500) 0%, var(--neutral-950) 100%)" }}
    >
      <div className="max-w-[520px] mx-auto">
        <h2
          className="font-display font-extrabold leading-tight mb-3"
          style={{ fontSize: "clamp(26px, 4vw, 36px)", letterSpacing: "-0.02em", color: "#fff" }}
        >
          Ready to Save?
        </h2>
        <p className="font-display text-base leading-relaxed mb-8" style={{ color: "rgba(255,255,255,0.7)" }}>
          Enter your name and phone to start getting half-price deals from the best local restaurants.
        </p>
        <div className="flex justify-center">
          <CaptureForm dark />
        </div>
        <div className="font-display text-[13px] mt-6" style={{ color: "rgba(255,255,255,0.5)" }}>
          Join 500+ DFW foodies already saving
        </div>
      </div>
    </section>
  );
}
