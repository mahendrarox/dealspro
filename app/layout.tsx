import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealsPro — Exclusive Restaurant Deals, Limited Drops",
  description: "Half-price restaurant deals, limited to 20 per week. No app needed — deals delivered straight to your phone via text.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
