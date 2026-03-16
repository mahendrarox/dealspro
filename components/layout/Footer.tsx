import Logo from "../ui/Logo";

const columns = [
  { title: "Platform", links: ["How It Works", "Featured Deals", "For Restaurants", "For Creators"] },
  { title: "Company", links: ["About", "Contact", "Careers", "Blog"] },
  { title: "Legal", links: ["Terms", "Privacy", "Cookies"] },
];

export default function Footer() {
  return (
    <footer
      className="px-5 pt-12 pb-8"
      style={{ background: "var(--surface-dark)", borderTop: "1px solid var(--neutral-800)" }}
    >
      <div className="max-w-[1120px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-10">
        <div>
          <div className="mb-3">
            <Logo size={32} dark />
          </div>
          <p className="font-display text-[13px] leading-relaxed max-w-[260px]" style={{ color: "var(--text-muted)" }}>
            Exclusive restaurant deals, limited weekly drops, delivered to your phone.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <div
              className="font-display text-xs font-semibold uppercase tracking-wide mb-3.5"
              style={{ color: "var(--text-muted)" }}
            >
              {col.title}
            </div>
            {col.links.map((link) => (
              <a
                key={link}
                href="#"
                className="block font-display text-[13px] no-underline mb-2 transition-colors duration-150 hover:text-white"
                style={{ color: "var(--text-muted)" }}
              >
                {link}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div
        className="max-w-[1120px] mx-auto mt-9 pt-5 flex justify-between flex-wrap gap-2"
        style={{ borderTop: "1px solid var(--neutral-800)" }}
      >
        <span className="font-display text-xs" style={{ color: "var(--text-muted)" }}>
          © 2026 DealsPro. All rights reserved.
        </span>
        <div className="flex gap-4">
          {["Twitter", "Instagram", "TikTok"].map((s) => (
            <a
              key={s}
              href="#"
              className="font-display text-xs no-underline transition-colors duration-150 hover:text-white"
              style={{ color: "var(--text-muted)" }}
            >
              {s}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
