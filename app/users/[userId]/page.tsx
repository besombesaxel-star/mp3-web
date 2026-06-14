"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePlayer } from "@/app/PlayerContext";
import { getArtistHref, getInitials, hashStringToHue } from "@/lib/publicLinks";

type PublicTrack = {
  artist: string;
  cover: string | null;
  createdAt: number;
  ownerDisplayName: string | null;
  ownerId: string | null;
  ownerLabel: string | null;
  src: string;
  title: string;
};

type PublicProfile = {
  bio: string;
  displayName: string;
  initials: string;
  joinedAt: string | null;
  uploads: PublicTrack[];
  uploadsCount: number;
  userId: string;
  uniqueArtistsCount: number;
};

type PublicProfileResponse = {
  error?: string;
  ok?: boolean;
  profile?: PublicProfile;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatJoinedAt(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR");
}

export default function PublicUserProfilePage() {
  const params = useParams<{ userId: string }>();
  const { setQueueAndPlay } = usePlayer();
  const userId = typeof params?.userId === "string" ? params.userId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  const avatarStyle = useMemo(() => {
    const hue = hashStringToHue(userId || profile?.displayName || "mp3-user");
    return {
      background: `linear-gradient(135deg, hsla(${hue}, 74%, 58%, 0.92), hsla(${(hue + 58) % 360}, 78%, 52%, 0.82))`,
      boxShadow: `0 18px 52px hsla(${hue}, 72%, 52%, 0.24)`,
    };
  }, [profile?.displayName, userId]);

  const uploadsForPlayer = useMemo(
    () =>
      (profile?.uploads ?? []).map((track) => ({
        artist: track.artist,
        cover: track.cover ?? undefined,
        src: track.src,
        title: track.title,
      })),
    [profile?.uploads]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!userId) {
        setError("Profil introuvable.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/public/users/${encodeURIComponent(userId)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as PublicProfileResponse;

        if (!res.ok || !json.ok || !json.profile) {
          throw new Error(json.error ?? `Impossible de charger ce profil (${res.status})`);
        }

        if (cancelled) return;
        setProfile(json.profile);
      } catch (errorValue: unknown) {
        if (cancelled) return;
        setProfile(null);
        setError(getErrorMessage(errorValue, "Impossible de charger ce profil."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="pb-28">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-white/35">Profil public</p>
          <h1 className="mt-2 text-3xl font-light text-white/95">
            {loading ? "Chargement..." : profile?.displayName ?? "Profil"}
          </h1>
        </div>

        <Link href="/library" className="text-sm text-white/60 hover:text-white/85 transition">
          Retour bibliotheque
        </Link>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 animate-pulse">
            <div className="h-24 w-24 rounded-3xl bg-white/10" />
            <div className="mt-4 h-6 w-40 rounded bg-white/10" />
            <div className="mt-3 h-4 w-full rounded bg-white/10" />
            <div className="mt-2 h-4 w-3/4 rounded bg-white/10" />
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 animate-pulse">
            <div className="h-6 w-32 rounded bg-white/10" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-20 rounded-2xl bg-white/10" />
              ))}
            </div>
          </div>
        </div>
      ) : profile ? (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <aside className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="h-24 w-24 rounded-3xl text-2xl font-semibold text-white flex items-center justify-center" style={avatarStyle}>
              {getInitials(profile.displayName, profile.initials)}
            </div>

            <h2 className="mt-5 text-2xl text-white/95">{profile.displayName}</h2>
            {formatJoinedAt(profile.joinedAt) ? (
              <p className="mt-2 text-sm text-white/45">Compte cree le {formatJoinedAt(profile.joinedAt)}</p>
            ) : null}
            <p className="mt-4 text-sm leading-6 text-white/65">
              {profile.bio || "Aucune bio publique pour le moment."}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/35">Uploads</p>
                <p className="mt-2 text-2xl text-white/95">{profile.uploadsCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/35">Artistes</p>
                <p className="mt-2 text-2xl text-white/95">{profile.uniqueArtistsCount}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setQueueAndPlay(uploadsForPlayer, 0)}
              disabled={uploadsForPlayer.length === 0}
              className="mt-6 h-11 w-full rounded-2xl bg-white text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
            >
              Lire ses uploads
            </button>
          </aside>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/35">Bibliotheque publique</p>
                <h3 className="mt-2 text-xl text-white/92">Derniers sons partages</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
                {profile.uploadsCount} morceau{profile.uploadsCount > 1 ? "x" : ""}
              </span>
            </div>

            {profile.uploads.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/55">
                Aucun son public pour le moment.
              </div>
            ) : (
              <div className="space-y-3">
                {profile.uploads.map((track, index) => (
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
                        <Link
                          href={getArtistHref(track.artist)}
                          className="mt-1 inline-flex max-w-full truncate text-xs text-white/55 underline underline-offset-4 hover:text-white/85"
                        >
                          {track.artist}
                        </Link>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setQueueAndPlay(uploadsForPlayer, index)}
                      className="h-10 rounded-2xl bg-white px-4 text-sm font-medium text-black transition hover:opacity-90 sm:shrink-0"
                    >
                      Lire
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
