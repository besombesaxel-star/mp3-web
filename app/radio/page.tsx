"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Music2, Radio as RadioIcon, Users } from "lucide-react";
import { usePlayer } from "@/app/PlayerContext";

type RadioTrackData = {
  src: string;
  title: string;
  artist: string;
  cover: string | null;
  ownerDisplayName: string | null;
  durationSeconds: number;
};

type RadioLiveResponse = {
  ok: boolean;
  dayKey: string;
  track: RadioTrackData;
  trackIndex: number;
  totalTracks: number;
  offsetSeconds: number;
  serverNow: number;
  trackEndsAt: number;
  upNext: RadioTrackData[];
};

const POLL_MS = 10000;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RadioLivePage() {
  const { track, playing, radioMode, tuneInRadio, leaveRadio } = usePlayer();

  const [live, setLive] = useState<RadioLiveResponse | null>(null);
  const [fetchedAtClient, setFetchedAtClient] = useState(0);
  const [displayOffset, setDisplayOffset] = useState(0);
  const [error, setError] = useState("");
  const [tuning, setTuning] = useState(false);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/radio/live", { cache: "no-store" });
      const json = (await res.json()) as RadioLiveResponse;
      if (!res.ok || !json.ok) {
        setError("Radio indisponible pour le moment.");
        return;
      }
      setError("");
      setLive(json);
      setFetchedAtClient(Date.now());
    } catch {
      setError("Radio indisponible pour le moment.");
    }
  }, []);

  useEffect(() => {
    void fetchLive();
    const id = setInterval(() => void fetchLive(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchLive]);

  useEffect(() => {
    if (!live) return;
    const update = () => {
      const elapsedSincePoll = (Date.now() - fetchedAtClient) / 1000;
      setDisplayOffset(Math.min(live.track.durationSeconds, live.offsetSeconds + elapsedSincePoll));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [live, fetchedAtClient]);

  async function handleTuneIn() {
    if (tuning) return;
    setTuning(true);
    try {
      const ok = await tuneInRadio();
      if (!ok) setError("Impossible de rejoindre la radio pour le moment.");
    } finally {
      setTuning(false);
    }
  }

  const isTunedIn = radioMode && Boolean(live) && track?.src === live?.track.src;
  const progressRatio =
    live && live.track.durationSeconds > 0 ? Math.min(1, displayOffset / live.track.durationSeconds) : 0;

  return (
    <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-28">
      <div className="mb-8 mp3-fade-up">
        <div className="flex items-center gap-2">
          <RadioIcon size={18} className="text-white/40" />
          <h1 className="text-3xl font-light text-white/95">Radio en direct</h1>
        </div>
        <p className="mt-2 text-sm text-white/40">
          Un seul programme, le meme pour tout le monde, qui tourne en continu toute la journee.
        </p>
      </div>

      {error && !live ? (
        <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 text-sm text-white/50 mp3-fade-up">
          {error}
        </div>
      ) : !live ? (
        <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 text-sm text-white/40 mp3-fade-up">
          Chargement du programme...
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up">
            <div className="flex items-center gap-2 mb-5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <p className="text-xs uppercase tracking-[0.22em] text-white/40">En direct</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 rounded-2xl overflow-hidden bg-white/5">
                {live.track.cover ? (
                  <Image src={live.track.cover} alt={live.track.title} fill className="object-cover" sizes="64px" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Music2 size={20} className="text-white/20" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-medium text-white/95 truncate">{live.track.title}</p>
                <p className="text-sm text-white/45 truncate">
                  {live.track.artist}
                  {live.track.ownerDisplayName ? ` · ${live.track.ownerDisplayName}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white/70 transition-[width]"
                  style={{ width: `${progressRatio * 100}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-white/30 tabular-nums">
                <span>{formatTime(displayOffset)}</span>
                <span>{formatTime(live.track.durationSeconds)}</span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs text-white/30">
                Piste {live.trackIndex + 1} / {live.totalTracks}
              </p>
              {isTunedIn ? (
                <button
                  type="button"
                  onClick={leaveRadio}
                  className="h-10 px-5 rounded-full border border-white/15 text-white/70 text-sm hover:bg-white/8 transition"
                >
                  Quitter la radio
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleTuneIn()}
                  disabled={tuning}
                  className="h-10 px-5 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
                >
                  <RadioIcon size={14} />
                  {tuning ? "Connexion..." : "Ecouter la radio en direct"}
                </button>
              )}
            </div>

            {isTunedIn && playing ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300/80">
                <Users size={12} />
                Tu es a l&apos;antenne, en synchro avec tous les auditeurs.
              </p>
            ) : null}
          </section>

          {live.upNext.length > 0 ? (
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "40ms" }}>
              <p className="text-xs uppercase tracking-[0.22em] text-white/25 mb-4">A suivre</p>
              <div className="space-y-1">
                {live.upNext.map((item, i) => (
                  <div key={`${item.src}-${i}`} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                    <div className="relative h-9 w-9 shrink-0 rounded-xl overflow-hidden bg-white/5">
                      {item.cover ? (
                        <Image src={item.cover} alt={item.title} fill className="object-cover" sizes="36px" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Music2 size={11} className="text-white/20" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/80 truncate">{item.title}</p>
                      <p className="text-xs text-white/35 truncate">{item.artist}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
