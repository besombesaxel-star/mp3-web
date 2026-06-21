"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePlayer } from "@/app/PlayerContext";
import { getPublicProfileHref } from "@/lib/publicLinks";

type ArtistTrack = {
  artist: string;
  cover: string | null;
  createdAt: number;
  ownerDisplayName: string | null;
  ownerId: string | null;
  ownerLabel: string | null;
  src: string;
  title: string;
};

type ArtistOwner = {
  count: number;
  displayName: string | null;
  ownerId: string | null;
  ownerLabel: string | null;
};

type ArtistData = {
  artist: string;
  artistSlug: string;
  owners: ArtistOwner[];
  recentTracks: ArtistTrack[];
  trackCount: number;
};

type ArtistResponse = {
  artist?: ArtistData;
  error?: string;
  ok?: boolean;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ArtistPage() {
  const params = useParams<{ artistSlug: string }>();
  const { setQueueAndPlay } = usePlayer();
  const artistSlug = typeof params?.artistSlug === "string" ? params.artistSlug : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [artist, setArtist] = useState<ArtistData | null>(null);

  const tracksForPlayer = useMemo(
    () =>
      (artist?.recentTracks ?? []).map((track) => ({
        artist: track.artist,
        cover: track.cover ?? undefined,
        src: track.src,
        title: track.title,
      })),
    [artist?.recentTracks]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadArtist() {
      if (!artistSlug) {
        setError("Artiste introuvable.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/public/artists/${encodeURIComponent(artistSlug)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as ArtistResponse;

        if (!res.ok || !json.ok || !json.artist) {
          throw new Error(json.error ?? `Impossible de charger cet artiste (${res.status})`);
        }

        if (cancelled) return;
        setArtist(json.artist);
      } catch (errorValue: unknown) {
        if (cancelled) return;
        setArtist(null);
        setError(getErrorMessage(errorValue, "Impossible de charger cet artiste."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadArtist();

    return () => {
      cancelled = true;
    };
  }, [artistSlug]);

  return (
    <div className="pb-[calc(17.5rem+env(safe-area-inset-bottom))] sm:pb-28">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-white/35">Page artiste</p>
          <h1 className="mt-2 text-3xl font-light text-white/95">
            {loading ? "Chargement..." : artist?.artist ?? "Artiste"}
          </h1>
        </div>

        <Link href="/search" className="text-sm text-white/60 hover:text-white/85 transition">
          Retour recherche
        </Link>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 animate-pulse">
          <div className="h-7 w-48 rounded bg-white/10" />
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 rounded-2xl bg-white/10" />
            ))}
          </div>
        </div>
      ) : artist ? (
        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-white/60">
                  {artist.trackCount} morceau{artist.trackCount > 1 ? "x" : ""} disponible{artist.trackCount > 1 ? "s" : ""}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {artist.owners.map((owner) =>
                    owner.ownerId ? (
                      <Link
                        key={`${owner.ownerId}-${owner.count}`}
                        href={getPublicProfileHref(owner.ownerId)}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70 hover:border-white/20 hover:text-white/90 transition"
                      >
                        {owner.ownerLabel ?? "Membre mp3"} · {owner.count}
                      </Link>
                    ) : (
                      <span
                        key={`legacy-${owner.ownerLabel ?? owner.count}`}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/55"
                      >
                        {owner.ownerLabel ?? "Bibliotheque partagee"} · {owner.count}
                      </span>
                    )
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQueueAndPlay(tracksForPlayer, 0)}
                disabled={tracksForPlayer.length === 0}
                className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
              >
                Lire l&apos;artiste
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/35">Catalogue</p>
                <h2 className="mt-2 text-xl text-white/92">Derniers morceaux</h2>
              </div>
            </div>

            <div className="space-y-3">
              {artist.recentTracks.map((track, index) => (
                <div
                  key={track.src}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#14141B]">
                      {track.cover ? (
                        <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="56px" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/35 text-xs uppercase">
                          {track.title.slice(0, 1) || "-"}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm text-white/92">{track.title}</p>
                      {track.ownerId ? (
                        <Link
                          href={getPublicProfileHref(track.ownerId)}
                          className="mt-1 inline-flex max-w-full truncate text-xs text-white/55 underline underline-offset-4 hover:text-white/85"
                        >
                          {track.ownerLabel ?? "Membre mp3"}
                        </Link>
                      ) : (
                        <p className="mt-1 truncate text-xs text-white/45">{track.ownerLabel ?? "Bibliotheque partagee"}</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setQueueAndPlay(tracksForPlayer, index)}
                    className="h-10 rounded-2xl bg-white px-4 text-sm font-medium text-black transition hover:opacity-90 sm:shrink-0"
                  >
                    Lire
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
