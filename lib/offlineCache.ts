export type OfflineCacheableTrack = {
  src: string;
  cover?: string | null;
};

function toAbsoluteUrls(track: OfflineCacheableTrack): string[] {
  const urls: string[] = [];
  if (track.src) urls.push(track.src);
  if (track.cover) urls.push(track.cover);
  return urls;
}

/**
 * Asks the active service worker to fetch and cache the given tracks'
 * audio/cover files so they remain playable offline. No-op if there's no
 * active service worker (unsupported browser, or not yet registered).
 */
export async function cacheTracksForOffline(tracks: OfflineCacheableTrack[]): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const controller = registration.active;
    if (!controller) return;

    const urls = tracks.flatMap(toAbsoluteUrls);
    if (urls.length === 0) return;

    controller.postMessage({ type: "CACHE_URLS", urls });
  } catch {
    // service worker unavailable or not registered yet; safe to ignore
  }
}
