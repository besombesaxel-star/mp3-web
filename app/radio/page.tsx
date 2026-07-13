"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Music2, Radio as RadioIcon, Users } from "lucide-react";
import { usePlayer } from "@/app/PlayerContext";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";

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
const PRESENCE_CHANNEL = "radio-live-presence";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatEta(seconds: number) {
  if (seconds < 30) return "dans un instant";
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `dans ${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `dans ${h} h ${m} min` : `dans ${h} h`;
}

function formatDayKey(dayKey: string) {
  const parts = dayKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "";
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function NowPlayingBars({ tone }: { tone: string }) {
  return (
    <span className="flex gap-[2px] items-end shrink-0" style={{ height: 14 }}>
      {[0.4, 1, 0.6].map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${tone}`}
          style={{
            height: `${h * 14}px`,
            animation: "nowPlayingBar 0.8s ease-in-out infinite alternate",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

export default function RadioLivePage() {
  const { track, playing, radioMode, tuneInRadio, leaveRadio } = usePlayer();

  const [live, setLive] = useState<RadioLiveResponse | null>(null);
  const [fetchedAtClient, setFetchedAtClient] = useState(0);
  const [displayOffset, setDisplayOffset] = useState(0);
  const [error, setError] = useState("");
  const [tuning, setTuning] = useState(false);
  const [listenerCount, setListenerCount] = useState(1);
  const presenceKeyRef = useRef("");
  if (!presenceKeyRef.current) {
    presenceKeyRef.current = Math.random().toString(36).slice(2);
  }

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

  useEffect(() => {
    const client = getSupabaseBrowserAuthClient();
    if (!client) return;

    const channel = client.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: presenceKeyRef.current } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setListenerCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ at: Date.now() });
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

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
  const isOnAir = isTunedIn && playing;
  const progressRatio =
    live && live.track.durationSeconds > 0 ? Math.min(1, displayOffset / live.track.durationSeconds) : 0;
  const remainingSeconds = live ? Math.max(0, live.track.durationSeconds - displayOffset) : 0;

  let etaCursor = remainingSeconds;
  const upNextWithEta =
    live?.upNext.map((item) => {
      const etaSeconds = etaCursor;
      etaCursor += item.durationSeconds;
      return { ...item, etaSeconds };
    }) ?? [];

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
        <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up">
          <p className="text-sm text-white/50 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => void fetchLive()}
            className="h-9 px-4 rounded-full border border-white/15 text-sm text-white/70 hover:bg-white/8 transition"
          >
            Reessayer
          </button>
        </div>
      ) : !live ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up">
            <div className="h-3 w-20 rounded-full bg-white/8 animate-pulse mb-6" />
            <div className="flex items-center gap-5">
              <div className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-2xl bg-white/8 animate-pulse" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-5 w-2/3 rounded-full bg-white/8 animate-pulse" />
                <div className="h-3.5 w-1/3 rounded-full bg-white/6 animate-pulse" />
              </div>
            </div>
            <div className="mt-6 h-1.5 rounded-full bg-white/8 animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="relative overflow-hidden rounded-3xl border border-white/8 mp3-fade-up">
            <div className="absolute inset-0">
              {live.track.cover ? (
                <Image
                  src={live.track.cover}
                  alt=""
                  aria-hidden="true"
                  fill
                  sizes="700px"
                  className="object-cover scale-110 blur-2xl opacity-40"
                  priority
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/75 to-black/90" />
            </div>

            <div className="relative z-10 p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  <p className="text-xs uppercase tracking-[0.22em] text-white/50">En direct</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-white/40" title="Personnes sur la radio en ce moment">
                  <Users size={12} />
                  <span className="tabular-nums">{listenerCount}</span>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/15 shadow-lg shadow-black/40">
                  {live.track.cover ? (
                    <Image src={live.track.cover} alt={live.track.title} fill className="object-cover" sizes="112px" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Music2 size={28} className="text-white/20" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-medium text-white/95 truncate">{live.track.title}</p>
                  <p className="text-sm text-white/50 truncate mt-1">
                    {live.track.artist}
                    {live.track.ownerDisplayName ? ` · ${live.track.ownerDisplayName}` : ""}
                  </p>
                  {isOnAir ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <NowPlayingBars tone="bg-emerald-300/80" />
                      <span className="text-xs text-emerald-300/80">Tu es a l&apos;antenne</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6">
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white transition-[width]"
                    style={{ width: `${progressRatio * 100}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/40 tabular-nums">
                  <span>{formatTime(displayOffset)}</span>
                  <span>-{formatTime(remainingSeconds)}</span>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-white/35">
                  Piste {live.trackIndex + 1} / {live.totalTracks}
                  {formatDayKey(live.dayKey) ? ` · Programme du ${formatDayKey(live.dayKey)}` : ""}
                </p>
                {isTunedIn ? (
                  <button
                    type="button"
                    onClick={leaveRadio}
                    className="h-11 px-6 rounded-full border border-white/15 text-white/80 text-sm font-medium hover:bg-white/10 transition"
                  >
                    Quitter la radio
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleTuneIn()}
                    disabled={tuning}
                    className="h-11 px-6 rounded-full bg-white text-black text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-black/30"
                  >
                    <RadioIcon size={15} />
                    {tuning ? "Connexion..." : "Ecouter en direct"}
                  </button>
                )}
              </div>
            </div>
          </section>

          {upNextWithEta.length > 0 ? (
            <section
              className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up"
              style={{ animationDelay: "40ms" }}
            >
              <p className="text-xs uppercase tracking-[0.22em] text-white/25 mb-4">A suivre</p>
              <div className="space-y-1">
                {upNextWithEta.map((item, i) => (
                  <div
                    key={`${item.src}-${i}`}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/5 transition"
                  >
                    <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-white/5">
                      {item.cover ? (
                        <Image src={item.cover} alt={item.title} fill className="object-cover" sizes="40px" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Music2 size={12} className="text-white/20" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/80 truncate">{item.title}</p>
                      <p className="text-xs text-white/35 truncate">{item.artist}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-white/30 tabular-nums">{formatEta(item.etaSeconds)}</p>
                      <p className="text-[11px] text-white/20 tabular-nums">{formatTime(item.durationSeconds)}</p>
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
