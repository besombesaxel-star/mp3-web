"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Music2, Pause, Play } from "lucide-react";
import { usePlayer, type Track } from "@/app/PlayerContext";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function EmbedPlayer() {
  const searchParams = useSearchParams();
  const { track, playing, currentTime, duration, togglePlay, seekTo, setQueueAndPlay } = usePlayer();
  const barRef = useRef<HTMLDivElement>(null);

  const embedTrack = useMemo<Track | null>(() => {
    const src = searchParams.get("src") ?? "";
    if (!src) return null;
    return {
      title: searchParams.get("title") || "Morceau",
      artist: searchParams.get("artist") || undefined,
      src,
      cover: searchParams.get("cover") || undefined,
    };
  }, [searchParams]);

  const isThisTrack = Boolean(embedTrack) && track?.src === embedTrack?.src;
  const isPlaying = isThisTrack && playing;
  const progress = isThisTrack && duration > 0 ? currentTime / duration : 0;

  function handlePlayToggle() {
    if (!embedTrack) return;
    if (isThisTrack) {
      togglePlay();
    } else {
      setQueueAndPlay([embedTrack], 0);
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!isThisTrack || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    seekTo(Math.max(0, Math.min(1, ratio)));
  }

  if (!embedTrack) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0b0b0f] text-white/40 text-sm">
        Morceau introuvable.
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center gap-3 px-4 bg-[#0b0b0f] border border-white/10 rounded-2xl overflow-hidden">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/8 flex items-center justify-center">
        {embedTrack.cover ? (
          <Image src={embedTrack.cover} alt="" fill className="object-cover" sizes="56px" unoptimized />
        ) : (
          <Music2 size={20} className="text-white/30" />
        )}
      </div>

      <button
        type="button"
        onClick={handlePlayToggle}
        aria-label={isPlaying ? "Pause" : "Lecture"}
        className="h-10 w-10 shrink-0 rounded-full bg-white text-black flex items-center justify-center hover:opacity-90 transition"
      >
        {isPlaying ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current ml-0.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-white/90 truncate">{embedTrack.title}</p>
        {embedTrack.artist ? <p className="text-xs text-white/45 truncate">{embedTrack.artist}</p> : null}
        <div
          ref={barRef}
          onClick={handleSeek}
          className="mt-2 h-1.5 rounded-full bg-white/10 cursor-pointer overflow-hidden"
        >
          <div className="h-full rounded-full bg-white/70 transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {isThisTrack ? (
        <span className="hidden sm:block text-[11px] text-white/30 tabular-nums shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      ) : null}

      <Link
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] text-white/25 hover:text-white/50 transition shrink-0"
      >
        .mp3
      </Link>
    </div>
  );
}
