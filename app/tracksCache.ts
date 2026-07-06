import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { subscribeTracksUpdated } from "./tracksSync";

export type ApiTrack = {
  title: string;
  artist: string;
  src: string;
  cover: string | null;
  isLegacyShared?: boolean;
  isOwnedByViewer?: boolean;
  ownerDisplayName?: string | null;
  ownerId?: string | null;
  ownerLabel?: string | null;
  credits?: string | null;
};

type TracksResponse = {
  tracks?: ApiTrack[];
};

let cachedTracks: ApiTrack[] | null = null;
let cachedWithAuth = false;
let inFlight: Promise<ApiTrack[]> | null = null;
let inFlightWithAuth = false;

// All pages render the same /api/tracks list; only the per-viewer
// isOwnedByViewer flag depends on the access token. Share one fetch
// across pages instead of every page re-fetching it on mount.
export async function fetchTracksShared(accessToken?: string | null): Promise<ApiTrack[]> {
  const wantsAuth = Boolean(accessToken);

  if (cachedTracks && cachedWithAuth === wantsAuth) return cachedTracks;
  if (inFlight && inFlightWithAuth === wantsAuth) return inFlight;

  inFlightWithAuth = wantsAuth;
  const request = (async () => {
    const res = await fetch("/api/tracks", {
      cache: "no-store",
      headers: createAuthorizedHeaders(accessToken ?? null),
    });
    if (!res.ok) throw new Error("Impossible de charger /api/tracks");

    const json = (await res.json()) as TracksResponse;
    const tracks = Array.isArray(json.tracks) ? json.tracks : [];
    cachedTracks = tracks;
    cachedWithAuth = wantsAuth;
    return tracks;
  })();

  inFlight = request;
  try {
    return await request;
  } finally {
    if (inFlight === request) inFlight = null;
  }
}

if (typeof window !== "undefined") {
  subscribeTracksUpdated(() => {
    cachedTracks = null;
  });
}
