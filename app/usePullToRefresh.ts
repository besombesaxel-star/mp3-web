"use client";

import { useCallback, useRef, useState } from "react";

const TRIGGER_DISTANCE = 64;
const MAX_DISTANCE = 96;
const SCROLL_ROOT_ID = "main-content";

/**
 * Custom pull-to-refresh, gated on the shared #main-content scroll
 * container being at scrollTop 0. There's no native pull-to-refresh chrome
 * to fall back on here: the standalone PWA has no browser UI to pull, and
 * `main` already sets overscroll-y-contain (see AppShell) which kills the
 * rubber-band bounce that would otherwise hint at "you can pull". This
 * reclaims that dead gesture instead of fighting it, so — like
 * useSwipeActions — it never calls preventDefault (a no-op on React's
 * passive-by-default onTouchMove) and locks direction from the first ~14px.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pullDistance, setPullDistance] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const armedRef = useRef(false);
  // Mirrors pullDistance synchronously so onTouchEnd never reads a stale
  // pre-drag value when touchend fires before React re-renders since the
  // last touchmove (see the identical dragXRef pattern in useSwipeActions).
  const pullDistanceRef = useRef(0);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      const root = document.getElementById(SCROLL_ROOT_ID);
      if (!root || root.scrollTop > 4) return;
      const t = e.touches[0];
      originRef.current = { x: t.clientX, y: t.clientY };
      armedRef.current = false;
    },
    [refreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const origin = originRef.current;
      if (!origin || refreshing) return;
      const t = e.touches[0];
      const dy = t.clientY - origin.y;
      const dx = t.clientX - origin.x;

      if (!armedRef.current) {
        if (dy < 14 || dy < Math.abs(dx) * 1.4) return;
        const root = document.getElementById(SCROLL_ROOT_ID);
        if (!root || root.scrollTop > 4) {
          originRef.current = null;
          return;
        }
        armedRef.current = true;
        setDragging(true);
      }

      const next = Math.min(MAX_DISTANCE, dy * 0.5);
      pullDistanceRef.current = next;
      setPullDistance(next);
    },
    [refreshing]
  );

  const onTouchEnd = useCallback(() => {
    const shouldRefresh = armedRef.current && pullDistanceRef.current > TRIGGER_DISTANCE;
    armedRef.current = false;
    originRef.current = null;
    pullDistanceRef.current = 0;
    setDragging(false);

    if (shouldRefresh) {
      setRefreshing(true);
      setPullDistance(TRIGGER_DISTANCE);
      Promise.resolve(onRefresh()).finally(() => {
        setRefreshing(false);
        setPullDistance(0);
      });
    } else {
      setPullDistance(0);
    }
  }, [onRefresh]);

  const onTouchCancel = useCallback(() => {
    armedRef.current = false;
    originRef.current = null;
    pullDistanceRef.current = 0;
    setDragging(false);
    setPullDistance(0);
  }, []);

  return {
    containerProps: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
    pullDistance,
    dragging,
    refreshing,
    triggerDistance: TRIGGER_DISTANCE,
  };
}
