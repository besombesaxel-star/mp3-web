"use client";

import { ReactNode, useRef, useState } from "react";
import { Heart, ListEnd } from "lucide-react";
import { vibrate } from "./haptics";

const SWIPE_TRIGGER = 72;
const MAX_DRAG = 104;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export type SwipeActionsOptions = {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  hapticsEnabled?: boolean;
  disabled?: boolean;
};

export type SwipeState = {
  dragX: number;
  dragging: boolean;
  canRight: boolean;
  canLeft: boolean;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
  didSwipe: () => boolean;
};

/**
 * Detects a horizontal drag on a list row (right = favorite, left = queue).
 * Never calls preventDefault: React marks onTouchMove passive by default, so
 * that call would silently no-op. Direction is locked from the first ~12px
 * of movement instead, the same disambiguation approach already used by
 * useLongPress/MiniPlayer's swipe-to-skip elsewhere in this codebase.
 */
export function useSwipeActions({
  onSwipeRight,
  onSwipeLeft,
  hapticsEnabled = true,
  disabled = false,
}: SwipeActionsOptions): SwipeState {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const armedRef = useRef(false);
  const firedRef = useRef(false);
  const swipedRef = useRef(false);
  // Mirrors dragX synchronously: if touchend fires before React has
  // re-rendered since the last touchmove (batched updates, fast gesture),
  // reading the dragX *state* here would still see its pre-drag value.
  const dragXRef = useRef(0);

  const canRight = Boolean(onSwipeRight);
  const canLeft = Boolean(onSwipeLeft);

  function onTouchStart(e: React.TouchEvent) {
    if (disabled || (!canRight && !canLeft)) return;
    const t = e.touches[0];
    originRef.current = { x: t.clientX, y: t.clientY };
    armedRef.current = false;
    firedRef.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    const origin = originRef.current;
    if (!origin) return;
    const t = e.touches[0];
    const dx = t.clientX - origin.x;
    const dy = t.clientY - origin.y;

    if (!armedRef.current) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      armedRef.current = true;
      setDragging(true);
    }

    const allowed = dx > 0 ? canRight : canLeft;
    const next = allowed ? clamp(dx, -MAX_DRAG, MAX_DRAG) : dx * 0.2;
    dragXRef.current = next;
    setDragX(next);

    if (allowed && !firedRef.current && Math.abs(next) > SWIPE_TRIGGER) {
      firedRef.current = true;
      if (hapticsEnabled) vibrate(10);
    }
  }

  function reset() {
    originRef.current = null;
    armedRef.current = false;
    dragXRef.current = 0;
    setDragging(false);
    setDragX(0);
  }

  function onTouchEnd() {
    const wasArmed = armedRef.current;
    const wasFired = firedRef.current;
    const finalDragX = dragXRef.current;
    reset();
    if (wasArmed && wasFired) {
      swipedRef.current = true;
      setTimeout(() => {
        swipedRef.current = false;
      }, 0);
      if (finalDragX > 0) onSwipeRight?.();
      else onSwipeLeft?.();
    }
  }

  return {
    dragX,
    dragging,
    canRight,
    canLeft,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: reset,
    didSwipe: () => swipedRef.current,
  };
}

/**
 * Visual shell for a swipeable row: clips+reveals the favorite/queue badges
 * behind the row while it's dragged. The row itself (children) keeps its own
 * markup/touch handlers and is responsible for applying swipe.dragX/dragging
 * to its own transform/transition style, since that's usually the same
 * element that already carries an entrance-animation class + animationDelay.
 */
export function SwipeableRow({
  swipe,
  favored = false,
  className,
  children,
}: {
  swipe: SwipeState;
  favored?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const rightProgress = clamp(Math.max(0, swipe.dragX) / SWIPE_TRIGGER, 0, 1);
  const leftProgress = clamp(Math.max(0, -swipe.dragX) / SWIPE_TRIGGER, 0, 1);

  return (
    <div className={["relative overflow-hidden rounded-2xl", className ?? ""].join(" ")}>
      {swipe.canRight ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4"
          style={{ opacity: rightProgress }}
          aria-hidden="true"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full border border-red-400/25 bg-red-400/15"
            style={{ transform: `scale(${0.6 + rightProgress * 0.4})` }}
          >
            <Heart size={16} className={favored ? "fill-red-300 text-red-300" : "text-red-300"} />
          </span>
        </div>
      ) : null}

      {swipe.canLeft ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end pr-4"
          style={{ opacity: leftProgress }}
          aria-hidden="true"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10"
            style={{ transform: `scale(${0.6 + leftProgress * 0.4})` }}
          >
            <ListEnd size={16} className="text-white/80" />
          </span>
        </div>
      ) : null}

      {children}
    </div>
  );
}

/** Merges the drag transform into a row's own style object (animationDelay etc.). */
export function swipeRowStyle(swipe: SwipeState, extra?: React.CSSProperties): React.CSSProperties {
  return {
    ...extra,
    transform: swipe.dragX ? `translate3d(${swipe.dragX}px,0,0)` : undefined,
    transition: swipe.dragging ? "none" : "transform 220ms cubic-bezier(0.2,0.8,0.2,1)",
  };
}
