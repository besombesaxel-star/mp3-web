"use client";

import { useEffect, useRef, useState } from "react";

// Temporary on-device diagnostics for the iOS PWA tab-bar-icon bug.
// Remove once the root cause is confirmed.
export default function MobileDebugOverlay() {
  const [info, setInfo] = useState("init");
  const [lastError, setLastError] = useState("none");
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<string[]>([]);

  useEffect(() => {
    const pushLog = (msg: string) => {
      logsRef.current = [...logsRef.current.slice(-2), msg];
      setLogs(logsRef.current);
    };

    const onError = (e: ErrorEvent) => {
      setLastError(`${e.message} @ ${e.filename}:${e.lineno}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      setLastError(`unhandledrejection: ${String(e.reason)}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const origError = console.error;
    const origWarn = console.warn;
    console.error = (...args: unknown[]) => {
      pushLog(`E: ${args.map(String).join(" ").slice(0, 160)}`);
      origError(...args);
    };
    console.warn = (...args: unknown[]) => {
      pushLog(`W: ${args.map(String).join(" ").slice(0, 160)}`);
      origWarn(...args);
    };

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
      const icon = nav.querySelector<HTMLElement>('span[style*="mask-image"]');
      if (!icon) {
        setInfo(`tabbar-found no-mask-icon | skip=${skipTransform} standalone=${standalone} sw=${swController}`);
        return;
      }
      const rect = icon.getBoundingClientRect();
      const cs = getComputedStyle(icon);
      const maskImg = cs.getPropertyValue("-webkit-mask-image") || cs.getPropertyValue("mask-image");
      const navRect = nav.getBoundingClientRect();

      setInfo(
        [
          `icon ${rect.width.toFixed(0)}x${rect.height.toFixed(0)} disp=${cs.display} vis=${cs.visibility} op=${cs.opacity}`,
          `bg=${cs.backgroundColor} mask=${maskImg.slice(0, 40)}`,
          `navH=${navRect.height.toFixed(0)}`,
          `skip=${skipTransform} standalone=${standalone} sw=${swController}`,
        ].join(" | ")
      );
    };

    const raf1 = requestAnimationFrame(() => requestAnimationFrame(measure));
    const id = setInterval(measure, 1500);

    return () => {
      cancelAnimationFrame(raf1);
      clearInterval(id);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = origError;
      console.warn = origWarn;
    };
  }, []);

  return (
    <div className="md:hidden fixed top-[54px] left-1 right-1 z-[9999] break-words rounded bg-yellow-300 px-1.5 py-1 font-mono text-[9px] leading-tight text-black">
      <div>{info}</div>
      <div>err: {lastError}</div>
      {logs.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}
