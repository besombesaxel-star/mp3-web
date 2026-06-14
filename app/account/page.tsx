"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

export default function AccountPage() {
  const {
    accessToken,
    displayName,
    isAuthenticated,
    isConfigured,
    loading,
    primaryLabel,
    signIn,
    signOut,
    signUp,
    updateDisplayName,
    updatePassword,
    user,
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
  const [message, setMessage] = useState("");
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
    () =>
      uploads.map((item) => ({
        artist: item.artist,
        cover: item.cover ?? undefined,
        ownerDisplayName: item.ownerDisplayName ?? undefined,
        ownerId: item.ownerId ?? undefined,
        src: item.src,
        title: item.title,
      })),
    [uploads]
  );

  useEffect(() => {
    setProfileName(displayName);
  }, [displayName]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccountData() {
      if (!accessToken) return;

      try {
        setProfileLoading(true);
        const res = await fetch("/api/account", {
          cache: "no-store",
          headers: createAuthorizedHeaders(accessToken),
        });
        if (!res.ok) {
          throw new Error(`Impossible de charger le profil (${res.status})`);
        }

        const json = (await res.json()) as AccountResponse;
        if (cancelled) return;

        setFavoriteCount(Array.isArray(json.favoriteSrcs) ? json.favoriteSrcs.length : 0);
        setPublicBio(typeof json.publicBio === "string" ? json.publicBio : "");
        setUploads(Array.isArray(json.uploads) ? json.uploads : []);
      } catch {
        if (cancelled) return;
        setFavoriteCount(0);
        setPublicBio("");
        setUploads([]);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }

    if (!isAuthenticated || !accessToken) {
      setFavoriteCount(0);
      setPublicBio("");
      setUploads([]);
      setProfileLoading(false);
      return;
    }

    void loadAccountData();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isAuthenticated]);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("signin");
    setMessage("");

    try {
      await signIn(email, password);
      setPassword("");
      setMessage("Connexion reussie.");
    } catch (errorValue: unknown) {
      setMessage(getErrorMessage(errorValue, "Connexion impossible."));
    } finally {
      setBusy("");
    }
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("signup");
    setMessage("");

    try {
      const result = await signUp(email, password, signUpName);
      setPassword("");
      if (result.emailConfirmationRequired) {
        setMessage("Compte cree. Confirme ton email pour finaliser la connexion.");
      } else {
        setMessage("Compte cree et connecte.");
      }
    } catch (errorValue: unknown) {
      setMessage(getErrorMessage(errorValue, "Creation du compte impossible."));
    } finally {
      setBusy("");
    }
  }

  async function handleProfileUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("profile");
    setMessage("");

    try {
      await updateDisplayName(profileName);
      if (accessToken) {
        const res = await fetch("/api/account", {
          method: "PUT",
          headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({ publicBio }),
        });

        if (!res.ok) {
          throw new Error(`Impossible de sauvegarder la bio publique (${res.status})`);
        }
      }

      setMessage("Profil public mis a jour.");
    } catch (errorValue: unknown) {
      setMessage(getErrorMessage(errorValue, "Mise a jour du profil impossible."));
    } finally {
      setBusy("");
    }
  }

  async function handlePasswordUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword.trim().length < 6) {
      setMessage("Le mot de passe doit contenir au moins 6 caracteres.");
      return;
    }

    setBusy("password");
    setMessage("");

    try {
      await updatePassword(newPassword.trim());
      setNewPassword("");
      setMessage("Mot de passe mis a jour.");
    } catch (errorValue: unknown) {
      setMessage(getErrorMessage(errorValue, "Mise a jour du mot de passe impossible."));
    } finally {
      setBusy("");
    }
  }

  async function handleSignOut() {
    setBusy("logout");
    setMessage("");

    try {
      await signOut();
      setMessage("Deconnexion effectuee.");
    } catch (errorValue: unknown) {
      setMessage(getErrorMessage(errorValue, "Deconnexion impossible."));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl text-white/95">Compte</h1>
          <p className="mt-2 text-sm text-white/50">
            Gere la connexion, l&apos;upload et la sauvegarde cloud depuis un compte unique.
          </p>
        </div>

        {!isConfigured ? (
          <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-100">
            Supabase Auth n&apos;est pas configure. Ajoute <code className="text-white/80">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
            <code className="text-white/80">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> dans l&apos;environnement.
          </div>
        ) : loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">Chargement du compte...</div>
        ) : isAuthenticated ? (
          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-white/35">Session</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xl text-white/95">{primaryLabel || "Compte connecte"}</p>
                  <p className="mt-1 truncate text-sm text-white/55">{user?.email ?? "Email indisponible"}</p>
                  {createdAtLabel ? <p className="mt-1 text-xs text-white/35">Compte cree le {createdAtLabel}</p> : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {user?.id ? (
                    <Link
                      href={getPublicProfileHref(user.id)}
                      className="inline-flex h-11 items-center rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white/85 transition hover:bg-white/15"
                    >
                      Voir mon profil public
                    </Link>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={busy === "logout"}
                    className="h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  >
                    {busy === "logout" ? "Deconnexion..." : "Se deconnecter"}
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-white/35">Mes uploads</p>
                <p className="mt-3 text-3xl text-white/95">{profileLoading ? "..." : uploads.length}</p>
                <p className="mt-2 text-sm text-white/50">Sons rattaches a ce compte</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-white/35">Favoris sync</p>
                <p className="mt-3 text-3xl text-white/95">{profileLoading ? "..." : favoriteCount}</p>
                <p className="mt-2 text-sm text-white/50">Favoris partages entre tes sessions</p>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-white/85">Profil</p>
              <form className="mt-4 space-y-4" onSubmit={handleProfileUpdate}>
                <div>
                  <label htmlFor="profile-name" className="mb-2 block text-xs text-white/45">
                    Nom affiche
                  </label>
                  <input
                    id="profile-name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#111118] px-3 py-2 text-sm text-white/90 outline-none"
                    placeholder="Ton nom"
                  />
                </div>

                <div>
                  <label htmlFor="public-bio" className="mb-2 block text-xs text-white/45">
                    Bio publique
                  </label>
                  <textarea
                    id="public-bio"
                    value={publicBio}
                    onChange={(e) => setPublicBio(e.target.value)}
                    className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-[#111118] px-3 py-3 text-sm text-white/90 outline-none resize-y"
                    maxLength={220}
                    placeholder="Quelques mots sur toi, ton univers, tes sons..."
                  />
                  <p className="mt-2 text-xs text-white/35">{publicBio.trim().length}/220</p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy === "profile"}
                    className="h-10 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  >
                    {busy === "profile" ? "Sauvegarde..." : "Mettre a jour"}
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-white/85">Securite</p>
              <form className="mt-4 space-y-4" onSubmit={handlePasswordUpdate}>
                <div>
                  <label htmlFor="new-password" className="mb-2 block text-xs text-white/45">
                    Nouveau mot de passe
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#111118] px-3 py-2 text-sm text-white/90 outline-none"
                    placeholder="Au moins 6 caracteres"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy === "password"}
                    className="h-10 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  >
                    {busy === "password" ? "Mise a jour..." : "Changer le mot de passe"}
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-white/85">Mes derniers uploads</p>
                  <p className="mt-1 text-sm text-white/50">Lecture rapide depuis le profil.</p>
                </div>
                <Link href="/library" className="text-sm text-white/70 underline underline-offset-4">
                  Gerer dans la bibliotheque
                </Link>
              </div>

              {uploads.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
                  Aucun upload rattache a ce compte pour l&apos;instant.
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {uploads.slice(0, 8).map((item, index) => (
                    <div
                      key={item.src}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white/90">{item.title}</p>
                        <p className="truncate text-xs text-white/45">{item.artist}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setQueueAndPlay(uploadsForPlayer, index)}
                        className="h-9 rounded-full bg-white px-3 text-xs font-medium text-black transition hover:opacity-90"
                      >
                        Lire
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
              <p>Ton compte protege maintenant l&apos;upload, l&apos;edition, la suppression des sons et les favoris synchronises.</p>
              <p className="mt-2">
                Tu peux retourner sur <Link href="/upload" className="text-white/85 underline underline-offset-4">Upload</Link>,{" "}
                <Link href="/library" className="text-white/85 underline underline-offset-4">Bibliotheque</Link> ou{" "}
                <Link href="/playlists" className="text-white/85 underline underline-offset-4">Playlists</Link>.
              </p>
            </section>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-5 flex gap-2">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={[
                  "h-10 rounded-2xl px-4 text-sm transition",
                  mode === "signin" ? "bg-white text-black font-semibold" : "bg-white/10 text-white/75 hover:bg-white/15",
                ].join(" ")}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={[
                  "h-10 rounded-2xl px-4 text-sm transition",
                  mode === "signup" ? "bg-white text-black font-semibold" : "bg-white/10 text-white/75 hover:bg-white/15",
                ].join(" ")}
              >
                Creer un compte
              </button>
            </div>

            {mode === "signin" ? (
              <form className="space-y-4" onSubmit={handleSignIn}>
                <div>
                  <label htmlFor="account-email" className="mb-2 block text-xs text-white/45">
                    Email
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#111118] px-3 py-2 text-sm text-white/90 outline-none"
                    placeholder="toi@email.com"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="account-password" className="mb-2 block text-xs text-white/45">
                    Mot de passe
                  </label>
                  <input
                    id="account-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#111118] px-3 py-2 text-sm text-white/90 outline-none"
                    placeholder="Mot de passe"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy === "signin"}
                    className="h-10 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  >
                    {busy === "signin" ? "Connexion..." : "Se connecter"}
                  </button>
                </div>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleSignUp}>
                <div>
                  <label htmlFor="signup-name" className="mb-2 block text-xs text-white/45">
                    Nom affiche
                  </label>
                  <input
                    id="signup-name"
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#111118] px-3 py-2 text-sm text-white/90 outline-none"
                    placeholder="Ton pseudo"
                  />
                </div>

                <div>
                  <label htmlFor="signup-email" className="mb-2 block text-xs text-white/45">
                    Email
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#111118] px-3 py-2 text-sm text-white/90 outline-none"
                    placeholder="toi@email.com"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="signup-password" className="mb-2 block text-xs text-white/45">
                    Mot de passe
                  </label>
                  <input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#111118] px-3 py-2 text-sm text-white/90 outline-none"
                    placeholder="Au moins 6 caracteres"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy === "signup"}
                    className="h-10 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                  >
                    {busy === "signup" ? "Creation..." : "Creer le compte"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {message ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80" aria-live="polite">
            {message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
