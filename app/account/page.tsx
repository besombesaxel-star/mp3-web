"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowUp, Camera, Check, ExternalLink, Heart,
  KeyRound, Link2, LogOut, Music, Palette, Play, Plus, Shield,
  Trash2, Upload, User, UserCheck, UserPlus, X,
} from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { usePlayer } from "@/app/PlayerContext";
import { getPublicProfileHref, hashStringToHue } from "@/lib/publicLinks";
import type { ProfileLink } from "@/lib/accountData";
import AvatarCropper from "@/app/AvatarCropper";

type AccountTrack = {
  artist: string;
  cover?: string | null;
  createdAt?: number;
  ownerDisplayName?: string | null;
  ownerId?: string | null;
  src: string;
  title: string;
};

type AccountResponse = {
  avatarUrl?: string;
  favoriteSrcs?: string[];
  favoriteTracks?: AccountTrack[];
  followersCount?: number;
  following?: string[];
  links?: ProfileLink[];
  pinnedTrackSrcs?: string[];
  pinnedTracks?: AccountTrack[];
  publicBio?: string;
  themeHue?: number | null;
  uploads?: AccountTrack[];
  uploadsCount?: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function detectPlatform(url: string): string | null {
  const u = url.toLowerCase();
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("twitter.com") || u.includes("x.com")) return "X";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("soundcloud.com")) return "SoundCloud";
  if (u.includes("spotify.com")) return "Spotify";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("github.com")) return "GitHub";
  if (u.includes("twitch.tv")) return "Twitch";
  if (u.includes("discord.gg") || u.includes("discord.com/invite")) return "Discord";
  if (u.includes("bsky.app")) return "Bluesky";
  return null;
}

function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function InputField({
  id, label, type = "text", value, onChange, placeholder, required,
}: {
  id: string; label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs text-white/45">{label}</label>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-base sm:text-sm text-white/90 outline-none focus:border-white/25 focus:bg-white/8 transition-colors placeholder:text-white/25"
      />
    </div>
  );
}

function SectionMsg({ msg }: { msg: { text: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <p className={["text-xs mt-2", msg.ok ? "text-green-400/90" : "text-red-400/90"].join(" ")}>
      {msg.text}
    </p>
  );
}

const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-500", "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400", "from-orange-500 to-amber-400",
  "from-pink-500 to-rose-400", "from-fuchsia-500 to-purple-500",
];
function avatarGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

const THEME_PRESETS: { label: string; hue: number | null; color: string }[] = [
  { label: "Auto", hue: null, color: "bg-gradient-to-br from-white/20 to-white/5" },
  { label: "Violet", hue: 262, color: "bg-violet-500" },
  { label: "Bleu", hue: 210, color: "bg-blue-500" },
  { label: "Cyan", hue: 185, color: "bg-cyan-500" },
  { label: "Vert", hue: 152, color: "bg-emerald-500" },
  { label: "Orange", hue: 28, color: "bg-orange-500" },
  { label: "Rouge", hue: 0, color: "bg-red-500" },
  { label: "Rose", hue: 335, color: "bg-pink-500" },
];

function formatDate(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function AccountPage() {
  const {
    accessToken, displayName, isAuthenticated, isConfigured, loading,
    primaryLabel, signIn, signOut, signUp, updateDisplayName, updatePassword, user,
  } = useAuth();
  const { setQueueAndPlay } = usePlayer();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [profileName, setProfileName] = useState(displayName);
  const [newPassword, setNewPassword] = useState("");
  const [publicBio, setPublicBio] = useState("");

  const [busy, setBusy] = useState<"" | "signin" | "signup" | "profile" | "password" | "logout" | "avatar" | "links">("");
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [authMsg, setAuthMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [linksMsg, setLinksMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [avatarUrl, setAvatarUrl] = useState("");
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [favoriteTracks, setFavoriteTracks] = useState<AccountTrack[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [uploads, setUploads] = useState<AccountTrack[]>([]);
  const [totalUploads, setTotalUploads] = useState(0);

  // Personalisation
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [pinnedSrcs, setPinnedSrcs] = useState<Set<string>>(new Set());
  const [themeHue, setThemeHue] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const createdAtLabel = useMemo(() => {
    if (!user?.created_at) return "";
    const d = new Date(user.created_at);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }, [user?.created_at]);

  const uploadsForPlayer = useMemo(
    () => uploads.map((t) => ({ artist: t.artist, cover: t.cover ?? undefined, src: t.src, title: t.title })),
    [uploads]
  );

  const favoritesForPlayer = useMemo(
    () => favoriteTracks.map((t) => ({ artist: t.artist, cover: t.cover ?? undefined, src: t.src, title: t.title })),
    [favoriteTracks]
  );

  const initials = useMemo(() => (primaryLabel || user?.email || "").slice(0, 2).toUpperCase(), [primaryLabel, user?.email]);
  const gradient = useMemo(() => avatarGradient(primaryLabel || user?.email || ""), [primaryLabel, user?.email]);
  const fallbackHue = useMemo(() => hashStringToHue(user?.id ?? primaryLabel ?? "mp3"), [user?.id, primaryLabel]);
  const activeHue = themeHue ?? fallbackHue;

  useEffect(() => { setProfileName(displayName); }, [displayName]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) return;
      try {
        setProfileLoading(true);
        const res = await fetch("/api/account", { cache: "no-store", headers: createAuthorizedHeaders(accessToken) });
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const json = (await res.json()) as AccountResponse;
        if (cancelled) return;
        setAvatarUrl(json.avatarUrl ?? "");
        setFavoriteCount(Array.isArray(json.favoriteSrcs) ? json.favoriteSrcs.length : 0);
        setFavoriteTracks(Array.isArray(json.favoriteTracks) ? json.favoriteTracks : []);
        setPublicBio(json.publicBio ?? "");
        setLinks(Array.isArray(json.links) ? json.links : []);
        setPinnedSrcs(new Set(Array.isArray(json.pinnedTrackSrcs) ? json.pinnedTrackSrcs : []));
        setThemeHue(json.themeHue ?? null);
        setFollowingCount(Array.isArray(json.following) ? json.following.length : 0);
        setFollowersCount(typeof json.followersCount === "number" ? json.followersCount : 0);
        const uploadList = Array.isArray(json.uploads) ? json.uploads : [];
        setUploads(uploadList);
        setTotalUploads(json.uploadsCount ?? uploadList.length);
      } catch {
        if (!cancelled) {
          setAvatarUrl(""); setFavoriteCount(0); setFavoriteTracks([]); setPublicBio("");
          setLinks([]); setPinnedSrcs(new Set()); setThemeHue(null);
          setFollowingCount(0); setFollowersCount(0);
          setUploads([]); setTotalUploads(0);
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    if (!isAuthenticated || !accessToken) {
      setAvatarUrl(""); setFavoriteCount(0); setFavoriteTracks([]); setPublicBio("");
      setLinks([]); setPinnedSrcs(new Set()); setThemeHue(null);
      setUploads([]); setTotalUploads(0); setProfileLoading(false);
      return;
    }
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isAuthenticated]);

  // --- Avatar ---
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingAvatarFile(file);
  }

  async function uploadAvatarBlob(blob: Blob) {
    if (!accessToken) return;
    setBusy("avatar");
    try {
      const form = new FormData();
      form.append("image", blob, "avatar.jpg");
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken),
        body: form,
      });
      const json = await res.json() as { ok?: boolean; avatarUrl?: string; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Upload impossible.");
      setAvatarUrl(json.avatarUrl ?? "");
    } catch (err) {
      setProfileMsg({ text: getErrorMessage(err, "Erreur lors de l'upload."), ok: false });
    } finally {
      setBusy("");
    }
  }

  // --- Profile ---
  async function handleProfileUpdate(e: React.FormEvent) {
    e.preventDefault(); setBusy("profile"); setProfileMsg(null);
    try {
      await updateDisplayName(profileName);
      if (accessToken) {
        const res = await fetch("/api/account", {
          method: "PUT",
          headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({ publicBio }),
        });
        if (!res.ok) throw new Error(`Sauvegarde impossible (${res.status})`);
      }
      setProfileMsg({ text: "Profil mis à jour.", ok: true });
    } catch (e) { setProfileMsg({ text: getErrorMessage(e, "Mise à jour impossible."), ok: false }); }
    finally { setBusy(""); }
  }

  // --- Links ---
  function addLink() {
    const label = newLinkLabel.trim();
    const url = normalizeUrl(newLinkUrl);
    if (!label || !url) return;
    setLinks((prev) => [...prev, { id: uid(), label, url }]);
    setNewLinkLabel(""); setNewLinkUrl(""); setAddingLink(false);
  }

  function removeLink(id: string) { setLinks((prev) => prev.filter((l) => l.id !== id)); }

  function moveLink(id: string, dir: -1 | 1) {
    setLinks((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  async function saveLinks() {
    if (!accessToken) return;
    setBusy("links"); setLinksMsg(null);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          links,
          pinnedTrackSrcs: [...pinnedSrcs],
          themeHue,
        }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      setLinksMsg({ text: "Personnalisation sauvegardée.", ok: true });
    } catch (e) {
      setLinksMsg({ text: getErrorMessage(e, "Sauvegarde impossible."), ok: false });
    } finally {
      setBusy("");
    }
  }

  function togglePin(src: string) {
    setPinnedSrcs((prev) => {
      const next = new Set(prev);
      if (next.has(src)) { next.delete(src); return next; }
      if (next.size >= 6) return prev;
      next.add(src);
      return next;
    });
  }

  // --- Password ---
  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.trim().length < 6) { setPasswordMsg({ text: "Au moins 6 caractères requis.", ok: false }); return; }
    setBusy("password"); setPasswordMsg(null);
    try { await updatePassword(newPassword.trim()); setNewPassword(""); setPasswordMsg({ text: "Mot de passe mis à jour.", ok: true }); }
    catch (e) { setPasswordMsg({ text: getErrorMessage(e, "Mise à jour impossible."), ok: false }); }
    finally { setBusy(""); }
  }

  async function handleSignOut() {
    setBusy("logout");
    try { await signOut(); } catch {}
    finally { setBusy(""); }
  }

  // --- Auth ---
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault(); setBusy("signin"); setAuthMsg(null);
    try { await signIn(email, password); setPassword(""); setAuthMsg({ text: "Connexion réussie.", ok: true }); }
    catch (e) { setAuthMsg({ text: getErrorMessage(e, "Connexion impossible."), ok: false }); }
    finally { setBusy(""); }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault(); setBusy("signup"); setAuthMsg(null);
    try {
      const result = await signUp(email, password, signUpName);
      setPassword("");
      setAuthMsg({ text: result.emailConfirmationRequired ? "Compte créé. Confirme ton email." : "Compte créé et connecté.", ok: true });
    } catch (e) { setAuthMsg({ text: getErrorMessage(e, "Création impossible."), ok: false }); }
    finally { setBusy(""); }
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div className="pb-[calc(17.5rem+env(safe-area-inset-bottom))] sm:pb-28">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 mp3-fade-up">
          <h1 className="text-3xl font-light text-white/95">Compte</h1>
          <p className="mt-2 text-sm text-white/40">Personnalise ton profil public.</p>
        </div>

        {!isConfigured ? (
          <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-100 mp3-fade-up">
            Supabase Auth n&apos;est pas configuré.
          </div>
        ) : loading ? (
          <div className="rounded-3xl border border-white/8 bg-white/3 p-6 text-sm text-white/50 mp3-fade-up">Chargement...</div>
        ) : isAuthenticated ? (
          <div className="space-y-4">

            {/* Hero */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up">
              <div className="flex items-start gap-5">
                <div className="relative shrink-0">
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy === "avatar"}
                    className="group relative h-20 w-20 rounded-2xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    title="Changer la photo"
                  >
                    {avatarUrl ? (
                      <Image src={avatarUrl} alt="Avatar" fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className={`h-full w-full bg-gradient-to-br ${gradient} flex items-center justify-center text-xl font-semibold text-white`}>
                        {initials}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      {busy === "avatar" ? (
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      ) : (
                        <Camera size={16} className="text-white" />
                      )}
                    </div>
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xl font-medium text-white/95 truncate">{primaryLabel || "Compte connecté"}</p>
                  <p className="text-sm text-white/45 truncate mt-0.5">{user?.email ?? ""}</p>
                  {createdAtLabel && <p className="text-xs text-white/25 mt-1">Membre depuis le {createdAtLabel}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {user?.id && (
                    <Link
                      href={getPublicProfileHref(user.id)}
                      target="_blank"
                      className="h-9 px-3 rounded-full border border-white/10 bg-white/5 text-xs text-white/50 hover:bg-white/10 hover:text-white/90 transition flex items-center gap-1.5"
                    >
                      <ExternalLink size={12} />
                      Mon profil
                    </Link>
                  )}
                  <button
                    type="button" onClick={handleSignOut} disabled={busy === "logout"}
                    className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white/50 hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-300 transition disabled:opacity-50 flex items-center justify-center"
                    title="Déconnexion"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            </section>

            {/* Identité */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "50ms" }}>
              <div className="flex items-center gap-2 mb-5">
                <User size={14} className="text-white/30" />
                <h2 className="text-sm font-medium text-white/70">Identité</h2>
              </div>
              <form className="space-y-4" onSubmit={handleProfileUpdate}>
                <InputField id="profile-name" label="Pseudo" value={profileName} onChange={setProfileName} placeholder="Ton pseudo" />
                <div>
                  <label htmlFor="public-bio" className="mb-1.5 block text-xs text-white/45">Bio publique</label>
                  <textarea
                    id="public-bio" value={publicBio} onChange={(e) => setPublicBio(e.target.value)}
                    className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 outline-none focus:border-white/25 transition-colors resize-none placeholder:text-white/25"
                    maxLength={300} placeholder="Quelques mots sur toi..."
                  />
                  <p className="mt-1 text-xs text-white/25 text-right">{publicBio.trim().length}/300</p>
                </div>
                <div className="flex items-center justify-between">
                  <SectionMsg msg={profileMsg} />
                  <div className="ml-auto">
                    <button type="submit" disabled={busy === "profile"}
                      className="h-9 px-5 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                      {busy === "profile" ? "Sauvegarde..." : "Mettre à jour"}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* Personnalisation */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "90ms" }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Palette size={14} className="text-white/30" />
                  <h2 className="text-sm font-medium text-white/70">Personnalisation du profil public</h2>
                </div>
                {user?.id && (
                  <Link href={getPublicProfileHref(user.id)} target="_blank"
                    className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/70 transition">
                    <ExternalLink size={11} />
                    Voir le rendu
                  </Link>
                )}
              </div>

              {/* Live preview */}
              <div className="mb-6 rounded-2xl overflow-hidden border border-white/8" style={{
                background: `radial-gradient(ellipse at 50% 0%, hsla(${activeHue}, 38%, 16%, 0.65) 0%, transparent 75%), #0d0d11`,
              }}>
                <div className="px-5 py-4 flex items-center gap-4">
                  {avatarUrl ? (
                    <div className="relative h-12 w-12 shrink-0 rounded-full overflow-hidden"
                      style={{ boxShadow: `0 0 0 2px hsla(${activeHue}, 50%, 40%, 0.4)` }}>
                      <Image src={avatarUrl} alt="Avatar" fill className="object-cover" sizes="48px" />
                    </div>
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center text-base font-semibold text-white"
                      style={{ background: `linear-gradient(135deg, hsla(${activeHue}, 72%, 58%, 0.95), hsla(${(activeHue + 50) % 360}, 76%, 50%, 0.88))` }}>
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white/95 truncate">{profileName || "Ton pseudo"}</p>
                    {publicBio && (
                      <p className="text-xs text-white/45 truncate mt-0.5">
                        {publicBio.slice(0, 55)}{publicBio.length > 55 ? "…" : ""}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 h-5 w-5 rounded-full"
                    style={{ background: `hsl(${activeHue}, 65%, 55%)` }} />
                </div>
              </div>

              {/* Theme color */}
              <div className="mb-6">
                <p className="text-xs text-white/45 mb-3">Couleur du thème</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setThemeHue(preset.hue)}
                      title={preset.label}
                      className={[
                        "relative h-8 w-8 rounded-full transition ring-offset-2 ring-offset-[#0b0b0f]",
                        preset.color,
                        themeHue === preset.hue ? "ring-2 ring-white/80 scale-110" : "hover:scale-105 opacity-70 hover:opacity-100",
                      ].join(" ")}
                    >
                      {themeHue === preset.hue && (
                        <Check size={12} className="absolute inset-0 m-auto text-white drop-shadow" />
                      )}
                    </button>
                  ))}
                </div>
                {/* Custom hue slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-white/25">Roue des couleurs</p>
                    <div className="flex items-center gap-2">
                      <div className="h-3.5 w-3.5 rounded-full ring-1 ring-white/15 transition-colors"
                        style={{ background: `hsl(${activeHue}, 65%, 55%)` }} />
                      <span className="text-[11px] text-white/25 tabular-nums w-8">
                        {themeHue !== null ? `${themeHue}°` : "auto"}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range" min="0" max="360"
                    value={themeHue ?? fallbackHue}
                    onChange={(e) => setThemeHue(Number(e.target.value))}
                    style={{
                      background: "linear-gradient(to right, hsl(0,60%,55%), hsl(30,60%,55%), hsl(60,60%,55%), hsl(90,60%,55%), hsl(120,60%,55%), hsl(150,60%,55%), hsl(180,60%,55%), hsl(210,60%,55%), hsl(240,60%,55%), hsl(270,60%,55%), hsl(300,60%,55%), hsl(330,60%,55%), hsl(360,60%,55%))",
                    }}
                    className="w-full h-2.5 rounded-full cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer"
                  />
                </div>
              </div>

              {/* Links */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-white/45">Liens publics</p>
                  <button
                    type="button"
                    onClick={() => setAddingLink((v) => !v)}
                    className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition"
                  >
                    <Plus size={12} />
                    Ajouter
                  </button>
                </div>

                {addingLink && (
                  <div className="mb-3 rounded-2xl border border-white/10 bg-white/3 p-4 space-y-3 mp3-fade-up">
                    <InputField id="link-label" label="Titre du lien" value={newLinkLabel} onChange={setNewLinkLabel} placeholder="ex. Mon Instagram" />
                    <InputField id="link-url" label="URL" value={newLinkUrl} onChange={setNewLinkUrl} placeholder="ex. instagram.com/moi" />
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={addLink}
                        disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
                        className="h-8 px-4 rounded-full bg-white text-black text-xs font-medium hover:opacity-90 transition disabled:opacity-40">
                        Ajouter
                      </button>
                      <button type="button" onClick={() => { setAddingLink(false); setNewLinkLabel(""); setNewLinkUrl(""); }}
                        className="h-8 px-3 rounded-full border border-white/10 text-xs text-white/50 hover:text-white transition">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {links.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center">
                    <Link2 size={18} className="mx-auto mb-2 text-white/15" />
                    <p className="text-xs text-white/30">Aucun lien pour l&apos;instant.</p>
                    <p className="text-xs text-white/20 mt-0.5">Ajoute des liens vers tes réseaux, ton site…</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {links.map((link, idx) => {
                      const platform = detectPlatform(link.url);
                      return (
                      <div key={link.id} className="group flex items-center gap-2 rounded-2xl border border-white/8 bg-white/3 px-3 py-2.5">
                        <Link2 size={13} className="text-white/25 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-white/85 truncate">{link.label}</p>
                            {platform && (
                              <span className="text-[10px] text-white/30 bg-white/8 px-1.5 py-0.5 rounded-full shrink-0">{platform}</span>
                            )}
                          </div>
                          <p className="text-xs text-white/35 truncate">{link.url}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => moveLink(link.id, -1)} disabled={idx === 0}
                            className="h-6 w-6 rounded-lg flex items-center justify-center text-white/25 hover:text-white/70 disabled:opacity-20 transition">
                            <ArrowUp size={11} />
                          </button>
                          <button type="button" onClick={() => moveLink(link.id, 1)} disabled={idx === links.length - 1}
                            className="h-6 w-6 rounded-lg flex items-center justify-center text-white/25 hover:text-white/70 disabled:opacity-20 transition">
                            <ArrowDown size={11} />
                          </button>
                          <button type="button" onClick={() => removeLink(link.id)}
                            className="h-6 w-6 rounded-lg flex items-center justify-center text-white/25 hover:text-red-400 transition">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pinned tracks */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-white/45">Sons mis en avant <span className="text-white/25">(max 6)</span></p>
                  {pinnedSrcs.size > 0 && (
                    <button type="button" onClick={() => setPinnedSrcs(new Set())}
                      className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition">
                      <X size={11} />
                      Effacer
                    </button>
                  )}
                </div>

                {profileLoading ? (
                  <div className="space-y-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-11 rounded-2xl bg-white/5 animate-pulse" />
                    ))}
                  </div>
                ) : uploads.length === 0 ? (
                  <p className="text-xs text-white/25 py-3">Aucun upload disponible.</p>
                ) : (
                  <div className="space-y-1">
                    {uploads.map((track) => {
                      const pinned = pinnedSrcs.has(track.src);
                      return (
                        <button
                          key={track.src}
                          type="button"
                          onClick={() => togglePin(track.src)}
                          disabled={!pinned && pinnedSrcs.size >= 6}
                          className={[
                            "w-full flex items-center gap-3 rounded-2xl px-3 py-2 transition text-left",
                            pinned ? "bg-white/10 border border-white/15" : "border border-transparent hover:bg-white/5 disabled:opacity-30",
                          ].join(" ")}
                        >
                          <div className="relative h-8 w-8 shrink-0 rounded-xl overflow-hidden bg-white/5">
                            {track.cover ? (
                              <Image src={track.cover} alt={track.title} fill className="object-cover" sizes="32px" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <Music size={10} className="text-white/20" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-white/80 truncate">{track.title}</p>
                            <p className="text-[11px] text-white/35 truncate">{track.artist}</p>
                          </div>
                          <div className={["h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition",
                            pinned ? "bg-white border-white" : "border-white/20"].join(" ")}>
                            {pinned && <Check size={10} className="text-black" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Save personalisation */}
              <div className="flex items-center justify-between pt-2 border-t border-white/6">
                <SectionMsg msg={linksMsg} />
                <div className="ml-auto">
                  <button type="button" onClick={saveLinks} disabled={busy === "links"}
                    className="h-9 px-5 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                    {busy === "links" ? "Sauvegarde..." : "Sauvegarder"}
                  </button>
                </div>
              </div>
            </section>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-3 mp3-fade-up" style={{ animationDelay: "130ms" }}>
              {[
                { icon: <Upload size={13} className="text-white/30" />, label: "Uploads", value: totalUploads },
                { icon: <Heart size={13} className="text-white/30" />, label: "Favoris", value: favoriteCount },
                { icon: <Link2 size={13} className="text-white/30" />, label: "Liens", value: links.length },
                { icon: <UserPlus size={13} className="text-white/30" />, label: "Abonnés", value: followersCount },
                { icon: <UserCheck size={13} className="text-white/30" />, label: "Abonnements", value: followingCount },
              ].map(({ icon, label, value }) => (
                <div key={label} className="rounded-3xl border border-white/8 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-1.5 mb-2">{icon}<p className="text-xs text-white/40">{label}</p></div>
                  <p className="text-2xl font-light text-white/90 tabular-nums">{profileLoading ? "—" : value}</p>
                </div>
              ))}
            </div>

            {/* Mes favoris */}
            {(profileLoading || favoriteTracks.length > 0) && (
              <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "160ms" }}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Heart size={14} className="text-white/30" />
                    <h2 className="text-sm font-medium text-white/70">Mes favoris</h2>
                    {favoriteCount > 0 && <span className="text-xs text-white/25">{favoriteCount}</span>}
                  </div>
                  {favoriteTracks.length > 0 && (
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setQueueAndPlay(favoritesForPlayer, 0)}
                        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/80 transition">
                        <Play size={11} className="fill-current" />
                        Tout écouter
                      </button>
                      <Link href="/favorites" className="text-xs text-white/35 hover:text-white/70 transition">Voir tout →</Link>
                    </div>
                  )}
                </div>
                {profileLoading ? (
                  <div className="space-y-1">{[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-white/5 animate-pulse" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-2/3 rounded-full bg-white/5 animate-pulse" />
                        <div className="h-2.5 w-1/3 rounded-full bg-white/4 animate-pulse" />
                      </div>
                    </div>
                  ))}</div>
                ) : (
                  <div className="space-y-0.5">
                    {favoriteTracks.slice(0, 6).map((item, index) => (
                      <div key={item.src}
                        className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/5 transition cursor-pointer"
                        onClick={() => setQueueAndPlay(favoritesForPlayer, index)}
                      >
                        <div className="relative h-9 w-9 shrink-0 rounded-xl overflow-hidden bg-white/5">
                          {item.cover ? (
                            <Image src={item.cover} alt={item.title} fill className="object-cover" sizes="36px" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center"><Heart size={11} className="text-white/20" /></div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                            <Play size={11} className="fill-white text-white ml-0.5" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white/85 truncate">{item.title}</p>
                          <p className="text-xs text-white/40 truncate">{item.artist}</p>
                        </div>
                      </div>
                    ))}
                    {favoriteCount > 6 && (
                      <div className="pt-2 text-center">
                        <Link href="/favorites" className="text-xs text-white/30 hover:text-white/60 transition">
                          +{favoriteCount - 6} autres · Voir tout
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Mes uploads */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "200ms" }}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Upload size={14} className="text-white/30" />
                  <h2 className="text-sm font-medium text-white/70">Mes uploads</h2>
                  {totalUploads > 0 && <span className="text-xs text-white/25 tabular-nums">{totalUploads}</span>}
                </div>
                <div className="flex items-center gap-3">
                  {uploads.length > 0 && (
                    <button type="button" onClick={() => setQueueAndPlay(uploadsForPlayer, 0)}
                      className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/80 transition">
                      <Play size={11} className="fill-current" />
                      Tout écouter
                    </button>
                  )}
                  <Link href="/library" className="text-xs text-white/35 hover:text-white/70 transition">Bibliothèque →</Link>
                </div>
              </div>
              {profileLoading ? (
                <div className="space-y-1">{[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="h-9 w-9 shrink-0 rounded-xl bg-white/5 animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-2/3 rounded-full bg-white/5 animate-pulse" />
                      <div className="h-2.5 w-1/3 rounded-full bg-white/4 animate-pulse" />
                    </div>
                  </div>
                ))}</div>
              ) : uploads.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-white/3 px-4 py-7 text-center">
                  <Upload size={24} className="mx-auto mb-2.5 text-white/15" />
                  <p className="text-sm text-white/40 mb-3">Aucun upload pour l&apos;instant</p>
                  <Link href="/upload" className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-white/8 border border-white/10 text-xs text-white/60 hover:bg-white/12 transition">
                    <Upload size={11} />
                    Ajouter un son
                  </Link>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {uploads.slice(0, 8).map((item, index) => (
                    <div key={item.src}
                      className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/5 transition cursor-pointer"
                      onClick={() => setQueueAndPlay(uploadsForPlayer, index)}
                    >
                      <div className="relative h-9 w-9 shrink-0 rounded-xl overflow-hidden bg-white/5">
                        {item.cover ? (
                          <Image src={item.cover} alt={item.title} fill className="object-cover" sizes="36px" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center"><Music size={12} className="text-white/20" /></div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                          <Play size={12} className="fill-white text-white ml-0.5" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white/85 truncate">{item.title}</p>
                        <p className="text-xs text-white/40 truncate">{item.artist}</p>
                      </div>
                      {item.createdAt && (
                        <p className="text-xs text-white/20 shrink-0 tabular-nums group-hover:text-white/35 transition">
                          {formatDate(item.createdAt)}
                        </p>
                      )}
                    </div>
                  ))}
                  {totalUploads > 8 && (
                    <div className="pt-2 text-center">
                      <Link href="/library" className="text-xs text-white/30 hover:text-white/60 transition">
                        +{totalUploads - 8} autres · Voir tout
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Sécurité */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "240ms" }}>
              <div className="flex items-center gap-2 mb-5">
                <Shield size={14} className="text-white/30" />
                <h2 className="text-sm font-medium text-white/70">Sécurité</h2>
              </div>
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/6 bg-white/3 px-4 py-2.5">
                <p className="text-xs text-white/35">Email</p>
                <p className="text-sm text-white/60 flex-1 truncate">{user?.email ?? ""}</p>
              </div>
              <form className="space-y-4" onSubmit={handlePasswordUpdate}>
                <InputField id="new-password" label="Nouveau mot de passe" type="password" value={newPassword} onChange={setNewPassword} placeholder="Au moins 6 caractères" />
                <div className="flex items-center justify-between">
                  <SectionMsg msg={passwordMsg} />
                  <div className="ml-auto">
                    <button type="submit" disabled={busy === "password"}
                      className="h-9 px-5 rounded-full bg-white/10 border border-white/10 text-white text-sm hover:bg-white/15 transition disabled:opacity-50 flex items-center gap-2">
                      <KeyRound size={13} />
                      {busy === "password" ? "Mise à jour..." : "Changer le mot de passe"}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          </div>

        ) : (
          <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up">
            <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-2xl">
              {(["signin", "signup"] as const).map((m) => (
                <button key={m} type="button" onClick={() => { setMode(m); setAuthMsg(null); }}
                  className={["flex-1 h-9 rounded-xl text-sm font-medium transition", mode === m ? "bg-white text-black" : "text-white/60 hover:text-white"].join(" ")}>
                  {m === "signin" ? "Connexion" : "Créer un compte"}
                </button>
              ))}
            </div>
            {mode === "signin" ? (
              <form className="space-y-4" onSubmit={handleSignIn}>
                <InputField id="account-email" label="Email" type="email" value={email} onChange={setEmail} placeholder="toi@email.com" required />
                <InputField id="account-password" label="Mot de passe" type="password" value={password} onChange={setPassword} placeholder="Mot de passe" required />
                {authMsg && <p className={["text-xs", authMsg.ok ? "text-green-400/90" : "text-red-400/90"].join(" ")}>{authMsg.text}</p>}
                <button type="submit" disabled={busy === "signin"}
                  className="w-full h-10 rounded-2xl bg-white text-black text-sm font-semibold hover:opacity-90 transition disabled:opacity-60">
                  {busy === "signin" ? "Connexion..." : "Se connecter"}
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleSignUp}>
                <InputField id="signup-name" label="Pseudo" value={signUpName} onChange={setSignUpName} placeholder="Ton pseudo" />
                <InputField id="signup-email" label="Email" type="email" value={email} onChange={setEmail} placeholder="toi@email.com" required />
                <InputField id="signup-password" label="Mot de passe" type="password" value={password} onChange={setPassword} placeholder="Au moins 6 caractères" required />
                {authMsg && <p className={["text-xs", authMsg.ok ? "text-green-400/90" : "text-red-400/90"].join(" ")}>{authMsg.text}</p>}
                <button type="submit" disabled={busy === "signup"}
                  className="w-full h-10 rounded-2xl bg-white text-black text-sm font-semibold hover:opacity-90 transition disabled:opacity-60">
                  {busy === "signup" ? "Création..." : "Créer le compte"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {pendingAvatarFile && (
        <AvatarCropper
          file={pendingAvatarFile}
          onCancel={() => setPendingAvatarFile(null)}
          onCropped={(blob) => {
            setPendingAvatarFile(null);
            void uploadAvatarBlob(blob);
          }}
        />
      )}
    </div>
  );
}
