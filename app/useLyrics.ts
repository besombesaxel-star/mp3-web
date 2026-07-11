"use client";

import { useEffect, useRef, useState } from "react";
import type { Track } from "./PlayerContext";

export type LrcLine = { time: number; text: string };

export type LyricsState = {
  lines: LrcLine[];
  plain: string | null;
  loading: boolean;
  hasLyrics: boolean;
  isCustom: boolean;
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
const customLyricsCache = new Map<string, string | null>();

const EMPTY_LYRICS_STATE: LyricsState = { lines: [], plain: null, loading: false, hasLyrics: false, isCustom: false };
const LOADING_LYRICS_STATE: LyricsState = { lines: [], plain: null, loading: true, hasLyrics: false, isCustom: false };

function cacheKeyFor(track: Track | null, durationSeconds?: number): string | null {
  if (!track?.title || !durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return `${track.title}|||${track.artist ?? ""}|||${Math.round(durationSeconds)}`;
}

type FetchedResult = { key: string; value: LyricsState };
type CustomFetchedResult = { src: string; value: string | null };

/** Lets an editor UI push a fresh save/delete into the shared cache without waiting for a refetch. */
export function setCustomLyricsCache(src: string, text: string | null) {
  customLyricsCache.set(src, text);
}

/** Custom lyrics entered by a track's owner always take priority over lrclib.net. */
export function useLyrics(track: Track | null, durationSeconds?: number): LyricsState {
  const [fetched, setFetched] = useState<FetchedResult | null>(null);
  const [customFetched, setCustomFetched] = useState<CustomFetchedResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const customSrc = track?.src ?? null;
  const customCached = customSrc ? customLyricsCache.get(customSrc) : undefined;
  const resolvedCustom: string | null | undefined = !customSrc
    ? null
    : customCached !== undefined
      ? customCached
      : customFetched?.src === customSrc
        ? customFetched.value
        : undefined;

  useEffect(() => {
    if (!customSrc || customLyricsCache.has(customSrc)) return;
    let cancelled = false;

    fetch(`/api/tracks/lyrics?src=${encodeURIComponent(customSrc)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { lyrics?: { text?: string } | null } | null) => {
        if (cancelled) return;
        const value = data?.lyrics?.text || null;
        customLyricsCache.set(customSrc, value);
        setCustomFetched({ src: customSrc, value });
      })
      .catch(() => {
        if (cancelled) return;
        customLyricsCache.set(customSrc, null);
        setCustomFetched({ src: customSrc, value: null });
      });

    return () => {
      cancelled = true;
    };
  }, [customSrc]);

  const key = resolvedCustom === null ? cacheKeyFor(track, durationSeconds) : null;
  const cached = key ? lyricsCache.get(key) : undefined;

  useEffect(() => {
    if (!key || !track?.title) {
      abortRef.current?.abort();
      return;
    }

    if (lyricsCache.has(key)) {
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const params = new URLSearchParams({ track_name: track.title, duration: String(Math.round(durationSeconds as number)) });
    if (track.artist) params.set("artist_name", track.artist);

    fetch(`https://lrclib.net/api/get?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { syncedLyrics?: string | null; plainLyrics?: string | null } | null) => {
        const lines = data?.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
        const plain = data?.plainLyrics ?? null;
        const value: LyricsState = {
          lines,
          plain,
          loading: false,
          // lrclib entries without a synced (LRC) version can't scroll/highlight in sync
          // with playback, so treat "plain lyrics only" as not found rather than showing
          // a static, non-following text block.
          hasLyrics: lines.length > 0,
          isCustom: false,
        };
        lyricsCache.set(key, value);
        setFetched({ key, value });
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        const value: LyricsState = { lines: [], plain: null, loading: false, hasLyrics: false, isCustom: false };
        lyricsCache.set(key, value);
        setFetched({ key, value });
      });

    return () => ctrl.abort();
  }, [key, track?.title, track?.artist, durationSeconds]);

  if (!track?.title) return EMPTY_LYRICS_STATE;
  if (resolvedCustom === undefined) return LOADING_LYRICS_STATE;
  if (resolvedCustom !== null) {
    return { lines: [], plain: resolvedCustom, loading: false, hasLyrics: true, isCustom: true };
  }

  if (!key) return LOADING_LYRICS_STATE;
  if (cached) return cached;
  if (fetched?.key === key) return fetched.value;

  return LOADING_LYRICS_STATE;
}
