export const TRACKS_UPDATED_EVENT = "mp3-web:tracks-updated";

export function dispatchTracksUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRACKS_UPDATED_EVENT));
}

export function subscribeTracksUpdated(onUpdated: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => {
    onUpdated();
  };

  window.addEventListener(TRACKS_UPDATED_EVENT, handler);
  window.addEventListener("focus", handler);
  window.addEventListener("pageshow", handler);

  return () => {
    window.removeEventListener(TRACKS_UPDATED_EVENT, handler);
    window.removeEventListener("focus", handler);
    window.removeEventListener("pageshow", handler);
  };
}
