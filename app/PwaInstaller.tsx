"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const IOS_HINT_DISMISSED_KEY = "mp3:ios-install-hint-dismissed:v1";

export default function PwaInstaller() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [iosHintOpen, setIosHintOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (process.env.NODE_ENV !== "production") {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
          .catch(() => {});
      }

      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.filter((key) => key.startsWith("mp3-")).map((key) => caches.delete(key))))
          .catch(() => {});
      }

      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // Safari (iOS/iPadOS) never fires beforeinstallprompt, so without this the
    // "Installer l'app" affordance simply never appears for those users.
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const isIOS = /iPad|iPhone|iPod/.test(nav.userAgent) && !("MSStream" in window);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(IOS_HINT_DISMISSED_KEY) === "1";
    } catch {}
    if (isIOS && !isStandalone && !dismissed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- must read the real client-only UA/matchMedia/localStorage after mount
      setShowIosHint(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setPromptEvent(null);
      }
    } catch {
      // ignore install prompt failures
    }
  }

  function dismissIosHint() {
    setShowIosHint(false);
    setIosHintOpen(false);
    try {
      localStorage.setItem(IOS_HINT_DISMISSED_KEY, "1");
    } catch {}
  }

  if (installed) return null;

  if (promptEvent) {
    return (
      <button
        type="button"
        onClick={install}
        className="fixed left-4 bottom-[calc(11rem+env(safe-area-inset-bottom)+12px)] sm:bottom-[84px] z-[90] h-10 px-4 rounded-full border border-white/20 bg-black/85 text-white/90 text-xs backdrop-blur hover:bg-black transition"
        aria-label="Installer l'application"
        title="Installer l'application"
      >
        Installer l&apos;app
      </button>
    );
  }

  if (showIosHint) {
    return (
      <div className="fixed left-4 bottom-[calc(11rem+env(safe-area-inset-bottom)+12px)] sm:bottom-[84px] z-[90] flex flex-col items-start gap-2">
        {iosHintOpen && (
          <div className="max-w-[240px] rounded-2xl border border-white/15 bg-black/90 backdrop-blur px-4 py-3 text-xs leading-relaxed text-white/80 shadow-lg">
            <p className="mb-1 font-medium text-white/90">Installer .mp3</p>
            <p>
              Appuie sur <Share size={12} className="inline -mt-0.5" aria-hidden="true" /> Partager, puis « Sur
              l&apos;écran d&apos;accueil ».
            </p>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIosHintOpen((v) => !v)}
            className="h-10 px-4 rounded-full border border-white/20 bg-black/85 text-white/90 text-xs backdrop-blur hover:bg-black transition"
            aria-label="Comment installer l'application"
            title="Comment installer l'application"
          >
            Installer l&apos;app
          </button>
          <button
            type="button"
            onClick={dismissIosHint}
            className="h-8 w-8 shrink-0 rounded-full bg-black/70 text-white/45 backdrop-blur flex items-center justify-center hover:text-white/80 transition"
            aria-label="Ne plus afficher"
            title="Ne plus afficher"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
