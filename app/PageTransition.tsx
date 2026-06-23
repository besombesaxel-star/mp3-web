"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

const scrollPositions = new Map<string, number>();

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const mainEl = document.getElementById("main-content");
    if (!mainEl) return;

    mainEl.scrollTop = scrollPositions.get(pathname) ?? 0;

    function onScroll() {
      scrollPositions.set(pathname, mainEl!.scrollTop);
    }

    mainEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      mainEl.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  return (
    <div key={pathname} className="mp3-page-transition">
      {children}
    </div>
  );
}
