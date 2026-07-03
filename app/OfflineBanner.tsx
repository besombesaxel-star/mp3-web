"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  // Starts false to match SSR (navigator is unavailable server-side); corrected on mount below.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- must read the real client-only navigator.onLine after mount
    setOffline(!navigator.onLine);

    function onOnline() {
      setOffline(false);
    }
    function onOffline() {
      setOffline(true);
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 bg-amber-400 text-black text-xs font-medium py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))]">
      <WifiOff size={13} />
      Tu es hors ligne
    </div>
  );
}
