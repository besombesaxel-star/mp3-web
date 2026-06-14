"use client";

import { useEffect } from "react";
import { usePlayer } from "./PlayerContext";

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
  ]);

  return null;
}
