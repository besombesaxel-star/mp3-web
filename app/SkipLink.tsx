"use client";

import { useEffect, useRef } from "react";

export default function SkipLink() {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const mountedAt = Date.now();
    const el = ref.current;
    if (!el) return;

    const onFocus = () => {
      // iOS occasionally auto-focuses the first link on a page right after a
      // standalone PWA launch. Treat only a focus arriving in that brief
      // post-load window as that artifact so real Tab/VoiceOver visits later
      // in the session are never blurred.
      if (Date.now() - mountedAt < 600) {
        el.blur();
      }
      el.removeEventListener("focus", onFocus);
    };

    el.addEventListener("focus", onFocus);
    return () => el.removeEventListener("focus", onFocus);
  }, []);

  return (
    <a ref={ref} href="#main-content" className="skip-link">
      Aller au contenu principal
    </a>
  );
}
