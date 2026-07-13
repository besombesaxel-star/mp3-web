"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-400/10 text-red-300">
        <AlertTriangle size={22} />
      </div>
      <div>
        <h1 className="text-lg font-medium text-white/90">Un pépin est survenu</h1>
        <p className="mt-2 text-sm text-white/45">
          Quelque chose s&apos;est mal passé. Tu peux réessayer, ou revenir à l&apos;accueil.
        </p>
        {error.digest && <p className="mt-2 text-xs text-white/25">Référence : {error.digest}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 h-10 px-5 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition"
        >
          <RotateCcw size={14} />
          Réessayer
        </button>
        <Link
          href="/"
          className="flex items-center h-10 px-5 rounded-full border border-white/12 bg-white/6 text-sm text-white/70 hover:bg-white/10 hover:text-white transition"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
