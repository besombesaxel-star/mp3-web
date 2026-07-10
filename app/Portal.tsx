"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into document.body, escaping any ancestor stacking
 * context (e.g. AppShell's `relative z-10` wrapper around Sidebar+main,
 * which otherwise caps in-page fixed overlays below the MiniPlayer/tab bar
 * regardless of their own z-index).
 *
 * Deferred to a post-mount effect (rather than a `typeof document` check)
 * so the first client render always matches the server-rendered null,
 * even if a caller ever opens something portal-backed on initial mount.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate SSR/hydration-safe mount gate, not derived state
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
