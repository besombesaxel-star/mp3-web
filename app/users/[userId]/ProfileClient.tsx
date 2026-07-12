"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Crown, Flame, FlaskConical, Gem, ListMusic, MessageCircle, Music, Play, Shield, Shuffle, Sparkles, Star, UserCheck, UserPlus } from "lucide-react";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";
import { ACHIEVEMENTS, type AchievementId } from "@/lib/achievements";
import { BADGE_LABELS, type BadgeKey } from "@/lib/badges";
import { getCosmeticForAchievement } from "@/lib/cosmetics";
import { PlatformIcon } from "@/app/PlatformIcon";
import { usePlayer } from "@/app/PlayerContext";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { getInitials, hashStringToHue } from "@/lib/publicLinks";
import ProfileParticles from "@/app/ProfileParticles";

const BADGE_STYLES: Record<BadgeKey, { icon: typeof Shield; className: string }> = {
  admin: { icon: Shield, className: "bg-red-500/20 text-red-300 border-red-500/30" },
  "co-founder": { icon: Crown, className: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  "early-member": { icon: Sparkles, className: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  premium: { icon: Gem, className: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  alpha: { icon: FlaskConical, className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  owner: { icon: Star, className: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
};

const REACTION_EMOJIS = ["🔥", "❤️", "😍", "🎧", "👏"];

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

type ProfileLink = {
  id: string;
  label: string;
  url: string;
};

type PublicProfile = {
  avatarFrame: AchievementId | null;
  avatarUrl: string;
  bannerUrl: string;
  bannerBlur: number;
  bannerDim: number;
  anthemTrack: PublicTrack | null;
  showParticles: boolean;
  badges: BadgeKey[];
  bio: string;
  displayName: string;
  followersCount: number;
  initials: string;
  joinedAt: string | null;
  links: ProfileLink[];
  pinnedTracks: PublicTrack[];
  themeHue: number | null;
  uploads: PublicTrack[];
  uploadsCount: number;
  userId: string;
  uniqueArtistsCount: number;
  unlockedAchievements: AchievementId[];
  currentStreak: number;
  isPrivate: boolean;
  viewsCount: number;
};

type PublicProfileResponse = {
  error?: string;
  ok?: boolean;
  profile?: PublicProfile;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatCount(n: number) {
  if (n >= 1000) return (n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + "k";
  return String(n);
}

function formatJoinedAt(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export default function ProfileClient() {
  const params = useParams<{ userId: string }>();
  const { setQueueAndPlay, track: myTrack, playing, togglePlay, suggestTrackToUser } = usePlayer();
  const { accessToken, isAuthenticated, user } = useAuth();
  const userId = typeof params?.userId === "string" ? params.userId : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [following, setFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<{ title: string; artist?: string | null; cover?: string | null } | null>(null);
  const [reactionSent, setReactionSent] = useState<string | null>(null);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [suggestSent, setSuggestSent] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);

  const isOwnProfile = !!user?.id && user.id === userId;

  const fallbackHue = useMemo(
    () => hashStringToHue(userId || profile?.displayName || "mp3"),
    [profile?.displayName, userId]
  );

  const themeHue = profile?.themeHue ?? null;
  const hue = themeHue ?? fallbackHue;
  const equippedCosmetic = useMemo(() => getCosmeticForAchievement(profile?.avatarFrame ?? null), [profile?.avatarFrame]);

  const uploadsQueue = useMemo(
    () => (profile?.uploads ?? []).map((t) => ({
      artist: t.artist, cover: t.cover ?? undefined, src: t.src, title: t.title,
    })),
    [profile?.uploads]
  );

  const pinnedQueue = useMemo(
    () => (profile?.pinnedTracks ?? []).map((t) => ({
      artist: t.artist, cover: t.cover ?? undefined, src: t.src, title: t.title,
    })),
    [profile?.pinnedTracks]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) { setError("Profil introuvable."); setLoading(false); return; }
      try {
        setLoading(true); setError("");
        const res = await fetch(`/api/public/users/${encodeURIComponent(userId)}`, {
          cache: "no-store",
          headers: createAuthorizedHeaders(accessToken),
        });
        const json = (await res.json().catch(() => ({}))) as PublicProfileResponse;
        if (!res.ok || !json.ok || !json.profile) throw new Error(json.error ?? `Profil introuvable (${res.status})`);
        if (!cancelled) {
          setProfile(json.profile);
          setFollowersCount(json.profile.followersCount ?? 0);
        }
      } catch (e) {
        if (!cancelled) { setProfile(null); setError(getErrorMessage(e, "Impossible de charger ce profil.")); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId, accessToken]);

  // Load now-playing
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function poll() {
      const res = await fetch(`/api/now-playing?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }).catch(() => null);
      if (!res || !res.ok || cancelled) return;
      const json = await res.json().catch(() => ({}));
      if (!cancelled) setNowPlaying(json.nowPlaying ?? null);
    }
    void poll();
    const interval = setInterval(() => { void poll(); }, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userId]);

  // Realtime now-playing updates
  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseBrowserAuthClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`user:${userId}:np`)
      .on("broadcast", { event: "now_playing" }, ({ payload }) => {
        const p = payload as { track?: { title: string; artist?: string | null; cover?: string | null } | null };
        setNowPlaying(p?.track ?? null);
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  // Load viewer's following state
  useEffect(() => {
    if (!isAuthenticated || !accessToken || !userId) return;
    let cancelled = false;
    fetch("/api/account", { cache: "no-store", headers: createAuthorizedHeaders(accessToken) })
      .then((r) => r.json())
      .then((data: { following?: string[] }) => {
        if (!cancelled) setFollowing(Array.isArray(data.following) && data.following.includes(userId));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, accessToken, userId]);

  async function sendReaction(emoji: string) {
    if (!accessToken || reactionBusy || isOwnProfile || !nowPlaying) return;
    setReactionBusy(true);
    try {
      const res = await fetch("/api/reactions", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ targetUserId: userId, emoji, trackTitle: nowPlaying.title }),
      });
      if (res.ok) {
        setReactionSent(emoji);
        setTimeout(() => setReactionSent(null), 1500);
      }
    } catch { /* silent */ }
    finally { setReactionBusy(false); }
  }

  async function sendQueueSuggestion() {
    if (!accessToken || suggestBusy || isOwnProfile || !nowPlaying || !myTrack) return;
    setSuggestBusy(true);
    try {
      const ok = await suggestTrackToUser(userId, myTrack);
      if (ok) {
        setSuggestSent(true);
        setTimeout(() => setSuggestSent(false), 1500);
      }
    } finally {
      setSuggestBusy(false);
    }
  }

  async function toggleFollow() {
    if (!accessToken || followBusy || isOwnProfile) return;
    setFollowBusy(true);
    const method = following ? "DELETE" : "POST";
    try {
      const res = await fetch(`/api/follow/${encodeURIComponent(userId)}`, {
        method,
        headers: createAuthorizedHeaders(accessToken),
      });
      const json = (await res.json()) as { ok?: boolean; followersCount?: number | null };
      if (res.ok && json.ok) {
        setFollowing(!following);
        if (typeof json.followersCount === "number") setFollowersCount(json.followersCount);
        else setFollowersCount((n) => (following ? Math.max(0, n - 1) : n + 1));
      }
    } catch { /* silent */ }
    finally { setFollowBusy(false); }
  }

  const bgGradient = themeHue !== null
    ? `radial-gradient(ellipse at 50% 0%, hsla(${themeHue}, 38%, 16%, 0.55) 0%, transparent 65%)`
    : `radial-gradient(ellipse at 50% 0%, hsla(${fallbackHue}, 25%, 10%, 0.45) 0%, transparent 65%)`;

  return (
    <div
      className="pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-28"
      style={!profile?.bannerUrl ? { backgroundImage: bgGradient, backgroundAttachment: "local" } : undefined}
    >
      {profile?.bannerUrl && (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
          <Image
            src={profile.bannerUrl}
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
            priority={false}
            style={{
              filter: profile.bannerBlur > 0 ? `blur(${profile.bannerBlur}px)` : undefined,
              transform: "scale(1.1)",
            }}
          />
          <div className="absolute inset-0" style={{ background: `hsla(${hue}, 45%, 6%, ${profile.bannerDim / 100})` }} />
        </div>
      )}

      {profile?.showParticles && <ProfileParticles hue={hue} />}

      <div className="relative z-10">
      {/* Top nav */}
      <div className="mb-8 flex items-center justify-between mp3-fade-up">
        <p className="text-xs uppercase tracking-[0.28em] text-white/25">Profil public</p>
        <Link href="/library" className="text-sm text-white/35 hover:text-white/70 transition">
          ← Bibliothèque
        </Link>
      </div>

      {error && (
        <div className="rounded-3xl border border-red-400/20 bg-red-400/8 px-5 py-4 text-sm text-red-200 mb-6 mp3-fade-up">
          {error}
        </div>
      )}

      {loading ? (
        /* Skeleton */
        <div className="mx-auto max-w-[520px] lg:max-w-[680px] space-y-4 mp3-fade-up">
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-24 w-24 rounded-full bg-white/8 animate-pulse" />
            <div className="h-7 w-44 rounded-full bg-white/8 animate-pulse" />
            <div className="h-4 w-64 rounded-full bg-white/6 animate-pulse" />
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : profile ? (
        <div className="mx-auto max-w-[520px] lg:max-w-[680px] space-y-5">

          {/* Avatar + identity */}
          <div className="flex flex-col items-center text-center pt-4 pb-2 mp3-fade-up">
            {profile.avatarUrl ? (
              <div
                className={[
                  "relative mb-4 h-24 w-24 rounded-full overflow-hidden ring-4",
                  equippedCosmetic ? `ring-offset-4 ring-offset-[#0b0b0f] ${equippedCosmetic.ringClassName}` : "",
                ].join(" ")}
                style={equippedCosmetic ? undefined : { boxShadow: `0 0 0 4px hsla(${hue}, 50%, 30%, 0.35), 0 12px 48px hsla(${hue}, 60%, 30%, 0.3)` }}
              >
                <Image src={profile.avatarUrl} alt={profile.displayName} fill className="object-cover" sizes="96px" />
              </div>
            ) : (
              <div
                className={[
                  "mb-4 h-24 w-24 rounded-full flex items-center justify-center text-3xl font-semibold text-white",
                  equippedCosmetic ? `ring-4 ring-offset-4 ring-offset-[#0b0b0f] ${equippedCosmetic.ringClassName}` : "",
                ].join(" ")}
                style={{
                  background: `linear-gradient(135deg, hsla(${hue}, 72%, 58%, 0.95), hsla(${(hue + 50) % 360}, 76%, 50%, 0.88))`,
                  boxShadow: equippedCosmetic ? undefined : `0 12px 40px hsla(${hue}, 60%, 38%, 0.3)`,
                }}
              >
                {getInitials(profile.displayName, profile.initials)}
              </div>
            )}

            <div className="flex flex-col gap-1.5 mb-1">
              <h1 className="text-2xl font-semibold text-white/95">{profile.displayName}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                {profile.badges.map((badgeKey) => {
                  const style = BADGE_STYLES[badgeKey];
                  if (!style) return null;
                  const Icon = style.icon;
                  return (
                    <span
                      key={badgeKey}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border ${style.className}`}
                    >
                      <Icon size={10} />
                      {BADGE_LABELS[badgeKey]}
                    </span>
                  );
                })}
                {profile.currentStreak > 0 && (
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border bg-orange-500/20 text-orange-300 border-orange-500/30"
                    title={`${profile.currentStreak} jour${profile.currentStreak > 1 ? "s" : ""} d'affilée`}
                  >
                    <Flame size={10} />
                    {profile.currentStreak}
                  </span>
                )}
              </div>
            </div>

            {formatJoinedAt(profile.joinedAt) && (
              <p className="text-xs text-white/30 mb-2">Membre depuis {formatJoinedAt(profile.joinedAt)}</p>
            )}

            {profile.bio && (
              <p className="text-sm leading-6 text-white/55 max-w-[380px] mt-1">{profile.bio}</p>
            )}

            {nowPlaying && (
              <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 border border-white/10 max-w-[320px]">
                <span className="flex gap-[2px] items-end shrink-0" style={{ height: 14 }}>
                  {[0.4, 1, 0.6].map((h, i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-white/60"
                      style={{
                        height: `${h * 14}px`,
                        animation: "nowPlayingBar 0.8s ease-in-out infinite alternate",
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </span>
                <p className="text-xs text-white/70 truncate">
                  <span className="text-white/35">En ce moment · </span>
                  {nowPlaying.artist && <span className="text-white/55">{nowPlaying.artist} — </span>}
                  <span className="font-medium text-white/85">{nowPlaying.title}</span>
                </p>
              </div>
            )}

            {nowPlaying && isAuthenticated && !isOwnProfile && (
              <div className="mt-2 flex items-center gap-1.5">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => void sendReaction(emoji)}
                    disabled={reactionBusy}
                    className={[
                      "h-8 w-8 rounded-full text-base transition flex items-center justify-center",
                      reactionSent === emoji
                        ? "bg-white/20 scale-110"
                        : "bg-white/6 hover:bg-white/12 active:scale-95",
                    ].join(" ")}
                    title={`Reagir avec ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                {myTrack && (
                  <button
                    type="button"
                    onClick={() => void sendQueueSuggestion()}
                    disabled={suggestBusy}
                    className={[
                      "h-8 px-3 rounded-full text-xs transition flex items-center gap-1.5",
                      suggestSent
                        ? "bg-white/20 text-white"
                        : "bg-white/6 hover:bg-white/12 active:scale-95 text-white/70",
                    ].join(" ")}
                    title={`Suggerer "${myTrack.title}" a sa file`}
                  >
                    {suggestSent ? <Check size={12} /> : <ListMusic size={12} />}
                    {suggestSent ? "Envoye" : "Suggerer mon son"}
                  </button>
                )}
              </div>
            )}

            {/* Stats row */}
            <div className="mt-4 flex items-center gap-5 text-center">
              <div>
                <p className="text-xl font-light tabular-nums text-white/90">{formatCount(profile.uploadsCount)}</p>
                <p className="text-xs text-white/30">son{profile.uploadsCount > 1 ? "s" : ""}</p>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <p className="text-xl font-light tabular-nums text-white/90">{formatCount(followersCount)}</p>
                <p className="text-xs text-white/30">abonné{followersCount > 1 ? "s" : ""}</p>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <p className="text-xl font-light tabular-nums text-white/90">{formatCount(profile.uniqueArtistsCount)}</p>
                <p className="text-xs text-white/30">artiste{profile.uniqueArtistsCount > 1 ? "s" : ""}</p>
              </div>
              {profile.viewsCount > 0 && (
                <>
                  <div className="h-6 w-px bg-white/10" />
                  <div>
                    <p className="text-xl font-light tabular-nums text-white/90">{formatCount(profile.viewsCount)}</p>
                    <p className="text-xs text-white/30">vue{profile.viewsCount > 1 ? "s" : ""}</p>
                  </div>
                </>
              )}
            </div>

            {profile.unlockedAchievements.length > 0 && (
              <div className="mt-4 flex items-center gap-1.5 flex-wrap justify-center max-w-[380px]">
                {ACHIEVEMENTS.filter((def) => profile.unlockedAchievements.includes(def.id)).map((def) => (
                  <span
                    key={def.id}
                    title={def.desc}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white/6 border text-white/70"
                    style={{ borderColor: `hsla(${hue}, 50%, 55%, 0.18)` }}
                  >
                    <span>{def.icon}</span>
                    {def.title}
                  </span>
                ))}
              </div>
            )}

            {/* Play + Follow actions */}
            <div className="mt-5 flex items-center gap-2 flex-wrap justify-center">
              {uploadsQueue.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setQueueAndPlay(uploadsQueue, 0)}
                    className="flex items-center gap-2 h-10 px-6 rounded-full text-sm font-semibold text-black transition hover:opacity-90"
                    style={{ background: `hsla(${hue}, 72%, 70%, 1)` }}
                  >
                    <Play size={13} className="fill-current" />
                    Écouter
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueAndPlay([...uploadsQueue].sort(() => Math.random() - 0.5), 0)}
                    className="flex items-center gap-2 h-10 px-4 rounded-full text-sm border border-white/12 bg-white/6 text-white/60 hover:bg-white/10 hover:text-white transition"
                  >
                    <Shuffle size={13} />
                  </button>
                </>
              )}
              {profile.anthemTrack && (() => {
                const anthemTrack = profile.anthemTrack;
                const isCurrentAnthem = myTrack?.src === anthemTrack.src;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (isCurrentAnthem) togglePlay();
                      else
                        setQueueAndPlay(
                          [{ title: anthemTrack.title, artist: anthemTrack.artist, src: anthemTrack.src, cover: anthemTrack.cover ?? undefined }],
                          0
                        );
                    }}
                    className="flex items-center gap-2 h-10 px-4 rounded-full text-sm font-medium border transition"
                    style={{
                      borderColor: `hsla(${hue}, 60%, 60%, 0.4)`,
                      background: `hsla(${hue}, 60%, 50%, 0.14)`,
                      color: `hsl(${hue}, 70%, 82%)`,
                    }}
                    title={`Hymne du profil : ${anthemTrack.title}`}
                  >
                    <Music size={13} className={isCurrentAnthem && playing ? "animate-pulse" : ""} />
                    Hymne
                  </button>
                );
              })()}
              {isAuthenticated && !isOwnProfile && (
                <button
                  type="button"
                  onClick={() => void toggleFollow()}
                  disabled={followBusy}
                  className={[
                    "flex items-center gap-2 h-10 px-5 rounded-full text-sm font-medium border transition disabled:opacity-50",
                    following
                      ? "bg-white/10 border-white/15 text-white/80 hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-300"
                      : "text-black border-transparent hover:opacity-90",
                  ].join(" ")}
                  style={following ? undefined : { background: `hsla(${hue}, 72%, 70%, 1)` }}
                >
                  {followBusy ? (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                  ) : following ? (
                    <UserCheck size={14} />
                  ) : (
                    <UserPlus size={14} />
                  )}
                  {following ? "Abonné" : "S'abonner"}
                </button>
              )}
              {isAuthenticated && !isOwnProfile && (
                <Link
                  href={`/messages/${userId}`}
                  className="flex items-center gap-2 h-10 px-5 rounded-full text-sm font-medium border border-white/12 bg-white/6 text-white/70 hover:bg-white/10 hover:text-white transition"
                >
                  <MessageCircle size={14} />
                  Message
                </Link>
              )}
            </div>
          </div>

          {/* Links */}
          {profile.links.length > 0 && (
            <div className="space-y-2.5 mp3-fade-up" style={{ animationDelay: "50ms" }}>
              {profile.links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between w-full rounded-2xl border border-white/10 bg-white/6 px-5 py-3.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:border-white/15 transition"
                  style={{ boxShadow: `0 1px 0 0 hsla(${hue}, 50%, 50%, 0.08)` }}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <PlatformIcon url={link.url} size={15} className="shrink-0 text-white/50 group-hover:text-white/75 transition" />
                    <span className="truncate">{link.label}</span>
                  </span>
                  <ExternalLink size={13} className="shrink-0 ml-3 text-white/30 group-hover:text-white/60 transition" />
                </a>
              ))}
            </div>
          )}

          {/* Pinned tracks */}
          {profile.pinnedTracks.length > 0 && (
            <section
              className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 mp3-fade-up"
              style={{ animationDelay: "90ms", boxShadow: `0 0 0 1px hsla(${hue}, 50%, 50%, 0.06), 0 20px 50px -30px hsla(${hue}, 60%, 40%, 0.35)` }}
            >
              <p className="text-xs uppercase tracking-[0.22em] text-white/25 mb-4">Sons mis en avant</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                {profile.pinnedTracks.map((track, idx) => (
                  <button
                    key={track.src}
                    type="button"
                    onClick={() => setQueueAndPlay(pinnedQueue, idx)}
                    className="group relative aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/8 hover:border-white/20 transition"
                  >
                    {track.cover ? (
                      <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="160px" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Music size={20} className="text-white/15" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
                      <Play size={16} className="fill-white text-white" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <p className="text-[10px] font-medium text-white/90 truncate leading-tight">{track.title}</p>
                      <p className="text-[9px] text-white/50 truncate leading-tight mt-0.5">{track.artist}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

        </div>
      ) : null}
      </div>
    </div>
  );
}
