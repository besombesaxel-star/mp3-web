"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getErrorMessage } from "@/lib/errorMessage";
import type { ApiTrack } from "./tracksCache";

const DEFAULT_PAGE_SIZE = 60;

export type InfiniteTracksOptions = {
  query?: string;
  artist?: string;
  ownerIds?: string[];
  pageSize?: number;
  enabled?: boolean;
};

/**
 * Paginated /api/tracks?limit=&offset=&q=&artist=&ownerIds= consumer. Resets
 * to page 1 whenever query/artist/ownerIds change (a fresh search), and
 * appends on fetchNextPage (infinite scroll). Filters that can't be
 * expressed server-side (favorites - stored client-only in localStorage,
 * see PlayerContext) stay the caller's responsibility.
 */
export function useInfiniteTracks({
  query = "",
  artist = "",
  ownerIds,
  pageSize = DEFAULT_PAGE_SIZE,
  enabled = true,
}: InfiniteTracksOptions) {
  const { accessToken } = useAuth();
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const offsetRef = useRef(0);
  const requestIdRef = useRef(0);

  const ownerIdsKey = ownerIds && ownerIds.length > 0 ? [...ownerIds].sort().join(",") : "";

  const fetchPage = useCallback(
    async (reset: boolean) => {
      const requestId = ++requestIdRef.current;
      const offset = reset ? 0 : offsetRef.current;

      setLoading(true);
      if (reset) setError("");

      try {
        const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
        if (query.trim()) params.set("q", query.trim());
        if (artist.trim()) params.set("artist", artist.trim());
        if (ownerIdsKey) params.set("ownerIds", ownerIdsKey);

        const res = await fetch(`/api/tracks?${params.toString()}`, {
          cache: "no-store",
          headers: createAuthorizedHeaders(accessToken ?? null),
        });
        if (!res.ok) throw new Error("Impossible de charger la liste");

        const json = (await res.json()) as { tracks?: ApiTrack[]; total?: number; hasMore?: boolean };
        const page = Array.isArray(json.tracks) ? json.tracks : [];

        if (requestId !== requestIdRef.current) return; // superseded by a newer request

        setTracks((prev) => (reset ? page : [...prev, ...page]));
        setTotal(json.total ?? 0);
        setHasMore(Boolean(json.hasMore));
        offsetRef.current = offset + page.length;
      } catch (errorValue: unknown) {
        if (requestId === requestIdRef.current) {
          setError(getErrorMessage(errorValue, "Erreur lors du chargement"));
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [accessToken, pageSize, query, artist, ownerIdsKey]
  );

  useEffect(() => {
    if (!enabled) return;
    offsetRef.current = 0;
    void fetchPage(true);
    // fetchPage already depends on every filter below; re-listing them here
    // would just re-run this effect twice per change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, query, artist, ownerIdsKey, accessToken, pageSize]);

  const fetchNextPage = useCallback(() => {
    if (loading || !hasMore) return;
    void fetchPage(false);
  }, [loading, hasMore, fetchPage]);

  const refresh = useCallback(() => fetchPage(true), [fetchPage]);

  return { tracks, total, hasMore, loading, error, fetchNextPage, refresh };
}
