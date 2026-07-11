"use client";

import { useEffect, useRef, useState } from "react";

const GLOW_SIZE = 36;
const RING_SIZE = 16;

const HOVER_SELECTOR = 'a, button, [role="button"], label, summary, [data-cursor-hover]';
const TEXT_SELECTOR = 'input, textarea, [contenteditable="true"]';

export default function CustomCursor() {
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [overText, setOverText] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    document.documentElement.classList.add("mp3-custom-cursor");

    let frame = 0;
    let x = -9999;
    let y = -9999;

    function apply() {
      frame = 0;
      if (glowRef.current) glowRef.current.style.transform = `translate3d(${x - GLOW_SIZE / 2}px, ${y - GLOW_SIZE / 2}px, 0)`;
      if (ringRef.current) ringRef.current.style.transform = `translate3d(${x - RING_SIZE / 2}px, ${y - RING_SIZE / 2}px, 0)`;
    }

    function onMove(e: MouseEvent) {
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    }

    function onOver(e: MouseEvent) {
      if (!(e.target instanceof Element)) return;
      setOverText(Boolean(e.target.closest(TEXT_SELECTOR)));
      setHovering(Boolean(e.target.closest(HOVER_SELECTOR)));
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onOver, { passive: true });

    return () => {
      document.documentElement.classList.remove("mp3-custom-cursor");
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[500] rounded-full transition-opacity duration-150 ease-out"
        style={{
          width: GLOW_SIZE,
          height: GLOW_SIZE,
          opacity: overText ? 0 : 1,
          transform: "translate3d(-9999px, -9999px, 0)",
          background: "radial-gradient(circle, rgba(150,172,209,0.14) 0%, rgba(150,172,209,0.05) 45%, transparent 75%)",
          mixBlendMode: "screen",
          willChange: "transform",
        }}
      />
      <div
        ref={ringRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[501] transition-opacity duration-150 ease-out"
        style={{
          width: RING_SIZE,
          height: RING_SIZE,
          opacity: overText ? 0 : 1,
          transform: "translate3d(-9999px, -9999px, 0)",
          willChange: "transform",
        }}
      >
        <div
          className={[
            "h-full w-full rounded-full border transition-transform duration-200 ease-out",
            hovering ? "scale-[1.75]" : "scale-100",
          ].join(" ")}
          style={{ borderColor: "rgba(150,172,209,0.7)", borderWidth: 1.5 }}
        />
      </div>
    </>
  );
}
