"use client";

import { useRef } from "react";

type LongPressOptions = {
  onLongPress: () => void;
  delay?: number;
};

export function useLongPress({ onLongPress, delay = 480 }: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function clear() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function start(x: number, y: number) {
    startRef.current = { x, y };
    clear();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  }

  function move(x: number, y: number) {
    const origin = startRef.current;
    if (!origin) return;
    if (Math.abs(x - origin.x) > 10 || Math.abs(y - origin.y) > 10) clear();
  }

  function end() {
    clear();
    setTimeout(() => {
      firedRef.current = false;
    }, 0);
  }

  return {
    onTouchStart: (e: React.TouchEvent) => start(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove: (e: React.TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd: end,
    onTouchCancel: end,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    didLongPress: () => firedRef.current,
  };
}
