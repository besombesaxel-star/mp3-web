"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Loader2, Music2 } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { dispatchTracksUpdated } from "@/app/tracksSync";

const SHARE_CACHE = "mp3-share-target-v1";
const SHARE_KEY = "/__share-target-stash__";

function guessTitleFromFile(name: string) {
  return name
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

type Status = "loading" | "ready" | "none" | "uploading" | "done" | "error";

export default function ShareTargetPage() {
  const { accessToken, isAuthenticated, loading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadShared() {
      if (typeof window === "undefined" || !("caches" in window)) {
        if (!cancelled) setStatus("none");
        return;
      }
      try {
        const cache = await caches.open(SHARE_CACHE);
        const stashed = await cache.match(SHARE_KEY);
        if (!stashed) {
          if (!cancelled) setStatus("none");
          return;
        }

        const blob = await stashed.blob();
        const fileName = decodeURIComponent(stashed.headers.get("X-Shared-File-Name") || "partage.mp3");
        await cache.delete(SHARE_KEY);
        if (cancelled) return;

        const sharedFile = new File([blob], fileName, { type: blob.type || "audio/mpeg" });
        setFile(sharedFile);
        setTitle(guessTitleFromFile(fileName));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("none");
      }
    }

    void loadShared();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload() {
    if (!file || !accessToken) return;
    setStatus("uploading");
    setError("");

    try {
      const formData = new FormData();
      formData.append("audio", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken),
        body: formData,
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; track?: { src?: string } };
      if (!res.ok || !json.ok || !json.track?.src) {
        throw new Error(json.error ?? `Upload impossible (HTTP ${res.status})`);
      }

      const cleanTitle = title.trim();
      const cleanArtist = artist.trim();
      if (cleanTitle || cleanArtist) {
        await fetch("/api/meta", {
          method: "POST",
          headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({
            src: json.track.src,
            title: cleanTitle || guessTitleFromFile(file.name),
            artist: cleanArtist || "Local upload",
          }),
        }).catch(() => {});
      }

      dispatchTracksUpdated();
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'upload.");
      setStatus("error");
    }
  }

  if (loading || status === "loading") {
    return (
      <div className="max-w-lg mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-24 text-center text-white/35 text-sm">
        Chargement…
      </div>
    );
  }

  if (status === "none") {
    return (
      <div className="max-w-lg mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-24 text-center px-6">
        <Music2 size={28} className="mx-auto text-white/25 mb-4" />
        <p className="text-sm text-white/55">Aucun fichier partagé pour le moment.</p>
        <p className="text-xs text-white/30 mt-1">
          Partage un fichier audio depuis une autre app en choisissant .mp3 dans le menu de partage.
        </p>
        <Link href="/upload" className="mt-4 inline-block text-sm text-white/70 underline underline-offset-4">
          Uploader autrement
        </Link>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-24 text-center px-6">
        <p className="text-sm text-white/45">Connecte-toi pour terminer cet upload.</p>
        <Link href="/account" className="mt-3 inline-block text-sm text-white/70 underline underline-offset-4">
          Aller au compte
        </Link>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="max-w-lg mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-24 text-center px-6">
        <Check size={28} className="mx-auto text-emerald-400 mb-4" />
        <p className="text-sm text-white/70">Son ajouté à la bibliothèque.</p>
        <Link href="/library" className="mt-4 inline-block text-sm text-white/70 underline underline-offset-4">
          Voir la bibliothèque
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40 pt-16 px-6">
      <h2 className="text-2xl font-light mb-6 text-center">Son partagé</h2>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 mp3-fade-up">
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/8">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-white/8 flex items-center justify-center">
            <Music2 size={18} className="text-white/50" />
          </div>
          <p className="text-sm text-white/80 truncate">{file?.name}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="share-title" className="block text-xs text-white/45 mb-1.5">Titre</label>
            <input
              id="share-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={status === "uploading"}
              className="w-full rounded-2xl bg-[#111118] border border-white/10 px-3 py-2 text-sm text-white/90 outline-none disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="share-artist" className="block text-xs text-white/45 mb-1.5">Artiste</label>
            <input
              id="share-artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              disabled={status === "uploading"}
              placeholder="Local upload"
              className="w-full rounded-2xl bg-[#111118] border border-white/10 px-3 py-2 text-sm text-white/90 outline-none disabled:opacity-60"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

        <button
          type="button"
          onClick={() => void handleUpload()}
          disabled={status === "uploading"}
          className="mt-5 w-full h-11 rounded-2xl bg-white text-black text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {status === "uploading" ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Envoi en cours…
            </>
          ) : (
            "Ajouter à la bibliothèque"
          )}
        </button>
      </div>
    </div>
  );
}
