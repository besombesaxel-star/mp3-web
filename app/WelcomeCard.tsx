"use client";

import { useEffect, useState } from "react";
import { Compass, Music, Palette, Radio, X } from "lucide-react";
import { useAuth } from "./AuthProvider";

const WELCOME_SEEN_KEY = "mp3:welcome-seen:v1";

const HIGHLIGHTS = [
  { icon: Music, title: "Ta bibliothèque", desc: "Upload tes sons, organise-les en playlists, retrouve-les partout." },
  { icon: Palette, title: "Ton profil public", desc: "Thème, bannière, particules, sons épinglés — personnalise-le à fond." },
  { icon: Radio, title: "Radio en direct", desc: "Un programme continu partagé par toute la communauté." },
  { icon: Compass, title: "Découverte", desc: "Des recommandations basées sur ce que tu écoutes." },
];

/**
 * Shown once (localStorage flag, not tied to account age) so it reads fine
 * both for a brand-new signup and for an existing account that just hasn't
 * seen it yet after this feature shipped.
 */
export default function WelcomeCard() {
  const { isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let seen = false;
    try {
      seen = localStorage.getItem(WELCOME_SEEN_KEY) === "1";
    } catch {}
    if (!seen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- must read the client-only localStorage flag after mount
      setVisible(true);
    }
  }, [isAuthenticated]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {}
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 mp3-backdrop-in">
      <div
        className="w-full sm:max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#15151C] border border-white/10 p-6 mp3-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label="Découvre .mp3"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-lg font-medium text-white/95">Découvre .mp3</h2>
          <button
            type="button"
            onClick={dismiss}
            className="h-9 w-9 shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-white/80 flex items-center justify-center"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-white/45 mb-5">Un petit tour de ce qui t&apos;attend.</p>

        <div className="space-y-4 mb-6 overflow-y-auto">
          {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-white/5 flex items-center justify-center text-white/70">
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/90">{title}</p>
                <p className="text-xs text-white/45 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="h-11 shrink-0 rounded-2xl bg-white text-black text-sm font-medium hover:opacity-90 transition"
        >
          Compris
        </button>
      </div>
    </div>
  );
}
