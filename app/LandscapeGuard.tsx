"use client";

import { RotateCw } from "lucide-react";

export default function LandscapeGuard() {
  return (
    <div className="mp3-landscape-guard fixed inset-0 z-[10000] flex-col items-center justify-center gap-4 bg-black px-10 text-center">
      <RotateCw size={32} className="text-white/50" />
      <p className="text-sm text-white/70">
        Tourne ton telephone en mode portrait pour utiliser .mp3.
      </p>
    </div>
  );
}
