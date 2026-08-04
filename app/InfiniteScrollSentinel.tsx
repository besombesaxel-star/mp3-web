"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Drop at the bottom of a list; fires onLoadMore once the sentinel enters
 * the viewport. rootMargin gives it a head start so the next page is
 * usually ready before the user actually hits the bottom.
 */
export default function InfiniteScrollSentinel({
  onLoadMore,
  hasMore,
  loading,
}: {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (!hasMore && !loading) return null;

  return (
    <div ref={ref} className="flex items-center justify-center py-6" aria-hidden={!loading}>
      {loading ? <Loader2 size={18} className="animate-spin text-white/30" /> : null}
    </div>
  );
}
