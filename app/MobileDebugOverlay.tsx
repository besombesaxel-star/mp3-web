"use client";

import { useEffect, useState } from "react";

// Temporary on-device diagnostics for the iOS PWA tab-bar-icon bug.
// Remove once the root cause is confirmed.
export default function MobileDebugOverlay() {
  const [info, setInfo] = useState("init");
  const [lastError, setLastError] = useState("none");

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      setLastError(`${e.message} @ ${e.filename}:${e.lineno}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      setLastError(`unhandledrejection: ${String(e.reason)}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const measure = () => {
      const navs = Array.from(document.querySelectorAll("nav"));
      const nav = navs.find((n) => n.className.includes("bottom-0"));
      const skipLink = document.querySelector(".skip-link");
      const skipTransform = skipLink ? getComputedStyle(skipLink).transform : "n/a";
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      const swController = Boolean(navigator.serviceWorker?.controller);

      if (!nav) {
        setInfo(`no-tabbar-nav | skip=${skipTransform} standalone=${standalone} sw=${swController}`);
        return;
      }
      const svg = nav.querySelector("svg");
      if (!svg) {
        setInfo(`tabbar-found no-svg | skip=${skipTransform} standalone=${standalone} sw=${swController}`);
        return;
      }
      const rect = svg.getBoundingClientRect();
      const cs = getComputedStyle(svg);
      const navRect = nav.getBoundingClientRect();
      setInfo(
        `svg ${rect.width.toFixed(0)}x${rect.height.toFixed(0)} disp=${cs.display} vis=${cs.visibility} op=${cs.opacity} color=${cs.color} navH=${navRect.height.toFixed(0)} | skip=${skipTransform} standalone=${standalone} sw=${swController}`
      );
    };

    const raf1 = requestAnimationFrame(() => requestAnimationFrame(measure));
    const id = setInterval(measure, 1500);

    return () => {
      cancelAnimationFrame(raf1);
      clearInterval(id);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <div className="md:hidden fixed top-[54px] left-1 right-1 z-[9999] break-words rounded bg-yellow-300 px-1.5 py-1 font-mono text-[9px] leading-tight text-black">
      <div>{info}</div>
      <div>err: {lastError}</div>
    </div>
  );
}
