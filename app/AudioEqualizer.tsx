"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "./PlayerContext";
import { ensureConnected, getOrCreateSharedGraph } from "./audioGraph";

type Props = {
  bars?: number;
  height?: number;
  className?: string;
  accent?: string;

  thinWidth?: number;
  gap?: number;
  minBar?: number;
  smoothing?: number;
  punch?: number;

  // ✅ idle animation
  idle?: boolean;
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default function AudioEqualizer({
  bars = 12,
  height = 18,
  className = "",
  accent,
  thinWidth = 3,
  gap = 3,
  minBar = 3,
  smoothing = 0.25,
  punch = 1.9,
  idle = false,
}: Props) {
  const { getAudio, playing, track } = usePlayer();

  const [levels, setLevels] = useState<number[]>(() => Array(bars).fill(0));
  const prevRef = useRef<number[]>(Array(bars).fill(0));
  const rafRef = useRef<number | null>(null);

  const cfg = useMemo(() => ({ bars }), [bars]);

  useEffect(() => {
    const audio = getAudio();
    if (!audio) return;

    const graph = getOrCreateSharedGraph(audio);
    if (!graph) return;

    graph.analyser.fftSize = 1024;
    graph.analyser.smoothingTimeConstant = 0.72;
    ensureConnected(graph);

    const analyser = graph.analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    let last = 0;
    let t = 0;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - last < 33) return;
      last = now;

      // ✅ idle motion quand pause
      if (!playing && idle) {
        t += 0.06;
        const out = new Array(cfg.bars).fill(0).map((_, i) => {
          const phase = t + i * 0.55;
          return clamp01(0.22 + 0.22 * Math.sin(phase) + 0.08 * Math.sin(phase * 2.2));
        });
        prevRef.current = out;
        setLevels(out);
        return;
      }

      analyser.getByteFrequencyData(data);

      const startBin = Math.floor(data.length * 0.06);
      const endBin = Math.floor(data.length * 0.75);
      const usable = Math.max(1, endBin - startBin);
      const slice = Math.max(1, Math.floor(usable / cfg.bars));

      const raw: number[] = new Array(cfg.bars).fill(0);

      for (let i = 0; i < cfg.bars; i++) {
        const start = startBin + i * slice;
        const end = i === cfg.bars - 1 ? endBin : start + slice;

        let sq = 0;
        for (let j = start; j < end; j++) {
          const v = data[j] / 255;
          sq += v * v;
        }
        const rms = Math.sqrt(sq / Math.max(1, end - start));

        const pos = i / Math.max(1, cfg.bars - 1);
        const weight = 0.92 + Math.sin(pos * Math.PI) * 0.22;

        raw[i] = clamp01(Math.pow(rms * weight, 1 / punch));
      }

      const prev = prevRef.current;
      const out = raw.map((v, i) => {
        const p = prev[i];
        const next = v > p ? p + (v - p) * 0.62 : p + (v - p) * 0.2;
        return clamp01(p * smoothing + next * (1 - smoothing));
      });

      prevRef.current = out;
      setLevels(out);
    };

    if (playing) graph.ctx.resume().catch(() => {});
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [getAudio, playing, track, cfg, smoothing, punch, idle]);

  const color = accent ?? "rgba(255,255,255,0.9)";

  return (
    <div className={`flex items-end ${className}`} style={{ height }} aria-hidden="true">
      {levels.map((v, i) => {
        const h = Math.max(minBar, v * height);
        const opacity = 0.35 + v * 0.65;

        return (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: thinWidth,
              marginRight: i === levels.length - 1 ? 0 : gap,
              height: h,
              background: color,
              opacity,
              transform: "translateZ(0)",
            }}
          />
        );
      })}
    </div>
  );
}