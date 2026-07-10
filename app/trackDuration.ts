"use client";

import { useEffect, useMemo, useState } from "react";

const durationCache = new Map<string, number>();
const inFlight = new Map<string, Promise<number>>();
const queue: Array<() => void> = [];
let activeProbes = 0;
const MAX_CONCURRENT_PROBES = 4;

function runNext() {
  if (activeProbes >= MAX_CONCURRENT_PROBES) return;
  const next = queue.shift();
  if (!next) return;
  activeProbes += 1;
  next();
}

export function getCachedDuration(src: string): number | undefined {
  return durationCache.get(src);
}

export function probeDuration(src: string): Promise<number> {
  const cached = durationCache.get(src);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inFlight.get(src);
  if (existing) return existing;

  const promise = new Promise<number>((resolve) => {
    queue.push(() => {
      const audio = new Audio();
      audio.preload = "metadata";

      const finish = (value: number) => {
        durationCache.set(src, value);
        audio.removeEventListener("loadedmetadata", onLoaded);
        audio.removeEventListener("error", onError);
        activeProbes -= 1;
        runNext();
        resolve(value);
      };

      const onLoaded = () => finish(Number.isFinite(audio.duration) ? audio.duration : 0);
      const onError = () => finish(0);

      audio.addEventListener("loadedmetadata", onLoaded);
      audio.addEventListener("error", onError);
      audio.src = src;
    });
    runNext();
  }).finally(() => inFlight.delete(src));

  inFlight.set(src, promise);
  return promise;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h} h ${m}min` : `${h} h`;
}

export function useTracksTotalDuration(srcs: string[]): {
  totalSeconds: number;
  loadedCount: number;
  total: number;
} {
  const key = srcs.join("|");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    for (const src of srcs) {
      if (getCachedDuration(src) !== undefined) continue;
      probeDuration(src).then(() => {
        if (!cancelled) setTick((t) => t + 1);
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const totalSeconds = useMemo(
    () => srcs.reduce((sum, src) => sum + (getCachedDuration(src) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, tick]
  );

  const loadedCount = useMemo(
    () => srcs.filter((src) => getCachedDuration(src) !== undefined).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, tick]
  );

  return { totalSeconds, loadedCount, total: srcs.length };
}
