"use client";

import { useEffect, useRef, useState } from "react";
import type { Track } from "./PlayerContext";

export type LrcLine = { time: number; text: string };

export type LyricsState = {
  lines: LrcLine[];
  plain: string | null;
  loading: boolean;
  hasLyrics: boolean;
};

function parseLrc(lrc: string): LrcLine[] {
  const result: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(/^\[(\d{1,2}):(\d{2})[.,](\d{2,3})\]\s*(.*)/);
    if (!m) continue;
    const msStr = m[3].length === 2 ? m[3] + "0" : m[3];
    const time = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(msStr, 10) / 1000;
    const text = m[4].trim();
    if (text) result.push({ time, text });
  }
  return result.sort((a, b) => a.time - b.time);
}

const lyricsCache = new Map<string, LyricsState>();

export function useLyrics(track: Track | null): LyricsState {
  const [state, setState] = useState<LyricsState>({
    lines: [],
    plain: null,
    loading: false,
    hasLyrics: false,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!track?.title) {
      setState({ lines: [], plain: null, loading: false, hasLyrics: false });
      return;
    }

    const key = `${track.title}|||${track.artist ?? ""}`;
    const cached = lyricsCache.get(key);
    if (cached) {
      setState(cached);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState((prev) => ({ ...prev, loading: true }));

    const params = new URLSearchParams({ track_name: track.title });
    if (track.artist) params.set("artist_name", track.artist);

    fetch(`https://lrclib.net/api/get?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { syncedLyrics?: string | null; plainLyrics?: string | null } | null) => {
        const lines = data?.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
        const plain = data?.plainLyrics ?? null;
        const result: LyricsState = {
          lines,
          plain,
          loading: false,
          hasLyrics: lines.length > 0 || Boolean(plain),
        };
        lyricsCache.set(key, result);
        setState(result);
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        const result: LyricsState = { lines: [], plain: null, loading: false, hasLyrics: false };
        lyricsCache.set(key, result);
        setState(result);
      });

    return () => ctrl.abort();
  }, [track?.title, track?.artist]);

  return state;
}
