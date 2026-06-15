"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePlayer } from "./PlayerContext";
import AudioBars from "./AudioBars";
import { useFocusTrap } from "./useFocusTrap";
import { getArtistHref, getPublicProfileHref } from "@/lib/publicLinks";
import {
  Shuffle,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Repeat,
  Repeat1,
  Heart,
  Maximize2,
  X,
  VolumeX,
  Volume1,
  Volume2,
  Eye,
  EyeOff,
} from "lucide-react";

function withAlpha(color: string, alpha: number) {
  if (!color) return `rgba(255,255,255,${alpha})`;
  const c = color.trim();

  const m1 = c.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)$/i);
  if (m1) return `rgba(${m1[1]},${m1[2]},${m1[3]},${alpha})`;

  const m2 = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (m2) return `rgba(${m2[1]},${m2[2]},${m2[3]},${alpha})`;

  const m3 = c.match(/^#([0-9a-f]{6})$/i);
  if (m3) {
    const hex = m3[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  return `rgba(255,255,255,${alpha})`;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseColorToRgb(color: string): [number, number, number] | null {
  const c = color.trim();

  const m0 = c.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*[\d.]+)?\s*\)$/i);
  if (m0) {
    return [clampByte(Number(m0[1])), clampByte(Number(m0[2])), clampByte(Number(m0[3]))];
  }

  const m00 = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (m00) {
    return [clampByte(Number(m00[1])), clampByte(Number(m00[2])), clampByte(Number(m00[3]))];
  }

  const m1 = c.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)$/i);
  if (m1) {
    return [clampByte(Number(m1[1])), clampByte(Number(m1[2])), clampByte(Number(m1[3]))];
  }

  const m2 = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (m2) {
    return [clampByte(Number(m2[1])), clampByte(Number(m2[2])), clampByte(Number(m2[3]))];
  }

  const m3 = c.match(/^#([0-9a-f]{6})$/i);
  if (m3) {
    const hex = m3[1];
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  const m4 = c.match(/^#([0-9a-f]{3})$/i);
  if (m4) {
    const hex = m4[1];
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }

  return null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp >= 1 && hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp >= 2 && hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp >= 3 && hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp >= 4 && hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = l - c / 2;
  return [
    clampByte((r1 + m) * 255),
    clampByte((g1 + m) * 255),
    clampByte((b1 + m) * 255),
  ];
}

function toVividMobileAccent(color: string) {
  const parsed = parseColorToRgb(color) ?? [120, 120, 120];
  const [h, s, l] = rgbToHsl(parsed[0], parsed[1], parsed[2]);

  if (s < 0.08) {
    return "rgb(18 18 18)";
  }

  const boostedS = Math.max(0.72, s);
  const tunedL = Math.min(0.38, Math.max(0.22, l * 0.72));
  const [r, g, b] = hslToRgb(h, boostedS, tunedL);
  return `rgb(${r} ${g} ${b})`;
}

export default function PlayerOverlay() {
  const {
    track,
    playing,
    progress,
    currentTime,
    duration,
    volume,
    muted,
    togglePlay,
    seekTo,
    setVolume,
    setMuted,
    next,
    prev,
    expanded,
    setExpanded,
    shuffle,
    repeat,
    smoothTransitions,
    toggleShuffle,
    cycleRepeat,
    isFavorite,
    toggleFavorite,
    focusMode,
    toggleFocusMode,
    toggleSmoothTransitions,
    preloadedTrack,
  } = usePlayer();

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const hideHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusHudVisible, setFocusHudVisible] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useFocusTrap(expanded, overlayRef);

  const liked = track ? isFavorite(track.src) : false;

  const accentValue = track?.accent?.trim();
  const accent = accentValue && accentValue.length > 0 ? accentValue : "rgb(120 120 120)";
  const mobileAccent = toVividMobileAccent(accent);
  const glow = withAlpha(accent, 0.22);
  const glowStrong = withAlpha(accent, 0.38);
  const mobileThemeSoft = withAlpha(mobileAccent, 0.66);
  const mobileThemeStrong = withAlpha(mobileAccent, 0.95);
  const mobileThemeEdge = withAlpha(mobileAccent, 0.54);
  const mobileThemeTint = withAlpha(mobileAccent, 0.52);
  const mobileThemeMultiply = withAlpha(mobileAccent, 0.36);
  const controlsHidden = !isMobileViewport && focusMode && playing && !focusHudVisible;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileViewport(media.matches);
    sync();

    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!(expanded && focusMode && playing)) {
      if (hideHudTimerRef.current) {
        clearTimeout(hideHudTimerRef.current);
        hideHudTimerRef.current = null;
      }
      return;
    }

    const revealHud = () => {
      setFocusHudVisible(true);
      if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
      hideHudTimerRef.current = setTimeout(() => {
        setFocusHudVisible(false);
        hideHudTimerRef.current = null;
      }, 3000);
    };

    const initTimer = setTimeout(revealHud, 0);
    window.addEventListener("mousemove", revealHud, { passive: true });
    window.addEventListener("mousedown", revealHud);
    window.addEventListener("keydown", revealHud);
    window.addEventListener("touchstart", revealHud, { passive: true });
    window.addEventListener("wheel", revealHud, { passive: true });

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener("mousemove", revealHud);
      window.removeEventListener("mousedown", revealHud);
      window.removeEventListener("keydown", revealHud);
      window.removeEventListener("touchstart", revealHud);
      window.removeEventListener("wheel", revealHud);
      if (hideHudTimerRef.current) {
        clearTimeout(hideHudTimerRef.current);
        hideHudTimerRef.current = null;
      }
    };
  }, [expanded, focusMode, playing]);

  function formatTime(s: number) {
    if (!Number.isFinite(s) || s <= 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function isFullscreen() {
    return typeof document !== "undefined" && !!document.fullscreenElement;
  }

  async function toggleFullscreen() {
    try {
      if (!isFullscreen()) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  }

  if (!expanded) return null;

  return (
    <>
      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          .mp3-ov-enter,
          .mp3-ov-bg,
          .mp3-ov-cover,
          .mp3-ov-panel,
          .mp3-ov-controls {
            animation: none !important;
            transition: none !important;
          }
        }

        @keyframes mp3OvEnter {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes mp3BgDrift {
          0% {
            transform: scale(1.06) translateY(0);
            opacity: 0.22;
          }
          50% {
            transform: scale(1.1) translateY(-6px);
            opacity: 0.28;
          }
          100% {
            transform: scale(1.06) translateY(0);
            opacity: 0.22;
          }
        }

        @keyframes mp3CoverPop {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes mp3PanelSlide {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes mp3ControlsRise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes mp3ProgressSheen {
          0% {
            transform: translateX(-120%);
            opacity: 0;
          }
          35% {
            opacity: 0.5;
          }
          100% {
            transform: translateX(120%);
            opacity: 0;
          }
        }

        .mp3-ov-enter {
          animation: mp3OvEnter 260ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
        }
        .mp3-ov-bg {
          animation: mp3BgDrift 9s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .mp3-ov-cover {
          animation: mp3CoverPop 320ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
        }
        .mp3-ov-panel {
          animation: mp3PanelSlide 260ms ease-out both;
          animation-delay: 60ms;
        }
        .mp3-ov-controls {
          animation: mp3ControlsRise 260ms ease-out both;
          animation-delay: 120ms;
        }

        .mp3-ov-volume-slider {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }

        .mp3-ov-volume-slider::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.16);
        }

        .mp3-ov-volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.45);
          background: rgba(255, 255, 255, 0.68);
          margin-top: -4px;
        }

        .mp3-ov-volume-slider::-moz-range-track {
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.16);
        }

        .mp3-ov-volume-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border: 1px solid rgba(255, 255, 255, 0.45);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.68);
        }
      `}</style>

      <div
        ref={overlayRef}
        className="group fixed inset-0 z-[9999] bg-black mp3-ov-enter"
        role="dialog"
        aria-modal="true"
        aria-label="Lecteur plein ecran"
      >
        {/* Background */}
        <div className="absolute inset-0">
          {track?.cover && (isMobileViewport || !focusMode) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={track.cover}
              alt=""
              className="mp3-ov-bg h-full w-full object-cover blur-2xl"
              style={{
                filter: isMobileViewport
                  ? "blur(52px) saturate(3.2) contrast(1.35) brightness(0.38)"
                  : "blur(44px) saturate(1.05)",
              }}
            />
          ) : null}

          <div
            className="absolute inset-0 md:hidden"
            style={{
              background: mobileThemeTint,
            }}
          />
          <div
            className="absolute inset-0 md:hidden"
            style={{
              background: `linear-gradient(180deg, ${mobileThemeMultiply} 0%, rgba(0,0,0,0) 72%)`,
            }}
          />
          <div
            className="absolute inset-0 md:hidden"
            style={{
              background: `radial-gradient(circle at 18% 22%, ${mobileThemeStrong} 0%, transparent 62%), radial-gradient(circle at 84% 88%, ${mobileThemeSoft} 0%, transparent 60%), radial-gradient(circle at 52% 48%, ${mobileThemeEdge} 0%, transparent 68%)`,
            }}
          />
          <div
            className="absolute inset-0 md:hidden"
            style={{
              background: `linear-gradient(155deg, ${mobileThemeSoft} 0%, rgba(0,0,0,0) 64%), radial-gradient(circle at 50% 100%, ${mobileThemeStrong} 0%, transparent 62%)`,
            }}
          />

          {focusMode ? (
            <>
              <div className="absolute inset-0 md:hidden bg-black/30" />
              <div className="absolute inset-0 hidden md:block bg-black/88" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 md:hidden bg-black/20" />
              <div className="absolute inset-0 md:hidden bg-gradient-to-b from-black/0 via-black/12 to-black/34" />
              <div className="absolute inset-0 hidden md:block bg-black/70" />
              <div className="absolute inset-0 hidden md:block bg-gradient-to-b from-black/30 via-black/55 to-black/85" />
            </>
          )}
        </div>

        {/* Top bar mobile */}
        <div
          className={[
            "relative z-10 md:hidden px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 mp3-ov-panel transition-all duration-300",
            controlsHidden
              ? "opacity-0 pointer-events-none -translate-y-2 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0"
              : "opacity-100",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-white/40">Lecture</p>
              <p className="text-sm font-semibold text-white/92 truncate">{track?.title ?? "Aucune lecture"}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleSmoothTransitions}
                aria-pressed={smoothTransitions}
                className={[
                  "h-10 rounded-full px-3 text-[11px] font-semibold transition",
                  smoothTransitions ? "bg-white/12 text-white ring-1 ring-white/15" : "bg-white/8 text-white/75 hover:bg-white/12",
                ].join(" ")}
                title={smoothTransitions ? "Transitions douces actives" : "Transitions douces inactives"}
                type="button"
              >
                FX
              </button>

              <button
                onClick={() => setExpanded(false)}
                className="h-10 w-10 rounded-full bg-white/8 hover:bg-white/12 transition active:scale-[0.98]"
                title="Fermer"
                type="button"
              >
                <X size={18} className="mx-auto opacity-90 text-white/85" />
              </button>
            </div>
          </div>
        </div>

        {/* Top bar desktop */}
        <div
          className={[
            "relative z-10 hidden md:flex items-center justify-between p-5 md:p-6 lg:p-8 mp3-ov-panel transition-all duration-300",
            controlsHidden
              ? "opacity-0 pointer-events-none -translate-y-2 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0"
              : "opacity-100",
          ].join(" ")}
        >
          <div className="min-w-0">
            <p className="text-xs text-white/45">En lecture</p>
            <p className="text-sm font-semibold text-white/90 truncate">
              {track?.title ?? "Aucune lecture"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSmoothTransitions}
              aria-pressed={smoothTransitions}
              className={[
                "h-11 px-4 rounded-full transition flex items-center gap-2 text-sm",
                smoothTransitions ? "bg-white/12 ring-1 ring-white/15 text-white" : "bg-white/8 hover:bg-white/12 text-white/80",
              ].join(" ")}
              title={smoothTransitions ? "Transitions douces actives" : "Transitions douces inactives"}
              type="button"
            >
              <span className="font-semibold">FX</span>
            </button>

            <button
              onClick={toggleFocusMode}
              aria-pressed={focusMode}
              className="h-11 px-4 rounded-full bg-white/8 hover:bg-white/12 transition active:scale-[0.98] flex items-center gap-2"
              title={focusMode ? "Quitter Focus" : "Mode Focus"}
              type="button"
            >
              {focusMode ? <EyeOff size={16} /> : <Eye size={16} />}
              <span className="text-sm text-white/85">Focus</span>
            </button>

            <button
              onClick={() => track && toggleFavorite(track)}
              disabled={!track}
              aria-pressed={liked}
              className={[
                "h-11 w-11 rounded-full transition active:scale-[0.98]",
                liked ? "bg-white/12 ring-1 ring-white/15" : "bg-white/8 hover:bg-white/12",
              ].join(" ")}
              title={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
              type="button"
            >
              <Heart
                size={18}
                className={[
                  "mx-auto opacity-90",
                  liked ? "fill-white/90 text-white/90" : "fill-transparent text-white/80",
                ].join(" ")}
              />
            </button>

            <button
              onClick={toggleFullscreen}
              className="h-11 w-11 rounded-full bg-white/8 hover:bg-white/12 transition active:scale-[0.98]"
              title="Plein Ã©cran"
              type="button"
            >
              <Maximize2 size={18} className="mx-auto opacity-90 text-white/85" />
            </button>

            <button
              onClick={() => setExpanded(false)}
              className="h-11 w-11 rounded-full bg-white/8 hover:bg-white/12 transition active:scale-[0.98]"
              title="Fermer"
              type="button"
            >
              <X size={18} className="mx-auto opacity-90 text-white/85" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 h-[calc(100vh-82px)] md:h-[calc(100vh-88px)] flex items-center justify-center px-4 md:px-8 lg:px-12 pb-[calc(env(safe-area-inset-bottom)+12px)] md:pb-10">
          <div
            className={[
              "w-full max-w-[1680px] grid gap-5 md:gap-10 lg:gap-14 items-start",
              focusMode ? "grid-cols-1 max-w-5xl" : "grid-cols-1 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]",
            ].join(" ")}
          >
            {/* Cover */}
            <div
              className={[
                "mx-auto w-full",
                focusMode
                  ? "max-w-[360px] sm:max-w-[420px] md:max-w-[760px]"
                  : "max-w-[360px] sm:max-w-[500px] md:max-w-[640px] lg:max-w-[760px] md:sticky md:top-10",
              ].join(" ")}
            >
              <div
                className="mp3-ov-cover aspect-square rounded-[26px] md:rounded-[38px] lg:rounded-[44px] overflow-hidden border border-white/10 bg-white/5"
                style={{
                  boxShadow: `0 0 0 1px rgba(255,255,255,0.06), 0 0 78px ${glow}`,
                }}
              >
                {track?.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.cover}
                    alt={track.title}
                    className={[
                      "h-full w-full object-cover mp3-now-cover",
                      playing ? "mp3-now-cover--playing" : "mp3-now-cover--idle",
                    ].join(" ")}
                    draggable={false}
                  />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
            </div>

            {/* Right */}
            <div className="w-full md:hidden mp3-ov-panel">
              {!focusMode ? (
                <>
                  <h1 className="text-2xl font-semibold text-white/95 leading-tight max-h-[4.8rem] overflow-hidden">
                    {track?.title ?? "Aucune lecture"}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/50">
                    {track?.artist ? (
                      <Link href={getArtistHref(track.artist)} className="truncate underline underline-offset-4 hover:text-white/85">
                        {track.artist}
                      </Link>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </>
              ) : null}

              <div
                className={[
                  focusMode ? "mt-4" : "mt-5",
                  "transition-all duration-300",
                  controlsHidden
                    ? "opacity-0 pointer-events-none translate-y-2 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0"
                    : "opacity-100",
                ].join(" ")}
              >
                <div
                  className="relative h-2.5 w-full rounded-full bg-white/10 overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const ratio = rect.width > 0 ? x / rect.width : 0;
                    seekTo(ratio);
                  }}
                  title="Cliquer pour se deplacer"
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${(progress || 0) * 100}%`,
                      background: accent,
                      boxShadow: `0 0 26px ${glowStrong}`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    style={{ animation: "mp3ProgressSheen 2.4s ease-in-out infinite" }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    value={Math.round((progress || 0) * 1000)}
                    onChange={(e) => seekTo(Number(e.target.value) / 1000)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Progression de lecture"
                    disabled={!track}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-white/45 tabular-nums">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div
                className={[
                  "mt-4 grid grid-cols-3 items-center gap-3 mp3-ov-controls transition-all duration-300",
                  controlsHidden
                    ? "opacity-0 pointer-events-none translate-y-2 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0"
                    : "opacity-100",
                ].join(" ")}
              >
                <button
                  onClick={prev}
                  className="h-[56px] w-full transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
                  disabled={!track}
                  title="Precedent"
                  type="button"
                >
                  <SkipBack size={24} className="opacity-90 text-white/90" />
                </button>

                <button
                  onClick={togglePlay}
                  className="h-[64px] w-full text-white transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center"
                  disabled={!track}
                  title={playing ? "Pause" : "Lecture"}
                  type="button"
                >
                  {playing ? <Pause size={28} /> : <Play size={28} />}
                </button>

                <button
                  onClick={next}
                  className="h-[56px] w-full transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
                  disabled={!track}
                  title="Suivant"
                  type="button"
                >
                  <SkipForward size={24} className="opacity-90 text-white/90" />
                </button>
              </div>

            </div>

            <div className="hidden md:block w-full mp3-ov-panel lg:self-center lg:translate-y-8">
              {!focusMode ? (
                <>
                  <div className="flex items-center gap-5 min-w-0">
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white/95 truncate min-w-0 flex-1">
                      {track?.title ?? "Aucune lecture"}
                    </h1>
                    <AudioBars bars={20} height={48} className="shrink-0 opacity-70" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-lg md:text-xl text-white/45">
                    {track?.artist ? (
                      <Link href={getArtistHref(track.artist)} className="truncate underline underline-offset-4 hover:text-white/80">
                        {track.artist}
                      </Link>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </>
              ) : null}

              {/* Progress */}
              <div
                className={[
                  focusMode ? "mt-7" : "mt-12",
                  "transition-all duration-300",
                  controlsHidden
                    ? "opacity-0 pointer-events-none translate-y-2 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0"
                    : "opacity-100",
                ].join(" ")}
              >
                <div
                  className="relative h-3 w-full rounded-full bg-white/10 overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const ratio = rect.width > 0 ? x / rect.width : 0;
                    seekTo(ratio);
                  }}
                  title="Cliquer pour se dÃ©placer"
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${(progress || 0) * 100}%`,
                      background: accent,
                      boxShadow: `0 0 26px ${glowStrong}`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    style={{ animation: "mp3ProgressSheen 2.4s ease-in-out infinite" }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    value={Math.round((progress || 0) * 1000)}
                    onChange={(e) => seekTo(Number(e.target.value) / 1000)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Progression de lecture"
                    disabled={!track}
                  />
                </div>
                <div className="flex justify-between mt-3 text-sm text-white/35 tabular-nums">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div
                className={[
                  "mt-12 flex items-center justify-center gap-4 lg:gap-5 mp3-ov-controls transition-all duration-300",
                  controlsHidden
                    ? "opacity-0 pointer-events-none translate-y-2 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0"
                    : "opacity-100",
                ].join(" ")}
              >
                <button
                  onClick={toggleShuffle}
                  aria-pressed={shuffle}
                  className={[
                    "h-[52px] w-[52px] lg:h-14 lg:w-14 rounded-full transition active:scale-[0.98]",
                    shuffle ? "bg-white/12 ring-1 ring-white/15" : "bg-white/8 hover:bg-white/12",
                  ].join(" ")}
                  title="Lecture alÃ©atoire"
                  type="button"
                >
                  <Shuffle size={22} className="mx-auto opacity-90 text-white/85" />
                </button>

                <button
                  onClick={prev}
                  className="h-[60px] w-[60px] lg:h-16 lg:w-16 rounded-full bg-white/8 hover:bg-white/12 transition active:scale-[0.98] disabled:opacity-50"
                  disabled={!track}
                  title="PrÃ©cÃ©dent"
                  type="button"
                >
                  <SkipBack size={24} className="mx-auto opacity-90 text-white/85" />
                </button>

                <button
                  onClick={togglePlay}
                  className={[
                    "h-[72px] w-[72px] lg:h-20 lg:w-20 rounded-full text-lg font-semibold transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-center",
                    "bg-white text-black",
                  ].join(" ")}
                  style={{
                    boxShadow: `0 0 98px ${glowStrong}`,
                  }}
                  disabled={!track}
                  title={playing ? "Pause" : "Lecture"}
                  type="button"
                >
                  {playing ? <Pause size={28} /> : <Play size={28} />}
                </button>

                <button
                  onClick={next}
                  className="h-[60px] w-[60px] lg:h-16 lg:w-16 rounded-full bg-white/8 hover:bg-white/12 transition active:scale-[0.98] disabled:opacity-50"
                  disabled={!track}
                  title="Suivant"
                  type="button"
                >
                  <SkipForward size={24} className="mx-auto opacity-90 text-white/85" />
                </button>

                <button
                  onClick={cycleRepeat}
                  aria-pressed={Boolean(repeat)}
                  className={[
                    "h-[52px] w-[52px] lg:h-14 lg:w-14 rounded-full transition active:scale-[0.98]",
                    repeat ? "bg-white/12 ring-1 ring-white/15" : "bg-white/8 hover:bg-white/12",
                  ].join(" ")}
                  title="Repeat"
                  type="button"
                >
                  {repeat === "one" ? (
                    <Repeat1 size={22} className="mx-auto opacity-90 text-white/85" />
                  ) : (
                    <Repeat size={22} className="mx-auto opacity-90 text-white/85" />
                  )}
                </button>
              </div>

              {/* Volume */}
              <div
                className={[
                  "mt-10 flex items-center gap-4 lg:gap-5 mp3-ov-controls transition-all duration-300",
                  controlsHidden
                    ? "opacity-0 pointer-events-none translate-y-2 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0"
                    : "opacity-100",
                ].join(" ")}
              >
                <button
                  className={[
                    "h-[52px] w-[52px] lg:h-14 lg:w-14 rounded-full transition active:scale-[0.98]",
                    muted ? "bg-white/12 ring-1 ring-white/15" : "bg-white/8 hover:bg-white/12",
                  ].join(" ")}
                  onClick={() => setMuted(!muted)}
                  aria-pressed={muted}
                  title={muted ? "RÃ©activer" : "Couper"}
                  type="button"
                >
                  {muted || volume === 0 ? (
                    <VolumeX size={22} className="mx-auto opacity-90 text-white/85" />
                  ) : volume < 0.5 ? (
                    <Volume1 size={22} className="mx-auto opacity-90 text-white/85" />
                  ) : (
                    <Volume2 size={22} className="mx-auto opacity-90 text-white/85" />
                  )}
                </button>

                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(volume * 100)}
                  onChange={(e) => setVolume(Number(e.target.value) / 100)}
                  className="w-full mp3-ov-volume-slider opacity-45 hover:opacity-60 transition"
                  aria-label="Volume"
                />

                <span className="text-xs text-white/35 tabular-nums w-12 text-right">
                  {Math.round(volume * 100)}
                </span>
              </div>

              {!focusMode ? (
                <div className="mt-6 text-xs text-white/25 mp3-ov-panel flex items-center justify-center">
                  <span className="italic">© · Azer0.</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
