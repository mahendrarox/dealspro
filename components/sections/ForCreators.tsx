"use client";

import { useInView } from "../hooks";
import Badge from "../ui/Badge";
import Button from "../ui/Button";

const stats = ["Avg $500/mo per creator", "10% commission", "Your own branded page"];
const miniDeals = [
  { name: "Sakura Ramen", price: "$25", was: "$50" },
  { name: "Tandoori Nights", price: "$20", was: "$40" },
];

export default function ForCreators() {
  const { ref: headerRef, visible: headerVis } = useInView();
  const { ref: contentRef, visible: contentVis } = useInView();

  return (
    <section id="for-creators" className="py-20 px-5" style={{ background: "var(--surface-dark)" }}>
      <div className="max-w-[1120px] mx-auto">
        <div
          ref={headerRef}
          className="text-center mb-12"
          style={{ opacity: headerVis ? 1 : 0, animation: headerVis ? "fadeUp 0.5s ease both" : "none" }}
        >
          <div className="font-display text-xs font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: "var(--brand-primary)" }}>
            For Creators
          </div>
          <h2 className="font-display font-bold leading-tight" style={{ fontSize: "clamp(24px, 4vw, 36px)", letterSpacing: "-0.02em", color: "var(--text-inverse)" }}>
            Turn Your Followers Into Revenue
          </h2>
        </div>

        <div
          ref={contentRef}
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          style={{ opacity: contentVis ? 1 : 0, animation: contentVis ? "fadeUp 0.5s ease both" : "none" }}
        >
          <div>
            <p className="font-display text-[17px] leading-[1.7] mb-7" style={{ color: "var(--text-muted)" }}>
              Get your own DealsPro page. Share exclusive deals with your audience. Earn commission on every sale — no inventory, no shipping, no hassle.
            </p>
            <div className="flex flex-wrap gap-2.5 mb-7">
              {stats.map((s) => (
                <span
                  key={s}
                  className="font-mono text-[11px] font-bold"
                  style={{
                    color: "var(--brand-primary)",
                    background: "rgba(249,58,37,0.1)",
                    padding: "8px 14px",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
            <Button>Become a Creator</Button>
          </div>

          {/* Creator Page Preview */}
          <div
            className="overflow-hidden"
            style={{
              background: "var(--neutral-800)",
              borderRadius: "var(--radius-2xl)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Browser Bar */}
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{
                background: "var(--neutral-950)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex gap-[5px]">
                <div className="w-2 h-2 rounded-full" style={{ background: "#FF5F57" }} />
                <div className="w-2 h-2 rounded-full" style={{ background: "#FFBD2E" }} />
                <div className="w-2 h-2 rounded-full" style={{ background: "#28CA41" }} />
              </div>
              <div
                className="flex-1 text-center font-mono text-[11px] py-[5px] px-3"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: "var(--radius-full)",
                  color: "var(--text-muted)",
                }}
              >
                dealspro.ai/daborhood
              </div>
            </div>

            {/* Creator Content */}
            <div className="p-6 text-center">
              <div
                className="w-[52px] h-[52px] rounded-full mx-auto mb-2.5 flex items-center justify-center font-display text-xl font-extrabold text-white"
                style={{ background: "linear-gradient(135deg, var(--red-500), var(--amber-500))" }}
              >
                D
              </div>
              <div className="font-display text-base font-bold text-white">@daborhood</div>
              <div className="font-display text-xs mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
                DFW&apos;s best food finds · 12.4K followers
              </div>

              {miniDeals.map((d, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center px-3.5 py-2.5 mb-2"
                  style={{
                    borderRadius: "var(--radius-lg)",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="text-left">
                    <div className="font-display text-[13px] font-semibold text-white">{d.name}</div>
                    <div className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                      <span className="font-bold" style={{ color: "var(--brand-primary)" }}>{d.price}</span>{" "}
                      <span className="line-through">{d.was}</span>
                    </div>
                  </div>
                  <Badge>DROP</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
