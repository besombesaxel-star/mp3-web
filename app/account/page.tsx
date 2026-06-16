"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ExternalLink, Heart, KeyRound, LogOut, Music, Play, Shield, Upload, User } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { usePlayer } from "@/app/PlayerContext";
import { getPublicProfileHref } from "@/lib/publicLinks";

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
  publicBio?: string;
  uploads?: AccountTrack[];
  uploadsCount?: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/25 focus:bg-white/8 transition-colors placeholder:text-white/25"
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
  "from-violet-500 to-indigo-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-orange-500 to-amber-400",
  "from-pink-500 to-rose-400",
  "from-fuchsia-500 to-purple-500",
];
function avatarGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function formatUploadDate(ts?: number): string {
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
  const [busy, setBusy] = useState<"" | "signin" | "signup" | "profile" | "password" | "logout" | "avatar">("");
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [authMsg, setAuthMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [favoriteTracks, setFavoriteTracks] = useState<AccountTrack[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [uploads, setUploads] = useState<AccountTrack[]>([]);
  const [totalUploads, setTotalUploads] = useState(0);

  const createdAtLabel = useMemo(() => {
    if (!user?.created_at) return "";
    const d = new Date(user.created_at);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }, [user?.created_at]);

  const uploadsForPlayer = useMemo(
    () => uploads.map((item) => ({
      artist: item.artist, cover: item.cover ?? undefined,
      ownerDisplayName: item.ownerDisplayName ?? undefined,
      ownerId: item.ownerId ?? undefined, src: item.src, title: item.title,
    })),
    [uploads]
  );

  const favoritesForPlayer = useMemo(
    () => favoriteTracks.map((item) => ({
      artist: item.artist, cover: item.cover ?? undefined, src: item.src, title: item.title,
    })),
    [favoriteTracks]
  );

  const initials = useMemo(() => {
    const name = primaryLabel || user?.email || "";
    return name.slice(0, 2).toUpperCase();
  }, [primaryLabel, user?.email]);

  const gradient = useMemo(() => avatarGradient(primaryLabel || user?.email || ""), [primaryLabel, user?.email]);

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
        setAvatarUrl(typeof json.avatarUrl === "string" ? json.avatarUrl : "");
        setFavoriteCount(Array.isArray(json.favoriteSrcs) ? json.favoriteSrcs.length : 0);
        setFavoriteTracks(Array.isArray(json.favoriteTracks) ? json.favoriteTracks : []);
        setPublicBio(typeof json.publicBio === "string" ? json.publicBio : "");
        const uploadList = Array.isArray(json.uploads) ? json.uploads : [];
        setUploads(uploadList);
        setTotalUploads(typeof json.uploadsCount === "number" ? json.uploadsCount : uploadList.length);
      } catch {
        if (!cancelled) { setAvatarUrl(""); setFavoriteCount(0); setFavoriteTracks([]); setPublicBio(""); setUploads([]); setTotalUploads(0); }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    if (!isAuthenticated || !accessToken) {
      setAvatarUrl(""); setFavoriteCount(0); setFavoriteTracks([]); setPublicBio(""); setUploads([]); setTotalUploads(0); setProfileLoading(false);
      return;
    }
    void load();
    return () => { cancelled = true; };
  }, [accessToken, isAuthenticated]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    e.target.value = "";
    setBusy("avatar");
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken),
        body: form,
      });
      const json = await res.json() as { ok?: boolean; avatarUrl?: string; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Upload impossible.");
      setAvatarUrl(json.avatarUrl ?? "");
    } catch (err) {
      setProfileMsg({ text: getErrorMessage(err, "Erreur lors de l'upload de la photo."), ok: false });
    } finally {
      setBusy("");
    }
  }

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
      setAuthMsg({ text: result.emailConfirmationRequired ? "Compte créé. Confirme ton email pour te connecter." : "Compte créé et connecté.", ok: true });
    } catch (e) { setAuthMsg({ text: getErrorMessage(e, "Création du compte impossible."), ok: false }); }
    finally { setBusy(""); }
  }

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

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-2xl">

        <div className="mb-8 mp3-fade-up">
          <h1 className="text-3xl font-light text-white/95">Compte</h1>
          <p className="mt-2 text-sm text-white/40">Ton profil, tes uploads et ta sécurité.</p>
        </div>

        {!isConfigured ? (
          <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-100 mp3-fade-up">
            Supabase Auth n&apos;est pas configuré. Ajoute <code className="text-white/80">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
            <code className="text-white/80">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> dans l&apos;environnement.
          </div>
        ) : loading ? (
          <div className="rounded-3xl border border-white/8 bg-white/3 p-6 text-sm text-white/50 mp3-fade-up">Chargement...</div>
        ) : isAuthenticated ? (
          <div className="space-y-4">

            {/* Hero */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up">
              <div className="flex items-start gap-5">

                {/* Avatar with upload */}
                <div className="relative shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy === "avatar"}
                    className="group relative h-20 w-20 rounded-2xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    title="Changer la photo de profil"
                  >
                    {avatarUrl ? (
                      <Image src={avatarUrl} alt="Avatar" fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className={`h-full w-full bg-gradient-to-br ${gradient} flex items-center justify-center text-xl font-semibold text-white`}>
                        {initials}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
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
                  <p className="text-xs text-white/20 mt-1">Clique sur la photo pour la changer</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {user?.id && (
                    <Link
                      href={getPublicProfileHref(user.id)}
                      className="h-9 w-9 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white/90 transition"
                      title="Voir mon profil public"
                    >
                      <ExternalLink size={14} />
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={busy === "logout"}
                    className="h-9 px-4 rounded-full border border-white/10 bg-white/5 text-sm text-white/50 hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-300 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    <LogOut size={13} />
                    {busy === "logout" ? "..." : "Déconnexion"}
                  </button>
                </div>
              </div>
            </section>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mp3-fade-up" style={{ animationDelay: "50ms" }}>
              <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Upload size={13} className="text-white/30" />
                  <p className="text-xs text-white/40">Uploads</p>
                </div>
                <p className="text-3xl font-light text-white/90 tabular-nums">{profileLoading ? "—" : totalUploads}</p>
                <p className="text-xs text-white/30 mt-1.5">Sons ajoutés</p>
              </div>
              <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Heart size={13} className="text-white/30" />
                  <p className="text-xs text-white/40">Favoris</p>
                </div>
                <p className="text-3xl font-light text-white/90 tabular-nums">{profileLoading ? "—" : favoriteCount}</p>
                <p className="text-xs text-white/30 mt-1.5">Synchronisés</p>
              </div>
              <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <User size={13} className="text-white/30" />
                  <p className="text-xs text-white/40">Membre</p>
                </div>
                <p className="text-2xl font-light text-white/90 tabular-nums leading-tight">
                  {profileLoading ? "—" : createdAtLabel ? new Date(user?.created_at ?? "").getFullYear() : "—"}
                </p>
                <p className="text-xs text-white/30 mt-1.5">Depuis</p>
              </div>
            </div>

            {/* Profile form */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "100ms" }}>
              <div className="flex items-center gap-2 mb-5">
                <User size={14} className="text-white/30" />
                <h2 className="text-sm font-medium text-white/70">Profil public</h2>
              </div>
              <form className="space-y-4" onSubmit={handleProfileUpdate}>
                <InputField id="profile-name" label="Pseudo" value={profileName} onChange={setProfileName} placeholder="Ton pseudo" />
                <div>
                  <label htmlFor="public-bio" className="mb-1.5 block text-xs text-white/45">Bio publique</label>
                  <textarea
                    id="public-bio" value={publicBio} onChange={(e) => setPublicBio(e.target.value)}
                    className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 outline-none focus:border-white/25 focus:bg-white/8 transition-colors resize-none placeholder:text-white/25"
                    maxLength={220} placeholder="Quelques mots sur toi..."
                  />
                  <p className="mt-1 text-xs text-white/25 text-right">{publicBio.trim().length}/220</p>
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

            {/* Favorites */}
            {(profileLoading || favoriteTracks.length > 0) && (
              <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "140ms" }}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Heart size={14} className="text-white/30" />
                    <h2 className="text-sm font-medium text-white/70">Mes favoris</h2>
                    {favoriteCount > 0 && <span className="text-xs text-white/25">{favoriteCount}</span>}
                  </div>
                  {favoriteTracks.length > 0 && (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setQueueAndPlay(favoritesForPlayer, 0)}
                        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/80 transition"
                      >
                        <Play size={11} className="fill-current" />
                        Tout écouter
                      </button>
                      <Link href="/favorites" className="text-xs text-white/35 hover:text-white/70 transition">
                        Voir tout →
                      </Link>
                    </div>
                  )}
                </div>

                {profileLoading ? (
                  <div className="space-y-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="h-9 w-9 shrink-0 rounded-xl bg-white/5 animate-pulse" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-2/3 rounded-full bg-white/5 animate-pulse" />
                          <div className="h-2.5 w-1/3 rounded-full bg-white/4 animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
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
                            <div className="h-full w-full flex items-center justify-center">
                              <Heart size={11} className="text-white/20" />
                            </div>
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

            {/* Uploads */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "180ms" }}>
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
                  <Link href="/library" className="text-xs text-white/35 hover:text-white/70 transition">
                    Bibliothèque →
                  </Link>
                </div>
              </div>

              {profileLoading ? (
                <div className="space-y-1">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-white/5 animate-pulse" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-2/3 rounded-full bg-white/5 animate-pulse" />
                        <div className="h-2.5 w-1/3 rounded-full bg-white/4 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : uploads.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-white/3 px-4 py-7 text-center">
                  <Upload size={24} className="mx-auto mb-2.5 text-white/15" />
                  <p className="text-sm text-white/40 mb-3">Aucun upload pour l&apos;instant</p>
                  <Link href="/upload" className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-white/8 border border-white/10 text-xs text-white/60 hover:bg-white/12 hover:text-white/90 transition">
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
                          <div className="h-full w-full flex items-center justify-center">
                            <Music size={12} className="text-white/20" />
                          </div>
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
                          {formatUploadDate(item.createdAt)}
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

            {/* Security */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "220ms" }}>
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
    </div>
  );
}
