"use client";

import { useInView } from "../hooks";
import { Icons } from "../ui/Icons";

const steps = [
  { icon: Icons.phone, title: "Enter Your Name & Phone", desc: "Sign up in 10 seconds. No app to download, no account to create." },
  { icon: Icons.message, title: "Get Weekly Deals", desc: "Limited half-price deals from local restaurants, delivered via text every week." },
  { icon: Icons.qr, title: "Pay & Redeem", desc: "Prepay online at half price. Show your QR code at the restaurant." },
];

function StepCard({ step, index }: { step: typeof steps[0]; index: number }) {
  const { ref, visible } = useInView();
  return (
    <div
      ref={ref}
      className="text-center p-8"
      style={{
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-subtle)",
        opacity: visible ? 1 : 0,
        animation: visible ? `fadeUp 0.5s ease ${index * 120}ms both` : "none",
      }}
    >
      <div
        className="w-[60px] h-[60px] flex items-center justify-center mx-auto mb-4"
        style={{ borderRadius: "var(--radius-xl)", background: "var(--red-50)" }}
      >
        {step.icon}
      </div>
      <div className="font-mono text-[11px] font-bold tracking-widest mb-2" style={{ color: "var(--brand-primary)" }}>
        STEP {index + 1}
      </div>
      <h3 className="font-display text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
        {step.title}
      </h3>
      <p className="font-display text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {step.desc}
      </p>
    </div>
  );
}

export default function HowItWorks() {
  const { ref, visible } = useInView();
  return (
    <section id="how-it-works" className="py-20 px-5" style={{ background: "var(--surface-white)" }}>
      <div className="max-w-[1120px] mx-auto">
        <div
          ref={ref}
          className="text-center mb-12"
          style={{ opacity: visible ? 1 : 0, animation: visible ? "fadeUp 0.5s ease both" : "none" }}
        >
          <div className="font-display text-xs font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "var(--brand-primary)" }}>
            How It Works
          </div>
          <h2 className="font-display font-bold leading-tight" style={{ fontSize: "clamp(24px, 4vw, 36px)", letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Three Steps to Half-Price Meals
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <StepCard key={i} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
