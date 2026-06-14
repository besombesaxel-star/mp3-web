"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "./PlayerContext";

type Props = {
  bars?: number;
  height?: number;
  className?: string;

  // style
  accent?: string;  // ex: "#A855F7" ou "rgb(255,0,0)"
  punch?: number;
  smooth?: number;
};

type Graph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
  connected: boolean;
};

const graphByMedia = new WeakMap<HTMLMediaElement, Graph>();

function getOrCreateGraph(media: HTMLMediaElement): Graph | null {
  const existing = graphByMedia.get(media);
  if (existing) return existing;

  const webkitAudioContext = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const Ctx = window.AudioContext || webkitAudioContext;
  if (!Ctx) return null;

  const ctx: AudioContext = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.55;

  const source = ctx.createMediaElementSource(media);
  const graph: Graph = { ctx, analyser, source, connected: false };
  graphByMedia.set(media, graph);
  return graph;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** mix simple entre 2 opacités (0..1) */
function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function AudioBars({
  bars = 32,
  height = 56,
  className = "",
  accent,
  punch = 2.2,
  smooth = 0.2,
}: Props) {
  const { getAudio, playing, track } = usePlayer();

  const [levels, setLevels] = useState<number[]>(() => Array(bars).fill(0));
  const prevRef = useRef<number[]>(Array(bars).fill(0));
  const rafRef = useRef<number | null>(null);

  const bins = useMemo(() => ({ bars }), [bars]);

  useEffect(() => {
    const audio = getAudio();
    if (!audio) return;

    const graph = getOrCreateGraph(audio);
    if (!graph) return;

    if (!graph.connected) {
      graph.source.connect(graph.analyser);
      graph.analyser.connect(graph.ctx.destination);
      graph.connected = true;
    }

    const analyser = graph.analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    let last = 0;

    const tick = (t: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (t - last < 16) return;
      last = t;

      analyser.getByteFrequencyData(data);

      const startBin = Math.floor(data.length * 0.04);
      const endBin = Math.floor(data.length * 0.92);
      const usable = endBin - startBin;
      const slice = Math.max(1, Math.floor(usable / bins.bars));

      const raw: number[] = new Array(bins.bars).fill(0);

      for (let i = 0; i < bins.bars; i++) {
        const start = startBin + i * slice;
        const end = i === bins.bars - 1 ? endBin : start + slice;

        let sq = 0;
        for (let j = start; j < end; j++) {
          const v = data[j] / 255;
          sq += v * v;
        }

        const rms = Math.sqrt(sq / Math.max(1, end - start));
        const pos = i / Math.max(1, bins.bars - 1);
        const weight = 0.9 + pos * 0.6; // plus de mouvement sur mids/aigus

        raw[i] = clamp01(Math.pow(rms * weight, 1 / punch));
      }

      const prev = prevRef.current;
      const out = raw.map((v, i) => {
        const p = prev[i];
        const next = v > p ? p + (v - p) * 0.6 : p + (v - p) * 0.2;
        return clamp01(p * smooth + next * (1 - smooth));
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
  }, [getAudio, playing, track, bins, punch, smooth]);

  useEffect(() => {
    if (playing) return;
    const id = window.setInterval(() => {
      prevRef.current = prevRef.current.map((v) => v * 0.9);
      setLevels((p) => p.map((v) => v * 0.9));
    }, 30);
    return () => window.clearInterval(id);
  }, [playing]);

  // couleur : fallback blanc si pas d'accent
  const baseColor = accent ?? "rgba(255,255,255,0.95)";

  return (
    <div className={`flex items-end ${className}`} style={{ height }} aria-hidden="true">
      {levels.map((v, i) => {
        // alternance largeur
        const isWide = i % 2 === 0;
        const w = isWide ? 8 : 4;

        // opacité selon niveau + léger gradient horizontal (centre un peu plus fort)
        const centerBias = 1 - Math.abs((i / Math.max(1, levels.length - 1)) - 0.5) * 2; // 0..1
        const op = clamp01(mix(0.18, 1.0, v) * mix(0.75, 1.05, centerBias));

        // hauteur
        const h = Math.max(6, v * height);

        return (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: `${w}px`,
              marginRight: i === levels.length - 1 ? 0 : "6px",
              height: `${h}px`,
              opacity: op,
              background: `linear-gradient(to top, ${baseColor}, rgba(255,255,255,0.25))`,
              transform: "translateZ(0)",
              filter: v > 0.72 ? "drop-shadow(0 0 8px rgba(255,255,255,0.12))" : "none",
            }}
          />
        );
      })}
    </div>
  );
}
