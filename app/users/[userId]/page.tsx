"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Music, Play, Shuffle } from "lucide-react";
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
  avatarUrl: string;
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
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export default function PublicUserProfilePage() {
  const params = useParams<{ userId: string }>();
  const { setQueueAndPlay } = usePlayer();
  const userId = typeof params?.userId === "string" ? params.userId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  const hue = useMemo(() => hashStringToHue(userId || profile?.displayName || "mp3"), [profile?.displayName, userId]);

  const avatarStyle = useMemo(() => ({
    background: `linear-gradient(135deg, hsla(${hue}, 72%, 58%, 0.95), hsla(${(hue + 55) % 360}, 76%, 50%, 0.88))`,
    boxShadow: `0 12px 40px hsla(${hue}, 70%, 52%, 0.25)`,
  }), [hue]);

  const uploadsForPlayer = useMemo(
    () => (profile?.uploads ?? []).map((t) => ({
      artist: t.artist, cover: t.cover ?? undefined, src: t.src, title: t.title,
    })),
    [profile?.uploads]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) { setError("Profil introuvable."); setLoading(false); return; }
      try {
        setLoading(true); setError("");
        const res = await fetch(`/api/public/users/${encodeURIComponent(userId)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as PublicProfileResponse;
        if (!res.ok || !json.ok || !json.profile) throw new Error(json.error ?? `Profil introuvable (${res.status})`);
        if (!cancelled) setProfile(json.profile);
      } catch (e) {
        if (!cancelled) { setProfile(null); setError(getErrorMessage(e, "Impossible de charger ce profil.")); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between mp3-fade-up">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-white/30">Profil public</p>
          <h1 className="mt-1.5 text-3xl font-light text-white/95">
            {loading ? "Chargement..." : (profile?.displayName ?? "Profil")}
          </h1>
        </div>
        <Link href="/library" className="text-sm text-white/45 hover:text-white/80 transition">
          ← Bibliothèque
        </Link>
      </div>

      {error && (
        <div className="rounded-3xl border border-red-400/20 bg-red-400/8 px-5 py-4 text-sm text-red-200 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 animate-pulse space-y-4">
            <div className="h-20 w-20 rounded-2xl bg-white/10" />
            <div className="h-6 w-36 rounded-full bg-white/10" />
            <div className="h-4 w-full rounded-full bg-white/8" />
            <div className="h-4 w-3/4 rounded-full bg-white/6" />
          </div>
          <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-2xl bg-white/8" />)}
          </div>
        </div>
      ) : profile ? (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up">
              {/* Avatar */}
              <div className="mb-5">
                {profile.avatarUrl ? (
                  <div className="relative h-20 w-20 rounded-2xl overflow-hidden shadow-lg">
                    <Image src={profile.avatarUrl} alt={profile.displayName} fill className="object-cover" sizes="80px" />
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-2xl flex items-center justify-center text-2xl font-semibold text-white"
                    style={avatarStyle}>
                    {getInitials(profile.displayName, profile.initials)}
                  </div>
                )}
              </div>

              <h2 className="text-2xl font-medium text-white/95">{profile.displayName}</h2>
              {formatJoinedAt(profile.joinedAt) && (
                <p className="mt-1 text-sm text-white/40">Membre depuis {formatJoinedAt(profile.joinedAt)}</p>
              )}

              {profile.bio && (
                <p className="mt-4 text-sm leading-6 text-white/60 border-t border-white/8 pt-4">
                  {profile.bio}
                </p>
              )}

              {/* Stats */}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/8 bg-white/3 px-3 py-3 text-center">
                  <p className="text-2xl font-light text-white/90 tabular-nums">{profile.uploadsCount}</p>
                  <p className="text-xs text-white/35 mt-0.5">Son{profile.uploadsCount > 1 ? "s" : ""}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/3 px-3 py-3 text-center">
                  <p className="text-2xl font-light text-white/90 tabular-nums">{profile.uniqueArtistsCount}</p>
                  <p className="text-xs text-white/35 mt-0.5">Artiste{profile.uniqueArtistsCount > 1 ? "s" : ""}</p>
                </div>
              </div>

              {/* Actions */}
              {uploadsForPlayer.length > 0 && (
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setQueueAndPlay(uploadsForPlayer, 0)}
                    className="flex-1 h-10 rounded-2xl bg-white text-black text-sm font-semibold hover:opacity-90 transition flex items-center justify-center gap-2">
                    <Play size={14} className="fill-black" />
                    Écouter
                  </button>
                  <button type="button"
                    onClick={() => {
                      const shuffled = [...uploadsForPlayer].sort(() => Math.random() - 0.5);
                      setQueueAndPlay(shuffled, 0);
                    }}
                    className="h-10 w-10 rounded-2xl border border-white/10 bg-white/8 text-white/60 hover:bg-white/12 hover:text-white transition flex items-center justify-center">
                    <Shuffle size={14} />
                  </button>
                </div>
              )}
            </div>
          </aside>

          {/* Uploads */}
          <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/30 mb-1">Bibliothèque</p>
                <h3 className="text-lg font-medium text-white/90">Sons partagés</h3>
              </div>
              <span className="text-xs text-white/30 tabular-nums">
                {profile.uploadsCount} morceau{profile.uploadsCount > 1 ? "x" : ""}
              </span>
            </div>

            {profile.uploads.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/3 px-4 py-8 text-center">
                <Music size={24} className="mx-auto mb-2 text-white/15" />
                <p className="text-sm text-white/40">Aucun son public pour le moment.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {profile.uploads.map((track, index) => (
                  <div key={track.src}
                    className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/5 transition cursor-pointer"
                    onClick={() => setQueueAndPlay(uploadsForPlayer, index)}
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/5">
                      {track.cover ? (
                        <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="40px" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-white/25 text-xs uppercase">
                          {track.title.slice(0, 1) || "?"}
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition">
                        <Play size={12} className="fill-white text-white ml-0.5" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/88 truncate">{track.title}</p>
                      <Link
                        href={getArtistHref(track.artist)}
                        className="text-xs text-white/40 hover:text-white/70 transition truncate block max-w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {track.artist}
                      </Link>
                    </div>
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
