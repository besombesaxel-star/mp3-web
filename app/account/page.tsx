"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, KeyRound, LogOut, Music, Play, Shield, Upload, User } from "lucide-react";
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
  favoriteSrcs?: string[];
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
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/90 outline-none focus:border-white/25 focus:bg-white/8 transition-colors placeholder:text-white/25"
      />
    </div>
  );
}

export default function AccountPage() {
  const {
    accessToken, displayName, isAuthenticated, isConfigured, loading,
    primaryLabel, signIn, signOut, signUp, updateDisplayName, updatePassword, user,
  } = useAuth();
  const { setQueueAndPlay } = usePlayer();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [profileName, setProfileName] = useState(displayName);
  const [newPassword, setNewPassword] = useState("");
  const [publicBio, setPublicBio] = useState("");
  const [busy, setBusy] = useState<"" | "signin" | "signup" | "profile" | "password" | "logout">("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [profileLoading, setProfileLoading] = useState(false);
  const [uploads, setUploads] = useState<AccountTrack[]>([]);

  const createdAtLabel = useMemo(() => {
    if (!user?.created_at) return "";
    const value = new Date(user.created_at);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleDateString("fr-FR");
  }, [user?.created_at]);

  const uploadsForPlayer = useMemo(
    () => uploads.map((item) => ({
      artist: item.artist, cover: item.cover ?? undefined,
      ownerDisplayName: item.ownerDisplayName ?? undefined,
      ownerId: item.ownerId ?? undefined, src: item.src, title: item.title,
    })),
    [uploads]
  );

  const initials = useMemo(() => {
    const name = primaryLabel || user?.email || "";
    return name.slice(0, 2).toUpperCase();
  }, [primaryLabel, user?.email]);

  useEffect(() => { setProfileName(displayName); }, [displayName]);

  useEffect(() => {
    let cancelled = false;
    async function loadAccountData() {
      if (!accessToken) return;
      try {
        setProfileLoading(true);
        const res = await fetch("/api/account", { cache: "no-store", headers: createAuthorizedHeaders(accessToken) });
        if (!res.ok) throw new Error(`Impossible de charger le profil (${res.status})`);
        const json = (await res.json()) as AccountResponse;
        if (cancelled) return;
        setFavoriteCount(Array.isArray(json.favoriteSrcs) ? json.favoriteSrcs.length : 0);
        setPublicBio(typeof json.publicBio === "string" ? json.publicBio : "");
        setUploads(Array.isArray(json.uploads) ? json.uploads : []);
      } catch {
        if (cancelled) return;
        setFavoriteCount(0); setPublicBio(""); setUploads([]);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    if (!isAuthenticated || !accessToken) {
      setFavoriteCount(0); setPublicBio(""); setUploads([]); setProfileLoading(false); return;
    }
    void loadAccountData();
    return () => { cancelled = true; };
  }, [accessToken, isAuthenticated]);

  function ok(text: string) { setMessage({ text, ok: true }); }
  function err(text: string) { setMessage({ text, ok: false }); }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault(); setBusy("signin"); setMessage(null);
    try { await signIn(email, password); setPassword(""); ok("Connexion réussie."); }
    catch (e) { err(getErrorMessage(e, "Connexion impossible.")); }
    finally { setBusy(""); }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault(); setBusy("signup"); setMessage(null);
    try {
      const result = await signUp(email, password, signUpName);
      setPassword("");
      ok(result.emailConfirmationRequired ? "Compte créé. Confirme ton email pour te connecter." : "Compte créé et connecté.");
    } catch (e) { err(getErrorMessage(e, "Création du compte impossible.")); }
    finally { setBusy(""); }
  }

  async function handleProfileUpdate(e: React.FormEvent) {
    e.preventDefault(); setBusy("profile"); setMessage(null);
    try {
      await updateDisplayName(profileName);
      if (accessToken) {
        const res = await fetch("/api/account", {
          method: "PUT",
          headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({ publicBio }),
        });
        if (!res.ok) throw new Error(`Impossible de sauvegarder la bio (${res.status})`);
      }
      ok("Profil mis à jour.");
    } catch (e) { err(getErrorMessage(e, "Mise à jour impossible.")); }
    finally { setBusy(""); }
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.trim().length < 6) { err("Le mot de passe doit contenir au moins 6 caractères."); return; }
    setBusy("password"); setMessage(null);
    try { await updatePassword(newPassword.trim()); setNewPassword(""); ok("Mot de passe mis à jour."); }
    catch (e) { err(getErrorMessage(e, "Mise à jour du mot de passe impossible.")); }
    finally { setBusy(""); }
  }

  async function handleSignOut() {
    setBusy("logout"); setMessage(null);
    try { await signOut(); ok("Déconnexion effectuée."); }
    catch (e) { err(getErrorMessage(e, "Déconnexion impossible.")); }
    finally { setBusy(""); }
  }

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="mb-8 mp3-fade-up">
          <h1 className="text-3xl font-light text-white/95">Compte</h1>
          <p className="mt-2 text-sm text-white/40">Gère ton profil, tes uploads et ta sécurité.</p>
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

            {/* Profile hero */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 shrink-0 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-lg font-semibold text-white/80">
                  {initials}
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
                      className="h-9 w-9 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition"
                      title="Voir mon profil public"
                    >
                      <ExternalLink size={14} />
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={busy === "logout"}
                    className="h-9 px-4 rounded-full border border-white/10 bg-white/5 text-sm text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-50 flex items-center gap-2"
                  >
                    <LogOut size={13} />
                    {busy === "logout" ? "..." : "Déconnexion"}
                  </button>
                </div>
              </div>
            </section>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mp3-fade-up" style={{ animationDelay: "60ms" }}>
              <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Upload size={13} className="text-white/30" />
                  <p className="text-xs text-white/40">Mes uploads</p>
                </div>
                <p className="text-3xl font-light text-white/90 tabular-nums">{profileLoading ? "—" : uploads.length}</p>
                <p className="text-xs text-white/30 mt-1.5">Sons rattachés à ce compte</p>
              </div>
              <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Music size={13} className="text-white/30" />
                  <p className="text-xs text-white/40">Favoris sync</p>
                </div>
                <p className="text-3xl font-light text-white/90 tabular-nums">{profileLoading ? "—" : favoriteCount}</p>
                <p className="text-xs text-white/30 mt-1.5">Synchronisés entre tes sessions</p>
              </div>
            </div>

            {/* Profile form */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "120ms" }}>
              <div className="flex items-center gap-2 mb-5">
                <User size={14} className="text-white/30" />
                <h2 className="text-sm font-medium text-white/70">Profil public</h2>
              </div>
              <form className="space-y-4" onSubmit={handleProfileUpdate}>
                <InputField id="profile-name" label="Nom affiché" value={profileName} onChange={setProfileName} placeholder="Ton pseudo" />
                <div>
                  <label htmlFor="public-bio" className="mb-1.5 block text-xs text-white/45">Bio publique</label>
                  <textarea
                    id="public-bio"
                    value={publicBio}
                    onChange={(e) => setPublicBio(e.target.value)}
                    className="min-h-[90px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 outline-none focus:border-white/25 focus:bg-white/8 transition-colors resize-y placeholder:text-white/25"
                    maxLength={220}
                    placeholder="Quelques mots sur toi..."
                  />
                  <p className="mt-1.5 text-xs text-white/25 text-right">{publicBio.trim().length}/220</p>
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={busy === "profile"}
                    className="h-9 px-5 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                    {busy === "profile" ? "Sauvegarde..." : "Mettre à jour"}
                  </button>
                </div>
              </form>
            </section>

            {/* Password */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "160ms" }}>
              <div className="flex items-center gap-2 mb-5">
                <Shield size={14} className="text-white/30" />
                <h2 className="text-sm font-medium text-white/70">Sécurité</h2>
              </div>
              <form className="space-y-4" onSubmit={handlePasswordUpdate}>
                <InputField id="new-password" label="Nouveau mot de passe" type="password" value={newPassword} onChange={setNewPassword} placeholder="Au moins 6 caractères" />
                <div className="flex justify-end">
                  <button type="submit" disabled={busy === "password"}
                    className="h-9 px-5 rounded-full bg-white/10 border border-white/10 text-white text-sm hover:bg-white/15 transition disabled:opacity-50 flex items-center gap-2">
                    <KeyRound size={13} />
                    {busy === "password" ? "Mise à jour..." : "Changer le mot de passe"}
                  </button>
                </div>
              </form>
            </section>

            {/* Uploads */}
            <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up" style={{ animationDelay: "200ms" }}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Upload size={14} className="text-white/30" />
                  <h2 className="text-sm font-medium text-white/70">Mes derniers uploads</h2>
                </div>
                <Link href="/library" className="text-xs text-white/35 hover:text-white/70 transition">
                  Gérer dans la bibliothèque →
                </Link>
              </div>

              {uploads.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-white/3 px-4 py-5 text-center">
                  <Upload size={24} className="mx-auto mb-2 text-white/15" />
                  <p className="text-sm text-white/40">Aucun upload pour l&apos;instant</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {uploads.slice(0, 8).map((item, index) => (
                    <div key={item.src}
                      className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/5 transition">
                      <div className="h-9 w-9 shrink-0 rounded-xl overflow-hidden bg-white/5 relative">
                        {item.cover ? (
                          <Image src={item.cover} alt={item.title} fill className="object-cover" sizes="36px" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <Music size={12} className="text-white/20" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white/85 truncate">{item.title}</p>
                        <p className="text-xs text-white/40 truncate">{item.artist}</p>
                      </div>
                      <button type="button" onClick={() => setQueueAndPlay(uploadsForPlayer, index)}
                        className="h-7 w-7 rounded-full bg-white/0 group-hover:bg-white/10 flex items-center justify-center transition opacity-0 group-hover:opacity-100">
                        <Play size={11} className="fill-white text-white ml-0.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

        ) : (
          /* Login / Signup */
          <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-6 mp3-fade-up">
            <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-2xl">
              {(["signin", "signup"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={["flex-1 h-9 rounded-xl text-sm font-medium transition", mode === m ? "bg-white text-black" : "text-white/60 hover:text-white"].join(" ")}>
                  {m === "signin" ? "Connexion" : "Créer un compte"}
                </button>
              ))}
            </div>

            {mode === "signin" ? (
              <form className="space-y-4" onSubmit={handleSignIn}>
                <InputField id="account-email" label="Email" type="email" value={email} onChange={setEmail} placeholder="toi@email.com" required />
                <InputField id="account-password" label="Mot de passe" type="password" value={password} onChange={setPassword} placeholder="Mot de passe" required />
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
                <button type="submit" disabled={busy === "signup"}
                  className="w-full h-10 rounded-2xl bg-white text-black text-sm font-semibold hover:opacity-90 transition disabled:opacity-60">
                  {busy === "signup" ? "Création..." : "Créer le compte"}
                </button>
              </form>
            )}
          </div>
        )}

        {message && (
          <div className={["mt-4 rounded-2xl border px-4 py-3 text-sm mp3-fade-up", message.ok ? "border-green-500/20 bg-green-500/10 text-green-300" : "border-red-400/20 bg-red-400/10 text-red-300"].join(" ")} aria-live="polite">
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
