export const SHOW_SHORTCUTS_EVENT = "mp3-web:show-shortcuts";

export function openShortcutsHelp() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SHOW_SHORTCUTS_EVENT));
}

export function subscribeShowShortcuts(onShow: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(SHOW_SHORTCUTS_EVENT, onShow);
  return () => window.removeEventListener(SHOW_SHORTCUTS_EVENT, onShow);
}
