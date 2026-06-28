"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { usePlayer } from "./PlayerContext";
import { subscribeShowShortcuts } from "./shortcutsUi";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Espace"], label: "Lecture / Pause" },
  { keys: ["F"], label: "Plein ecran" },
  { keys: ["Echap"], label: "Fermer" },
  { keys: ["↑", "↓"], label: "Volume" },
  { keys: ["M"], label: "Muet" },
  { keys: ["←", "→"], label: "Reculer / Avancer 5s" },
  { keys: ["Maj", "←", "→"], label: "Morceau precedent / suivant" },
  { keys: ["S"], label: "Lecture aleatoire" },
  { keys: ["R"], label: "Repeter" },
  { keys: ["A"], label: "Lecture intelligente" },
  { keys: ["Z"], label: "Mode focus" },
  { keys: ["?"], label: "Afficher cette aide" },
];

export default function KeyboardShortcuts() {
  const {
    togglePlay,
    next,
    prev,
    setVolume,
    volume,
    setExpanded,
    expanded,
    toggleFocusMode,
    toggleSmartAutoplay,
    getAudio,
    muted,
    setMuted,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();

  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => subscribeShowShortcuts(() => setHelpOpen(true)), []);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      if (!el) return false;

      const tag = el.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;

      // contenteditable
      if ((el as HTMLElement).isContentEditable) return true;

      return false;
    }

    function seekBy(seconds: number) {
      const audio = getAudio();
      if (!audio) return;

      const d = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (d <= 0) return;

      const ct = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const nextTime = Math.max(0, Math.min(d, ct + seconds));
      audio.currentTime = nextTime;
    }

    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // Shortcuts help
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Play / Pause
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
        return;
      }

      // Expand / Collapse
      if (key === "f") {
        e.preventDefault();
        setExpanded(true);
        return;
      }
      if (e.key === "Escape") {
        if (helpOpen) {
          e.preventDefault();
          setHelpOpen(false);
          return;
        }
        if (expanded) {
          e.preventDefault();
          setExpanded(false);
        }
        return;
      }

      // Volume
      if (e.code === "ArrowUp") {
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
        return;
      }
      if (e.code === "ArrowDown") {
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
        return;
      }

      // Mute
      if (key === "m") {
        e.preventDefault();
        setMuted(!muted);
        return;
      }

      // Shuffle / Repeat
      if (key === "s") {
        e.preventDefault();
        toggleShuffle();
        return;
      }
      if (key === "a") {
        e.preventDefault();
        toggleSmartAutoplay();
        return;
      }
      if (key === "r") {
        e.preventDefault();
        cycleRepeat();
        return;
      }
      if (key === "z") {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Navigation / Seek
      // - ArrowLeft/Right : seek
      // - Shift + ArrowLeft/Right : prev/next track
      if (e.code === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) next();
        else seekBy(5);
        return;
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) prev();
        else seekBy(-5);
        return;
      }
    }

    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [
    togglePlay,
    next,
    prev,
    setVolume,
    volume,
    setExpanded,
    expanded,
    toggleFocusMode,
    toggleSmartAutoplay,
    getAudio,
    muted,
    setMuted,
    toggleShuffle,
    cycleRepeat,
    helpOpen,
  ]);

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={() => setHelpOpen(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-[#15151C] border border-white/10 p-6 mp3-pop"
        role="dialog"
        aria-modal="true"
        aria-label="Raccourcis clavier"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white/95">Raccourcis clavier</h2>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="h-9 w-9 rounded-full bg-white/8 hover:bg-white/12 flex items-center justify-center text-white/70 transition"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SHORTCUTS.map(({ keys, label }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5"
            >
              <span className="text-sm text-white/75">{label}</span>
              <div className="flex items-center gap-1 shrink-0">
                {keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="rounded-md border border-white/15 bg-white/8 px-1.5 py-0.5 text-xs font-mono text-white/85"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
