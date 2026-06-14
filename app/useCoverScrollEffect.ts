"use client";

import { RefObject, useEffect } from "react";

const COVER_SCROLL_FALLBACK = "translateY(0px) scaleX(1) scaleY(1)";
export const COVER_SCROLL_TRANSFORM = `var(--cover-scroll-transform, ${COVER_SCROLL_FALLBACK})`;

type ScrollTarget = Window | HTMLElement;
type EdgeSide = "top" | "bottom" | "none";

function isWindowTarget(target: ScrollTarget): target is Window {
  return typeof Window !== "undefined" && target instanceof Window;
}

function buildCoverScrollTransform(intensity: number) {
  const clamped = Math.max(-1, Math.min(1, intensity));
  if (Math.abs(clamped) < 0.0001) return COVER_SCROLL_FALLBACK;

  // Keep effect subtle while preserving direction.
  const translateY = -clamped * 2.6;
  const scaleY = 1 + Math.abs(clamped) * 0.02;
  const scaleX = 1 - Math.abs(clamped) * 0.014;

  return `translateY(${translateY.toFixed(2)}px) scaleX(${scaleX.toFixed(4)}) scaleY(${scaleY.toFixed(4)})`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getViewportBounds(scrollTarget: ScrollTarget) {
  if (isWindowTarget(scrollTarget)) {
    return { top: 0, bottom: window.innerHeight };
  }

  const rect = scrollTarget.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
}

function getEdgeBlurState(coverRect: DOMRect, viewportTop: number, viewportBottom: number) {
  const viewportHeight = viewportBottom - viewportTop;
  if (viewportHeight <= 0) return { progress: 0, side: "none" as EdgeSide };

  const zone = Math.min(260, viewportHeight * 0.32);
  if (zone <= 0) return { progress: 0, side: "none" as EdgeSide };

  const topInfluence = clamp01((viewportTop + zone - coverRect.top) / zone);
  const bottomInfluence = clamp01((coverRect.bottom - (viewportBottom - zone)) / zone);

  const side: EdgeSide = topInfluence === 0 && bottomInfluence === 0
    ? "none"
    : topInfluence >= bottomInfluence
      ? "top"
      : "bottom";

  const progress = Math.pow(Math.max(topInfluence, bottomInfluence), 1.22);
  return { progress, side };
}

export function useCoverScrollEffect(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;

    const findScrollTarget = (): ScrollTarget => {
      const byId = document.getElementById("main-content");
      if (byId instanceof HTMLElement) return byId;

      const main = root.closest("#main-content");
      if (main instanceof HTMLElement) return main;

      let current: HTMLElement | null = root.parentElement;
      while (current) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const canScroll = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
        if (canScroll && current.scrollHeight > current.clientHeight) return current;
        current = current.parentElement;
      }

      return window;
    };

    const scrollTarget = findScrollTarget();
    const readScrollTop = () => (isWindowTarget(scrollTarget) ? window.scrollY : scrollTarget.scrollTop);

    let rafId = 0;
    let lastY = readScrollTop();
    let lastTime = performance.now();
    let current = 0;
    let target = 0;

    const applyTransform = (value: number) => {
      const transform = buildCoverScrollTransform(value);
      root.style.setProperty("--cover-scroll-transform", transform);

      const covers = root.querySelectorAll<HTMLElement>('[data-scroll-cover="1"]');
      const { top: viewportTop, bottom: viewportBottom } = getViewportBounds(scrollTarget);

      for (const cover of covers) {
        const { progress: edgeProgress, side } = getEdgeBlurState(
          cover.getBoundingClientRect(),
          viewportTop,
          viewportBottom
        );
        const blurPx = edgeProgress * 4.2;
        const globalBlurPx = edgeProgress * 0.8;
        const edgeOpacity = edgeProgress > 0.01 ? Math.min(1, 0.18 + edgeProgress * 0.82) : 0;

        cover.style.transform = transform;
        cover.style.setProperty("--cover-edge-blur", `${blurPx.toFixed(2)}px`);
        cover.style.setProperty("--cover-edge-opacity", edgeOpacity.toFixed(3));
        cover.style.setProperty("--cover-global-blur", `${globalBlurPx.toFixed(2)}px`);
        cover.dataset.edgeSide = side;
      }
    };

    const animate = () => {
      target *= 0.78;
      current += (target - current) * 0.2;
      applyTransform(current);

      if (Math.abs(current) < 0.001 && Math.abs(target) < 0.001) {
        current = 0;
        target = 0;
        applyTransform(0);
        rafId = 0;
        return;
      }

      rafId = window.requestAnimationFrame(animate);
    };

    const onScroll = () => {
      const now = performance.now();
      const y = readScrollTop();
      const deltaY = y - lastY;
      const deltaTime = Math.max(now - lastTime, 16);

      lastY = y;
      lastTime = now;

      const velocity = deltaY / deltaTime;
      target = Math.max(-1, Math.min(1, velocity * 9));

      if (!rafId) {
        rafId = window.requestAnimationFrame(animate);
      }
    };

    const onWheel = (event: WheelEvent) => {
      const normalized = event.deltaY / 42;
      target = Math.max(-1, Math.min(1, normalized * 0.2));
      if (!rafId) {
        rafId = window.requestAnimationFrame(animate);
      }
    };

    const onResize = () => {
      applyTransform(current);
    };

    applyTransform(0);
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      if (rafId) window.cancelAnimationFrame(rafId);
      applyTransform(0);
    };
  }, [rootRef]);
}
