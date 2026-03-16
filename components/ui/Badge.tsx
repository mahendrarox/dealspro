const variants = {
  drop: { bg: "var(--red-500)", color: "#fff" },
  savings: { bg: "var(--green-50)", color: "var(--green-500)" },
  limited: { bg: "var(--amber-500)", color: "#fff" },
  exclusive: { bg: "var(--neutral-950)", color: "#fff" },
  soldOut: { bg: "var(--neutral-200)", color: "var(--neutral-400)" },
};

export default function Badge({
  type = "drop",
  children,
}: {
  type?: keyof typeof variants;
  children: React.ReactNode;
}) {
  const style = variants[type] || variants.drop;

  return (
    <span
      className="font-mono text-[11px] font-extrabold tracking-widest uppercase inline-block"
      style={{
        padding: "4px 12px",
        borderRadius: "var(--radius-full)",
        background: style.bg,
        color: style.color,
      }}
    >
      {children}
    </span>
  );
}
