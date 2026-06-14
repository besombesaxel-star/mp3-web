"use client";

import React, { useEffect, useRef } from "react";
import { usePlayer } from "./PlayerContext";
import { ensureConnected, getOrCreateSharedGraph } from "./audioGraph";

type Props = {
  height?: number;
  className?: string;
  accent?: string;

  stability?: number; // 0..1
  intensity?: number; // 1..4

  edgeFade?: number;
  blurPass?: boolean;

  points?: number;
  spatialSmooth?: number;
  spline?: boolean;

  // expressivité
  attack?: number;
  release?: number;
  autoGain?: boolean;
  gainTarget?: number;

  // trail
  trail?: boolean;
  trailFade?: number; // 0.06..0.3 (plus bas = plus long)
};

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number) => clamp(x, 0, 1);

export default function AudioWave({
  height = 120,
  className = "",
  accent,

  stability = 0.92,
  intensity = 2.15,
  edgeFade = 0.2,
  blurPass = true,

  points = 64,
  spatialSmooth = 0.6,
  spline = true,

  attack = 0.78,
  release = 0.14,
  autoGain = true,
  gainTarget = 0.23,

  trail = true,
  trailFade = 0.14,
}: Props) {
  const { getAudio, playing, track } = usePlayer();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const emaRef = useRef<Float32Array | null>(null);
  const envRef = useRef(0.15);
  const gainRef = useRef(1.0);
  const shapedRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    const audio = getAudio();
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    const graph = getOrCreateSharedGraph(audio);
    if (!graph) return;

    graph.analyser.fftSize = 2048;
    graph.analyser.smoothingTimeConstant = 0.92;
    ensureConnected(graph);

    const analyser = graph.analyser;
    const raw = new Uint8Array(analyser.fftSize);

    if (!emaRef.current || emaRef.current.length !== raw.length) {
      emaRef.current = new Float32Array(raw.length);
      emaRef.current.fill(128);
    }

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const buildVals = (ema: Float32Array) => {
      const step = Math.max(1, Math.floor(ema.length / points));
      const vals: number[] = [];

      for (let i = 0; i < ema.length; i += step) {
        let acc = 0;
        let count = 0;
        for (let j = i; j < i + step && j < ema.length; j++) {
          acc += ema[j];
          count++;
        }
        vals.push(acc / Math.max(1, count));
      }

      const k = clamp01(spatialSmooth);
      if (k > 0) {
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 1; i < vals.length - 1; i++) {
            const avg3 = (vals[i - 1] + vals[i] + vals[i + 1]) / 3;
            vals[i] = vals[i] * (1 - k) + avg3 * k;
          }
        }
      }

      return vals;
    };

    const drawCurve = (
      w: number,
      h: number,
      vals: ArrayLike<number>,
      stroke: CanvasGradient | string,
      lw: number,
      shadowBlur: number,
      shadowColor: string,
      alpha: number
    ) => {
      const mid = 128;
      const baseAmp = clamp(intensity, 1, 4);

      ctx2d.save();
      ctx2d.globalAlpha = alpha;
      ctx2d.lineWidth = lw;
      ctx2d.lineJoin = "round";
      ctx2d.lineCap = "round";
      ctx2d.strokeStyle = stroke;
      ctx2d.shadowBlur = shadowBlur;
      ctx2d.shadowColor = shadowColor;

      const N = vals.length;
      const slice = w / Math.max(1, N - 1);

      const pts = new Array(N);
      for (let i = 0; i < N; i++) {
        let v = Number(vals[i]);
        v = mid + (v - mid) * baseAmp;
        v = clamp(v, 0, 255);
        pts[i] = { x: i * slice, y: (v / 255) * h };
      }

      ctx2d.beginPath();

      if (!spline || pts.length < 3) {
        ctx2d.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx2d.lineTo(pts[i].x, pts[i].y);
      } else {
        ctx2d.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const cx = pts[i].x;
          const cy = pts[i].y;
          const mx = (pts[i].x + pts[i + 1].x) / 2;
          const my = (pts[i].y + pts[i + 1].y) / 2;
          ctx2d.quadraticCurveTo(cx, cy, mx, my);
        }
        const last = pts[pts.length - 1];
        ctx2d.lineTo(last.x, last.y);
      }

      ctx2d.stroke();
      ctx2d.restore();
    };

    let idleT = 0;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 600;
      const h = height;

      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ✅ FIX: Trail “transparent” (pas de fond noir)
      if (trail) {
        ctx2d.save();
        ctx2d.globalCompositeOperation = "destination-out";
        ctx2d.fillStyle = `rgba(0,0,0,${clamp(trailFade, 0.06, 0.3)})`;
        ctx2d.fillRect(0, 0, w, h);
        ctx2d.restore();

        // important : on repasse en dessin normal
        ctx2d.globalCompositeOperation = "source-over";
      } else {
        ctx2d.clearRect(0, 0, w, h);
      }

      analyser.getByteTimeDomainData(raw);

      // temporal EMA
      const s = clamp01(stability);
      const alphaT = clamp(1 - s, 0.02, 0.28);
      const ema = emaRef.current!;
      for (let i = 0; i < raw.length; i++) {
        ema[i] = ema[i] + (raw[i] - ema[i]) * alphaT;
      }

      const vals = buildVals(ema);

      // energy
      let e = 0;
      for (let i = 0; i < vals.length; i++) e += Math.abs(vals[i] - 128);
      const energy = e / Math.max(1, vals.length) / 128;

      // envelope
      envRef.current = envRef.current * 0.92 + energy * 0.08;

      // auto-gain
      if (autoGain) {
        const env = Math.max(0.001, envRef.current);
        const targetGain = clamp(gainTarget / env, 0.9, 2.8);
        gainRef.current = gainRef.current * 0.9 + targetGain * 0.1;
      } else {
        gainRef.current = 1;
      }

      // shaped
      if (!shapedRef.current || shapedRef.current.length !== vals.length) {
        shapedRef.current = new Float32Array(vals.length);
        shapedRef.current.fill(128);
      }

      const shaped = shapedRef.current!;
      const atk = clamp01(attack);
      const rel = clamp01(release);

      idleT += 0.03;
      const idle = playing ? 0 : 0.055 + 0.02 * Math.sin(idleT);

      for (let i = 0; i < vals.length; i++) {
        const rawV = 128 + (vals[i] - 128) * gainRef.current + (vals[i] - 128) * idle;
        const prev = shaped[i];
        shaped[i] = rawV > prev ? prev + (rawV - prev) * atk : prev + (rawV - prev) * rel;
      }

      const c = accent ?? "rgba(255,255,255,0.95)";

      const gradStroke = ctx2d.createLinearGradient(0, 0, w, 0);
      gradStroke.addColorStop(0, "rgba(255,255,255,0.08)");
      gradStroke.addColorStop(0.5, c);
      gradStroke.addColorStop(1, "rgba(255,255,255,0.08)");

      if (blurPass) drawCurve(w, h, shaped, c, 7, 30, c, 0.24);
      drawCurve(w, h, shaped, gradStroke, 3.2, 18, c, 1);

      // edge fade mask
      const ef = clamp(edgeFade, 0, 0.45);
      ctx2d.save();
      ctx2d.globalCompositeOperation = "destination-in";

      const maskH = ctx2d.createLinearGradient(0, 0, w, 0);
      maskH.addColorStop(0, "rgba(0,0,0,0)");
      maskH.addColorStop(ef, "rgba(0,0,0,1)");
      maskH.addColorStop(1 - ef, "rgba(0,0,0,1)");
      maskH.addColorStop(1, "rgba(0,0,0,0)");

      const maskV = ctx2d.createLinearGradient(0, 0, 0, h);
      maskV.addColorStop(0, "rgba(0,0,0,0)");
      maskV.addColorStop(ef, "rgba(0,0,0,1)");
      maskV.addColorStop(1 - ef, "rgba(0,0,0,1)");
      maskV.addColorStop(1, "rgba(0,0,0,0)");

      ctx2d.fillStyle = maskH;
      ctx2d.fillRect(0, 0, w, h);
      ctx2d.fillStyle = maskV;
      ctx2d.fillRect(0, 0, w, h);

      ctx2d.restore();
    };

    if (playing) graph.ctx.resume().catch(() => {});
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [
    getAudio,
    playing,
    track,
    height,
    accent,
    stability,
    intensity,
    edgeFade,
    blurPass,
    points,
    spatialSmooth,
    spline,
    attack,
    release,
    autoGain,
    gainTarget,
    trail,
    trailFade,
  ]);

  return <canvas ref={canvasRef} className={`w-full ${className}`} style={{ height }} />;
}