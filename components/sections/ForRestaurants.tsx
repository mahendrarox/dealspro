"use client";

import { useInView } from "../hooks";
import { Icons } from "../ui/Icons";
import Button from "../ui/Button";

const points = [
  "Limited to 20 deals per week — no Groupon floods",
  "Customers prepay — guaranteed revenue before they walk in",
  "Accept or decline each deal via text — full control",
  "No POS changes. No hardware. No setup fee.",
];

const smsMessages = [
  { from: "sys", text: "🔔 New DealsPro order!\n\nCustomer: Sarah M.\nDeal: $50 for $25\n\nReply ACCEPT or DECLINE" },
  { from: "rest", text: "ACCEPT" },
  { from: "sys", text: "✅ Confirmed! Sarah has been notified and will receive her QR code." },
];

export default function ForRestaurants() {
  const { ref: headerRef, visible: headerVis } = useInView();
  const { ref: contentRef, visible: contentVis } = useInView();

  return (
    <section id="for-restaurants" className="py-20 px-5" style={{ background: "var(--surface-white)" }}>
      <div className="max-w-[1120px] mx-auto">
        <div
          ref={headerRef}
          className="text-center mb-12"
          style={{ opacity: headerVis ? 1 : 0, animation: headerVis ? "fadeUp 0.5s ease both" : "none" }}
        >
          <div className="font-display text-xs font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "var(--brand-primary)" }}>
            For Restaurants
          </div>
          <h2 className="font-display font-bold leading-tight" style={{ fontSize: "clamp(24px, 4vw, 36px)", letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Fill Empty Tables Without Discounting Your Brand
          </h2>
        </div>

        <div
          ref={contentRef}
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          style={{ opacity: contentVis ? 1 : 0, animation: contentVis ? "fadeUp 0.5s ease both" : "none" }}
        >
          {/* Value Props */}
          <div className="flex flex-col gap-5">
            {points.map((point, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "var(--green-50)" }}
                >
                  {Icons.check}
                </div>
                <span className="font-display text-[15px] leading-relaxed font-medium" style={{ color: "var(--text-primary)" }}>
                  {point}
                </span>
              </div>
            ))}
            <div className="mt-2">
              <Button variant="secondary">Partner With Us</Button>
            </div>
          </div>

          {/* SMS Mockup */}
          <div
            className="p-7"
            style={{
              background: "var(--surface-off-white)",
              borderRadius: "var(--radius-2xl)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              className="font-mono text-[10px] font-bold tracking-widest uppercase text-center mb-4"
              style={{ color: "var(--text-muted)" }}
            >
              SMS CONFIRMATION FLOW
            </div>
            {smsMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === "rest" ? "justify-end" : "justify-start"} mb-2.5`}>
                <div
                  className="max-w-[85%] px-3.5 py-2.5 font-display text-xs leading-relaxed whitespace-pre-line"
                  style={{
                    borderRadius: "14px",
                    background: msg.from === "rest" ? "var(--brand-primary)" : "var(--surface-white)",
                    color: msg.from === "rest" ? "#fff" : "var(--text-primary)",
                    boxShadow: "var(--shadow-sm)",
                    border: msg.from === "sys" ? "1px solid var(--border-subtle)" : "none",
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
