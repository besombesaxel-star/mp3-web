"use client";

import { Loader2 } from "lucide-react";

export default function PullToRefreshIndicator({
  pullDistance,
  refreshing,
  triggerDistance,
}: {
  pullDistance: number;
  refreshing: boolean;
  triggerDistance: number;
}) {
  if (pullDistance <= 0 && !refreshing) return null;

  const progress = Math.min(1, pullDistance / triggerDistance);

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+50px)] z-[54] sm:hidden"
      style={{
        opacity: refreshing ? 1 : progress,
        transform: `translate(-50%, ${Math.min(pullDistance, triggerDistance) - triggerDistance}px)`,
      }}
      aria-hidden="true"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/85 backdrop-blur">
        <Loader2
          size={16}
          className={refreshing ? "animate-spin text-white/85" : "text-white/60"}
          style={refreshing ? undefined : { transform: `rotate(${progress * 360}deg)` }}
        />
      </div>
    </div>
  );
}
