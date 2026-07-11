"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Bell,
  GripVertical,
  Heart,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Smartphone,
  Trophy,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import AudioEqualizer from "./AudioEqualizer";
import { usePlayer } from "./PlayerContext";
import { useFocusTrap } from "./useFocusTrap";
import { vibrate } from "./haptics";
import { useLongPress } from "./useLongPress";
import TrackContextMenu from "./TrackContextMenu";

function withAlpha(color: string | undefined, alpha: number) {
  if (!color) return `rgba(255,255,255,${alpha})`;

  const value = color.trim();
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;

  const hex3 = value.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const [r, g, b] = hex3[1].split("").map((char) => parseInt(char + char, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const hex6 = value.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const hex = hex6[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return `rgba(255,255,255,${alpha})`;
}

export default function MiniPlayer() {
  const {
    track,
    tracks,
    index,
    playing,
    progress,
    currentTime,
    duration,
    togglePlay,
    next,
    prev,
    volume,
    muted,
    setMuted,
    setVolume,
    seekTo,
    expanded,
    setExpanded,
    queueOpen,
    setQueueOpen,
    shuffle,
    repeat,
    preloadedTrack,
    toggleShuffle,
    cycleRepeat,
    isFavorite,
    toggleFavorite,
    playIndex,
    clearQueue,
    moveInQueue,
    removeFromQueue,
    achievementToast,
    dismissAchievementToast,
    undoToast,
    undoLastAction,
    dismissUndoToast,
    queueSuggestion,
    acceptQueueSuggestion,
    dismissQueueSuggestion,
    remoteSession,
    resumeOnThisDevice,
    dismissRemoteSession,
    stats,
    hapticsEnabled,
  } = usePlayer();

  const [smartToast, setSmartToast] = useState<{ id: string; message: string } | null>(null);
  const [nowPlayingMenuOpen, setNowPlayingMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const smartTipSeenRef = useRef<Set<string>>(new Set());
  useFocusTrap(queueOpen, drawerRef);

  const nowPlayingLongPress = useLongPress({ onLongPress: () => setNowPlayingMenuOpen(true) });

  function tapHaptic() {
    if (hapticsEnabled) vibrate(8);
  }

  const [progressHover, setProgressHover] = useState<{ x: number; time: number } | null>(null);

  function onProgressHover(e: React.MouseEvent<HTMLInputElement>) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setProgressHover({ x: e.clientX - rect.left, time: ratio * duration });
  }

  const [dragQueueIndex, setDragQueueIndex] = useState<number | null>(null);
  const [dragOverQueueIndex, setDragOverQueueIndex] = useState<number | null>(null);

  function onQueueRowDragStart(absoluteIndex: number) {
    setDragQueueIndex(absoluteIndex);
  }

  function onQueueRowDragOver(e: React.DragEvent, absoluteIndex: number) {
    e.preventDefault();
    if (dragOverQueueIndex !== absoluteIndex) setDragOverQueueIndex(absoluteIndex);
  }

  function onQueueRowDrop(absoluteIndex: number) {
    if (dragQueueIndex !== null && dragQueueIndex !== absoluteIndex) {
      moveInQueue(dragQueueIndex, absoluteIndex);
    }
    setDragQueueIndex(null);
    setDragOverQueueIndex(null);
  }

  function onQueueRowDragEnd() {
    setDragQueueIndex(null);
    setDragOverQueueIndex(null);
  }

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  function onMobileBarTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function onMobileBarTouchEnd(e: React.TouchEvent) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || !track) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    if (hapticsEnabled) vibrate(12);
    if (dx < 0) next();
    else prev();
  }

  const liked = track ? isFavorite(track.src) : false;

  const currentQueueTrack = index >= 0 && index < tracks.length ? tracks[index] : null;

  const accentValue = track?.accent?.trim();
  const mobileAccent = accentValue && accentValue.length > 0 ? accentValue : "#ffffff";
  const mobileAccentSoft = withAlpha(accentValue, 0.18);
  const mobileAccentStrong = withAlpha(accentValue, 0.42);
  const mobileCardStyle = {
    backgroundColor: "rgba(8, 8, 12, 0.96)",
    backgroundImage: [
      "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 100%)",
      `radial-gradient(circle at 0% 0%, ${mobileAccentStrong} 0%, transparent 46%)`,
      `radial-gradient(circle at 100% 100%, ${mobileAccentSoft} 0%, transparent 34%)`,
    ].join(", "),
  } as const;

  function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function isFullscreen() {
    return typeof document !== "undefined" && !!document.fullscreenElement;
  }

  async function toggleFullscreen() {
    try {
      if (!isFullscreen()) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // noop
    }
  }

  useEffect(() => {
    if (!queueOpen) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = drawerRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (!el.contains(target)) {
        setQueueOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setQueueOpen(false);
      }
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [queueOpen, setQueueOpen]);

  useEffect(() => {
    if (!playing || !track) return;

    const now = Date.now();
    const previousPlays = stats.recentPlays
      .filter((event) => event.src === track.src && now - event.playedAt > 90_000)
      .sort((a, b) => b.playedAt - a.playedAt);
    const lastPlay = previousPlays[0];
    if (!lastPlay) return;

    const daysSince = Math.floor((now - lastPlay.playedAt) / (24 * 60 * 60 * 1000));
    if (daysSince < 30) return;

    const tipId = `rediscovery:${track.src}:${lastPlay.playedAt}`;
    if (smartTipSeenRef.current.has(tipId)) return;
    smartTipSeenRef.current.add(tipId);

    const showTimer = setTimeout(() => {
      setSmartToast({
        id: tipId,
        message: `Tu n'avais pas ecoute ${track.title} depuis ${daysSince} jours.`,
      });
    }, 0);

    const hideTimer = setTimeout(() => {
      setSmartToast((value) => (value?.id === tipId ? null : value));
    }, 7000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [playing, stats.recentPlays, track]);

  return (
    <>
      <style jsx global>{`
        .mp3-mobile-progress {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }
        .mp3-mobile-progress::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
        }
        .mp3-mobile-progress::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 2px solid rgba(8, 8, 12, 0.92);
          background: rgba(255, 255, 255, 0.95);
          margin-top: -4px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
        }
        .mp3-mobile-progress::-moz-range-track {
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
        }
        .mp3-mobile-progress::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 2px solid rgba(8, 8, 12, 0.92);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
        }
        .mp3-slider {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          outline: none;
          cursor: pointer;
          transition: height 120ms ease;
        }
        .mp3-slider:hover,
        .mp3-slider:active {
          height: 7px;
        }
        .mp3-slider::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 999px;
          background: transparent;
        }
        .mp3-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 15px;
          height: 15px;
          border-radius: 999px;
          margin-top: -4.5px;
          background: #ffffff;
          border: 2px solid rgba(10, 10, 14, 0.9);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
          transition: transform 150ms ease, box-shadow 150ms ease;
        }
        .mp3-slider:hover::-webkit-slider-thumb,
        .mp3-slider:active::-webkit-slider-thumb {
          transform: scale(1.2);
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.5);
        }
        .mp3-slider::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: transparent;
        }
        .mp3-slider::-moz-range-thumb {
          width: 15px;
          height: 15px;
          border-radius: 999px;
          background: #ffffff;
          border: 2px solid rgba(10, 10, 14, 0.9);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
          transition: transform 150ms ease, box-shadow 150ms ease;
        }
        .mp3-slider:hover::-moz-range-thumb,
        .mp3-slider:active::-moz-range-thumb {
          transform: scale(1.2);
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.5);
        }
        .mp3-slider:disabled {
          cursor: default;
          opacity: 0.45;
        }
      `}</style>

      {achievementToast ? (
        <div
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+160px)] sm:bottom-[88px] left-1/2 -translate-x-1/2 z-[60] px-4 w-full max-w-lg"
          role="status"
          aria-live="polite"
        >
          <div className="mp3-toast-in rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <div className="mp3-achievement-glow h-10 w-10 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0 text-lg">
                {achievementToast.icon || <Trophy size={18} className="text-white/85" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/90 truncate">{achievementToast.title ?? "Succes debloque"}</p>
                {achievementToast.desc ? <p className="text-xs text-white/45 mt-1">{achievementToast.desc}</p> : null}
              </div>

              <button
                type="button"
                onClick={dismissAchievementToast}
                className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 transition"
                title="Fermer"
                aria-label="Fermer la notification"
              >
                <X size={16} className="mx-auto opacity-90 text-white/80" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {undoToast ? (
        <div
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+234px)] sm:bottom-[162px] left-1/2 -translate-x-1/2 z-[61] px-4 w-full max-w-lg"
          role="status"
          aria-live="polite"
        >
          <div className="mp3-toast-in rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4">
              <p className="text-sm text-white/85 truncate">{undoToast.message}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={undoLastAction}
                  className="h-9 px-3 rounded-full bg-white text-black text-xs font-medium hover:opacity-90 transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={dismissUndoToast}
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 transition"
                  aria-label="Fermer le toast undo"
                >
                  <X size={16} className="mx-auto opacity-90 text-white/80" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {queueSuggestion ? (
        <div
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+234px)] sm:bottom-[162px] left-1/2 -translate-x-1/2 z-[61] px-4 w-full max-w-lg"
          role="status"
          aria-live="polite"
        >
          <div className="mp3-toast-in rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="h-10 w-10 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
                <ListMusic size={18} className="text-white/85" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/88 truncate">
                  <span className="font-medium">{queueSuggestion.fromDisplayName}</span> suggere
                </p>
                <p className="text-xs text-white/50 truncate">{queueSuggestion.track.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={acceptQueueSuggestion}
                  className="h-9 px-3 rounded-full bg-white text-black text-xs font-medium hover:opacity-90 transition"
                >
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={dismissQueueSuggestion}
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 transition"
                  aria-label="Ignorer la suggestion"
                >
                  <X size={16} className="mx-auto opacity-90 text-white/80" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {remoteSession ? (
        <div
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+234px)] sm:bottom-[162px] left-1/2 -translate-x-1/2 z-[61] px-4 w-full max-w-lg"
          role="status"
          aria-live="polite"
        >
          <div className="mp3-toast-in rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="h-10 w-10 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
                <Smartphone size={18} className="text-white/85" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/88 truncate">
                  En cours sur <span className="font-medium">{remoteSession.deviceLabel}</span>
                </p>
                <p className="text-xs text-white/50 truncate">{remoteSession.track.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={resumeOnThisDevice}
                  className="h-9 px-3 rounded-full bg-white text-black text-xs font-medium hover:opacity-90 transition"
                >
                  Reprendre ici
                </button>
                <button
                  type="button"
                  onClick={dismissRemoteSession}
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 transition"
                  aria-label="Ignorer"
                >
                  <X size={16} className="mx-auto opacity-90 text-white/80" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {smartToast ? (
        <div
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+308px)] sm:bottom-[236px] left-1/2 -translate-x-1/2 z-[62] px-4 w-full max-w-lg"
          role="status"
          aria-live="polite"
        >
          <div className="mp3-toast-in rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="h-10 w-10 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
                <Bell size={18} className="text-white/85" />
              </div>
              <p className="min-w-0 flex-1 text-sm text-white/88 truncate">{smartToast.message}</p>
              <button
                type="button"
                onClick={() => setSmartToast(null)}
                className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 transition"
                aria-label="Fermer la notification intelligente"
              >
                <X size={16} className="mx-auto opacity-90 text-white/80" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {nowPlayingMenuOpen ? (
        <TrackContextMenu track={track} onClose={() => setNowPlayingMenuOpen(false)} />
      ) : null}

      <div
        className="fixed bottom-[60px] sm:bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black/90 backdrop-blur"
        role="region"
        aria-label="Mini lecteur"
      >
        {queueOpen ? (
          <div className="absolute left-0 right-0 bottom-[calc(env(safe-area-inset-bottom)+75px)] sm:bottom-[72px] px-4 sm:px-6">
            <div
              ref={drawerRef}
              id="queue-drawer"
              role="dialog"
              aria-label="File d'attente"
              className="mp3-drawer-in mx-auto w-full max-w-4xl rounded-3xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.55)] overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
                <div className="min-w-0">
                  <p className="text-xs text-white/45">File d&apos;attente</p>
                  <p className="text-sm text-white/85 truncate">{track ? "Gestion de la queue" : "Aucune lecture"}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tracks.length) clearQueue();
                    }}
                    disabled={!tracks.length}
                    className="text-xs text-white/40 hover:text-white/70 transition disabled:opacity-50"
                    title="Vider la file"
                  >
                    Vider
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQueueOpen(false);
                    }}
                    className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 transition"
                    title="Fermer"
                  >
                    <X size={16} className="mx-auto opacity-90 text-white/80" />
                  </button>
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto p-3 space-y-3">
                {currentQueueTrack ? (
                  <div className="space-y-2">
                    <p className="px-2 text-xs text-white/40">En cours</p>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/10 p-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 flex items-center gap-3 text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (index >= 0) playIndex(index);
                        }}
                        title="Lire ce morceau"
                      >
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/5">
                          {currentQueueTrack.cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={currentQueueTrack.cover}
                              alt={currentQueueTrack.title}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white/92 truncate">{currentQueueTrack.title}</p>
                          <p className="text-xs text-white/50 truncate">{currentQueueTrack.artist ?? "-"}</p>
                        </div>
                      </button>
                      <span className="text-[11px] text-white/55 shrink-0">Lecture</span>
                    </div>
                  </div>
                ) : null}

                {tracks.length > index + 1 ? (
                  <div className="space-y-2">
                    <p className="px-2 text-xs text-white/40">A suivre</p>
                    <div className="space-y-1.5">
                      {tracks.slice(index + 1).map((queuedTrack, offset) => {
                        const absoluteIndex = index + 1 + offset;
                        return (
                          <div
                            key={`${queuedTrack.src}-${absoluteIndex}`}
                            draggable
                            onDragStart={() => onQueueRowDragStart(absoluteIndex)}
                            onDragOver={(e) => onQueueRowDragOver(e, absoluteIndex)}
                            onDrop={() => onQueueRowDrop(absoluteIndex)}
                            onDragEnd={onQueueRowDragEnd}
                            className={[
                              "flex items-center gap-2 rounded-2xl border px-2 py-2 transition",
                              dragOverQueueIndex === absoluteIndex
                                ? "border-white/30 bg-white/10"
                                : "border-white/8 bg-white/[0.03] hover:bg-white/6",
                              dragQueueIndex === absoluteIndex ? "opacity-40" : "",
                            ].join(" ")}
                          >
                            <span className="cursor-grab active:cursor-grabbing text-white/25 hover:text-white/55 transition shrink-0">
                              <GripVertical size={15} />
                            </span>

                            <button
                              type="button"
                              className="min-w-0 flex-1 flex items-center gap-2.5 text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                playIndex(absoluteIndex);
                              }}
                              title="Lire ce morceau"
                            >
                              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white/5">
                                {queuedTrack.cover ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={queuedTrack.cover}
                                    alt={queuedTrack.title}
                                    className="h-full w-full object-cover"
                                  />
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-white/85 truncate">{queuedTrack.title}</p>
                                <p className="text-xs text-white/40 truncate">{queuedTrack.artist ?? "-"}</p>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromQueue(queuedTrack.src);
                              }}
                              className="h-7 w-7 rounded-full text-white/30 hover:text-white/70 hover:bg-white/8 transition shrink-0"
                              title="Retirer de la file"
                              aria-label="Retirer de la file"
                            >
                              <X size={13} className="mx-auto" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (track) setExpanded(true);
                    setQueueOpen(false);
                  }}
                  className="text-xs text-white/45 hover:text-white/80 transition"
                  title="Ouvrir le player"
                >
                  Ouvrir le player -&gt;
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="sm:hidden px-3 pt-2 pb-[10px]">
          <div
            onTouchStart={onMobileBarTouchStart}
            onTouchEnd={onMobileBarTouchEnd}
            className="relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_14px_36px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
            style={mobileCardStyle}
          >
            <div className="absolute inset-x-0 top-0 h-[3px] bg-white/10">
              <div
                className="h-full"
                style={{
                  width: `${(progress || 0) * 100}%`,
                  background: `linear-gradient(90deg, ${mobileAccent} 0%, rgba(255,255,255,0.95) 100%)`,
                }}
              />
            </div>

            <div className="relative flex items-center gap-3 px-3 py-2.5">
              <button
                type="button"
                className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/12 bg-black/35 disabled:opacity-85"
                onClick={() => {
                  if (nowPlayingLongPress.didLongPress()) return;
                  if (track) setExpanded(true);
                }}
                onTouchStart={nowPlayingLongPress.onTouchStart}
                onTouchMove={nowPlayingLongPress.onTouchMove}
                onTouchEnd={nowPlayingLongPress.onTouchEnd}
                onTouchCancel={nowPlayingLongPress.onTouchCancel}
                onContextMenu={nowPlayingLongPress.onContextMenu}
                title={track ? "Ouvrir le player" : "Choisis un morceau"}
                aria-label={track ? "Ouvrir le lecteur plein ecran" : "Aucun morceau en lecture"}
                disabled={!track}
              >
                {track?.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={track.src}
                    src={track.cover}
                    alt={track.title}
                    className={[
                      "h-full w-full object-cover mp3-now-cover",
                      playing ? "mp3-now-cover--playing" : "mp3-now-cover--idle",
                    ].join(" ")}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/5">
                    <Play size={14} className="text-white/30" />
                  </div>
                )}
              </button>

              <button
                type="button"
                className="min-w-0 flex-1 text-left disabled:opacity-80"
                onClick={() => {
                  if (nowPlayingLongPress.didLongPress()) return;
                  if (track) setExpanded(true);
                }}
                onTouchStart={nowPlayingLongPress.onTouchStart}
                onTouchMove={nowPlayingLongPress.onTouchMove}
                onTouchEnd={nowPlayingLongPress.onTouchEnd}
                onTouchCancel={nowPlayingLongPress.onTouchCancel}
                onContextMenu={nowPlayingLongPress.onContextMenu}
                disabled={!track}
                title={track ? "Ouvrir le player" : "Choisis un morceau"}
              >
                <p key={track?.src} className="truncate text-sm font-semibold text-white/94 mp3-fade-up">
                  {track?.title ?? "Aucune lecture"}
                </p>
                <p key={`artist-${track?.src}`} className="truncate text-[12px] text-white/50 mp3-fade-up" style={{ animationDelay: "30ms" }}>
                  {track?.artist ?? "Choisis un morceau"}
                </p>
              </button>

              <button
                onClick={() => {
                  tapHaptic();
                  togglePlay();
                }}
                disabled={!track}
                title={playing ? "Pause" : "Lecture"}
                className="h-10 w-10 shrink-0 rounded-full text-sm font-semibold disabled:opacity-60 transition-transform duration-150 active:scale-95 flex items-center justify-center bg-white text-black"
                type="button"
              >
                {playing ? <Pause size={17} /> : <Play size={17} />}
              </button>
            </div>
          </div>
        </div>

        <div className="hidden h-[72px] px-6 sm:grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="min-w-0 flex items-center gap-4">
            <div className="pointer-events-none hidden md:block -ml-3 mr-1 w-[64px] h-[64px] opacity-50 shrink-0" aria-hidden="true">
              <Image
                src="/images/ornement-strip.png"
                alt=""
                width={64}
                height={64}
                className="w-[64px] h-[64px] max-w-none object-contain"
                priority={false}
              />
            </div>

            <button
              type="button"
              className="min-w-0 flex items-center gap-4 cursor-pointer text-left disabled:cursor-default disabled:opacity-85 shrink-0"
              onClick={() => track && setExpanded(true)}
              title={track ? "Ouvrir le player" : "Choisis un morceau"}
              aria-label={track ? "Ouvrir le lecteur plein ecran" : "Aucun morceau en lecture"}
              disabled={!track}
            >
              <div className="group relative h-12 w-12">
                <div
                  className="pointer-events-none absolute -inset-2 rounded-2xl opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(circle at center, rgba(255,255,255,0.35), rgba(255,255,255,0) 70%)",
                  }}
                />
                <div className="relative h-12 w-12 rounded-2xl overflow-hidden border border-white/10 bg-[#0A0A0A]">
                  {track?.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={track.src}
                      src={track.cover}
                      alt={track.title}
                      className={[
                        "h-full w-full object-cover mp3-now-cover",
                        playing ? "mp3-now-cover--playing" : "mp3-now-cover--idle",
                      ].join(" ")}
                    />
                  ) : null}
                </div>
              </div>

              <div key={track?.src ?? "none"} className="min-w-0 mp3-fade-up">
                <div className="flex items-center gap-3 min-w-0">
                  <p className="text-sm text-white/90 truncate min-w-0">{track?.title ?? "Aucune lecture"}</p>

                  <div className="hidden sm:block shrink-0">
                    <AudioEqualizer
                      bars={12}
                      height={18}
                      accent={track?.accent}
                      thinWidth={3}
                      gap={3}
                      minBar={3}
                      smoothing={0.25}
                      punch={1.9}
                      className="opacity-90"
                      idle
                    />
                  </div>
                </div>

                <p className="text-xs text-white/45 truncate">{track?.artist ?? "-"}</p>
              </div>
            </button>

            <div className="hidden md:flex items-center gap-3 w-[240px]">
              <span className="text-[11px] text-white/40 tabular-nums w-[42px] text-right">{formatTime(currentTime)}</span>

              <div className="relative flex-1">
                {progressHover ? (
                  <div
                    className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md border border-white/15 bg-black/90 px-1.5 py-0.5 text-[10px] text-white/85 tabular-nums"
                    style={{ left: progressHover.x }}
                  >
                    {formatTime(progressHover.time)}
                  </div>
                ) : null}
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={Math.round((progress || 0) * 1000)}
                  onChange={(e) => seekTo(Number(e.target.value) / 1000)}
                  onMouseMove={onProgressHover}
                  onMouseLeave={() => setProgressHover(null)}
                  className="mp3-slider w-full"
                  style={{
                    background: `linear-gradient(to right, rgba(255,255,255,0.95) ${Math.round((progress || 0) * 100)}%, rgba(255,255,255,0.14) ${Math.round((progress || 0) * 100)}%)`,
                  }}
                  aria-label="Progression"
                  disabled={!track}
                  title="Progression"
                />
              </div>

              <span className="text-[11px] text-white/40 tabular-nums w-[42px]">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              className={[
                "h-10 w-10 rounded-full transition",
                liked ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5",
              ].join(" ")}
              onClick={() => {
                tapHaptic();
                if (track) toggleFavorite(track);
              }}
              aria-pressed={liked}
              disabled={!track}
              title={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
              type="button"
            >
              <Heart
                size={18}
                className={["mx-auto opacity-90", liked ? "fill-white/85 text-white/85" : "fill-transparent"].join(" ")}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                setQueueOpen(!queueOpen);
              }}
              className={[
                "h-10 w-10 rounded-full transition",
                queueOpen ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5",
              ].join(" ")}
              title="File d'attente"
              aria-label={queueOpen ? "Fermer la file d'attente" : "Ouvrir la file d'attente"}
              aria-controls="queue-drawer"
              aria-expanded={queueOpen}
            >
              <ListMusic size={18} className="mx-auto opacity-90" />
            </button>

            <button
              className="h-10 w-10 rounded-full hover:bg-white/5 transition disabled:opacity-40"
              onClick={() => {
                tapHaptic();
                prev();
              }}
              disabled={!track}
              title="Precedent"
              type="button"
            >
              <SkipBack size={18} className="mx-auto opacity-90" />
            </button>

            <div className="group relative">
              <div
                className="pointer-events-none absolute -inset-3 rounded-full opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(circle at center, rgba(255,255,255,0.45), rgba(255,255,255,0) 70%)",
                }}
              />

              <button
                onClick={() => {
                  tapHaptic();
                  togglePlay();
                }}
                disabled={!track}
                title={playing ? "Pause" : "Lecture"}
                className={[
                  "relative h-12 w-12 rounded-full text-sm font-semibold disabled:opacity-60",
                  "transition-transform duration-150 active:scale-95 hover:scale-[1.06]",
                  "flex items-center justify-center",
                  "bg-black text-white border border-white/15",
                  "shadow-[0_0_28px_rgba(255,255,255,0.18)]",
                  "hover:shadow-[0_0_36px_rgba(255,255,255,0.28)]",
                ].join(" ")}
                type="button"
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
            </div>

            <div className="relative group">
              <button
                className="h-10 w-10 rounded-full hover:bg-white/5 transition disabled:opacity-40"
                onClick={() => {
                  tapHaptic();
                  next();
                }}
                disabled={!track}
                title="Suivant"
                type="button"
              >
                <SkipForward size={18} className="mx-auto opacity-90" />
              </button>
              {preloadedTrack && preloadedTrack.src !== track?.src && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 scale-95 group-hover:scale-100 transition-all duration-200 ease-out whitespace-nowrap z-20">
                  <div className="bg-black/80 backdrop-blur-md rounded-lg px-3 py-1.5 text-left ring-1 ring-white/10">
                    <p className="text-xs text-white/90 font-medium max-w-[160px] truncate">{preloadedTrack.title}</p>
                    <p className="text-[11px] text-white/50 max-w-[160px] truncate">{preloadedTrack.artist}</p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={cycleRepeat}
              aria-pressed={Boolean(repeat)}
              className={[
                "h-10 w-10 rounded-full transition",
                repeat ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5",
              ].join(" ")}
              title="Repeat"
              type="button"
            >
              {repeat === "one" ? (
                <Repeat1 size={18} className={["mx-auto", repeat ? "text-white/85" : "opacity-90"].join(" ")} />
              ) : (
                <Repeat size={18} className={["mx-auto", repeat ? "text-white/85" : "opacity-90"].join(" ")} />
              )}
            </button>

            <button
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              className={[
                "h-10 w-10 rounded-full transition",
                shuffle ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5",
              ].join(" ")}
              title="Lecture aleatoire"
              type="button"
            >
              <Shuffle size={18} className={["mx-auto", shuffle ? "text-white/85" : "opacity-90"].join(" ")} />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <div className="pointer-events-none hidden md:block -mr-16 mt-2 w-[170px] h-[57px] opacity-50" aria-hidden="true">
              <Image
                src="/images/kanji.png"
                alt=""
                width={170}
                height={57}
                className="w-full h-full object-contain"
                priority={false}
              />
            </div>

            <div className="hidden md:flex items-center gap-2">
              <button
                className="h-9 w-9 rounded-full hover:bg-white/5 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted(!muted);
                }}
                aria-pressed={muted}
                title={muted ? "Reactiver" : "Couper"}
                type="button"
              >
                {muted || volume === 0 ? (
                  <VolumeX size={18} className="mx-auto opacity-90" />
                ) : volume < 0.5 ? (
                  <Volume1 size={18} className="mx-auto opacity-90" />
                ) : (
                  <Volume2 size={18} className="mx-auto opacity-90" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                className="mp3-slider w-[110px]"
                style={{
                  background: `linear-gradient(to right, rgba(255,255,255,0.95) ${muted ? 0 : Math.round(volume * 100)}%, rgba(255,255,255,0.14) ${muted ? 0 : Math.round(volume * 100)}%)`,
                }}
                aria-label="Volume"
              />
            </div>

            <button
              className="h-10 w-10 rounded-full hover:bg-white/5 transition"
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              title="Plein ecran"
              type="button"
            >
              <Maximize2 size={18} className="mx-auto opacity-90" />
            </button>

            {!expanded && preloadedTrack && preloadedTrack.src !== track?.src && (
              <p className="hidden xl:block text-[11px] text-white/30 truncate max-w-[180px] mp3-fade-up border-l border-white/10 pl-3">
                Suivant : {preloadedTrack.title}
              </p>
            )}

            <div className="pointer-events-none relative hidden md:block w-[40px] h-[40px] shrink-0" aria-hidden="true">
              <Image
                src="/images/Butterfly.png"
                alt=""
                width={96}
                height={96}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[96px] h-[96px] max-w-none opacity-50 object-contain"
                priority={false}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

