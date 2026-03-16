"use client";

import { useState, useEffect } from "react";
import Logo from "../ui/Logo";
import Button from "../ui/Button";
import { Icons } from "../ui/Icons";

const navLinks = ["How It Works", "For Restaurants", "For Creators"];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 px-5 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(255,255,255,0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom: scrolled ? "1px solid var(--border-subtle)" : "1px solid transparent",
        }}
      >
        <div className="max-w-[1120px] mx-auto h-16 flex items-center justify-between">
          <Logo size={scrolled ? 34 : 38} dark={!scrolled} />

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(/\s+/g, "-")}`}
                className="font-display text-sm font-medium no-underline transition-colors duration-150 hover:opacity-100"
                style={{ color: scrolled ? "var(--text-secondary)" : "rgba(255,255,255,0.7)" }}
              >
                {link}
              </a>
            ))}
            <a href="#get-deals" className="no-underline">
              <Button style={{ padding: "10px 20px", fontSize: "13px" }}>Get Deals</Button>
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden bg-transparent border-none cursor-pointer p-1"
            onClick={() => setMobileOpen(true)}
            style={{ color: scrolled ? "var(--text-primary)" : "#fff" }}
          >
            {Icons.menu}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[60]"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute top-0 right-0 bottom-0 w-[280px] p-6"
            style={{ background: "var(--surface-white)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-5 right-5 bg-transparent border-none cursor-pointer"
              style={{ color: "var(--text-primary)" }}
              onClick={() => setMobileOpen(false)}
            >
              {Icons.close}
            </button>
            <div className="flex flex-col gap-6 mt-12">
              {navLinks.map((link) => (
                <a
                  key={link}
                  href={`#${link.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => setMobileOpen(false)}
                  className="font-display text-lg font-semibold no-underline"
                  style={{ color: "var(--text-primary)" }}
                >
                  {link}
                </a>
              ))}
              <a href="#get-deals" onClick={() => setMobileOpen(false)} className="no-underline">
                <Button full>Get Deals</Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
