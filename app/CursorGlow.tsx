"use client";

import { useEffect, useRef } from "react";

const SIZE = 420;

export default function CursorGlow() {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const el = elRef.current;
    if (!el) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    function apply() {
      frame = 0;
      if (el) el.style.transform = `translate3d(${x - SIZE / 2}px, ${y - SIZE / 2}px, 0)`;
    }

    function onMove(e: MouseEvent) {
      x = e.clientX;
      y = e.clientY;
      if (el && el.style.opacity !== "1") el.style.opacity = "1";
      if (!frame) frame = requestAnimationFrame(apply);
    }

    function onLeave() {
      if (el) el.style.opacity = "0";
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={elRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[500] rounded-full opacity-0 transition-opacity duration-300 ease-out"
      style={{
        width: SIZE,
        height: SIZE,
        background:
          "radial-gradient(circle, rgba(150,172,209,0.20) 0%, rgba(150,172,209,0.10) 35%, transparent 72%)",
        mixBlendMode: "screen",
        willChange: "transform",
      }}
    />
  );
}
