"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BarChart3,
  Heart,
  Home,
  LibraryBig,
  ListMusic,
  LogOut,
  Menu,
  MessageCircle,
  Radio,
  Repeat,
  Search as SearchIcon,
  Settings,
  TrendingUp,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { usePlayer } from "./PlayerContext";
import { useFocusTrap } from "./useFocusTrap";
import { openShortcutsHelp } from "./shortcutsUi";

function AccountQuickSwitch({ onSwitched }: { onSwitched?: () => void }) {
  const { accounts, switchAccount, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const others = accounts.filter((a) => a.userId !== user?.id);
  if (others.length === 0) return null;

  async function handleSwitch(userId: string) {
    if (busyId) return;
    setBusyId(userId);
    setError("");
    try {
      await switchAccount(userId);
      setOpen(false);
      onSwitched?.();
    } catch {
      setError("Session expiree pour ce compte.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/70 transition"
      >
        <Repeat size={11} />
        Changer de compte
      </button>
      {open ? (
        <div className="mt-2 space-y-1 mp3-fade-up">
          {others.map((acc) => {
            const label = acc.displayName || acc.email || "Compte";
            return (
              <button
                key={acc.userId}
                type="button"
                onClick={() => void handleSwitch(acc.userId)}
                disabled={busyId === acc.userId}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs text-white/60 hover:bg-white/8 hover:text-white/90 transition disabled:opacity-50"
              >
                <span className="h-5 w-5 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-medium text-white/70">
                  {label.slice(0, 2).toUpperCase()}
                </span>
                <span className="truncate flex-1">{label}</span>
                {busyId === acc.userId ? <span className="text-white/30">...</span> : null}
              </button>
            );
          })}
          {error ? <p className="px-2 text-[11px] text-red-400/80">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

const nav = [
  { href: "/", label: "Accueil", Icon: Home },
{ href: "/library", label: "Bibliotheque", Icon: LibraryBig },
  { href: "/playlists", label: "Playlists", Icon: ListMusic },
  { href: "/search", label: "Recherche", Icon: SearchIcon },
  { href: "/favorites", label: "Favoris", Icon: Heart },
  { href: "/radio", label: "Radio en direct", Icon: Radio },
  { href: "/messages", label: "Messages", Icon: MessageCircle },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
  { href: "/top", label: "Top global", Icon: TrendingUp },
  { href: "/account", label: "Compte", Icon: UserRound },
  { href: "/settings", label: "Parametres", Icon: Settings },
];

function isActivePath(pathname: string | null, href: string) {
  return pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));
}

export default function Sidebar() {
  const pathname = usePathname();
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const { favorites, playing, focusMode } = usePlayer();
  const { isAuthenticated, loading, primaryLabel, signOut, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  useFocusTrap(mobileOpen, drawerRef);

  const stablePathname = isHydrated ? pathname : null;
  const compact = focusMode && playing;

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // noop
    }
  }

  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  return (
    <>
      <aside
        className={[
          "relative hidden bg-[#000000] border-r border-white/10 md:flex md:flex-col overflow-hidden transition-all duration-300",
          compact ? "w-20 p-4" : "w-64 p-6",
        ].join(" ")}
      >
        {!compact ? (
          <div className="pointer-events-none absolute -top-8 -right-0 opacity-[0.4]">
            <Image
              src="/images/birds.png"
              alt=""
              aria-hidden="true"
              width={220}
              height={220}
              className="object-contain"
              priority={false}
            />
          </div>
        ) : null}

        <div
          className={[
            "relative z-10 flex items-center",
            compact ? "mb-8 justify-center" : "mb-10 justify-between",
          ].join(" ")}
        >
          <h1 className={["font-light tracking-widest text-white", compact ? "text-2xl" : "text-3xl"].join(" ")}>
            {compact ? ".m" : ".mp3"}
          </h1>

          {!compact ? (
            <button
              type="button"
              onClick={openShortcutsHelp}
              className="h-8 w-8 rounded-full bg-white/5 text-white/50 text-sm transition hover:bg-white/10 hover:text-white/85"
              title="Raccourcis clavier (?)"
              aria-label="Afficher les raccourcis clavier"
            >
              ?
            </button>
          ) : null}
        </div>

        <nav className="relative z-10 flex flex-col gap-2" aria-label="Navigation principale">
          {nav.map(({ href, label, Icon }, i) => {
            const active = isActivePath(stablePathname, href);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "group flex items-center rounded-2xl px-4 py-3 text-sm transition mp3-slide-right",
                  `mp3-d-${i}`,
                  compact ? "justify-center gap-0 px-0" : "gap-3",
                  active
                    ? "bg-[var(--mp3-accent-soft)] text-white"
                    : "text-white/60 hover:text-white hover:bg-white/5 hover:translate-x-0.5",
                ].join(" ")}
                title={label}
              >
                <span className="w-6 flex items-center justify-center transition-transform duration-150 group-hover:scale-110" aria-hidden="true">
                  <Icon size={18} className={active ? "text-[var(--mp3-accent-strong)]" : "opacity-80"} />
                </span>

                {!compact ? <span className="flex-1 transition-transform duration-150">{label}</span> : null}

                {!compact && href === "/favorites" && favorites.length > 0 ? (
                  <span className="text-[11px] rounded-full bg-white/10 border border-white/10 px-2 py-[2px] text-white/80">
                    {favorites.length > 99 ? "99+" : favorites.length}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="relative mt-auto pt-6">
          <div className={["relative", compact ? "h-[166px]" : "h-[312px]"].join(" ")}>
            {!compact ? (
              <>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 opacity-60 flex justify-center">
                  <Image
                    src="/images/blossom.png"
                    alt=""
                    aria-hidden="true"
                    width={240}
                    height={240}
                    className="object-contain"
                    priority={false}
                  />
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[240px] bg-gradient-to-t from-black via-black/70 to-transparent" />
              </>
            ) : null}

            <div className={["absolute inset-x-0 z-20 space-y-3", compact ? "bottom-0" : "bottom-[92px]"].join(" ")}>
              {compact ? (
                <Link
                  href="/account"
                  className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/8 p-3 text-white/85 transition hover:bg-white/12"
                  title={isAuthenticated ? primaryLabel || user?.email || "Compte" : "Se connecter"}
                >
                  <UserRound size={18} />
                </Link>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href="/account" className="min-w-0 flex-1">
                      <p className="text-xs text-white/45">Compte</p>
                      <p className="mt-1 truncate text-sm text-white/90">
                        {loading ? "Chargement..." : isAuthenticated ? primaryLabel || user?.email || "Connecte" : "Se connecter"}
                      </p>
                      <p className="mt-1 truncate text-xs text-white/45">
                        {isAuthenticated ? user?.email ?? "Session active" : "Email + mot de passe"}
                      </p>
                    </Link>

                    {isAuthenticated ? (
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="h-9 w-9 rounded-full bg-white/8 text-white/75 transition hover:bg-white/12 hover:text-white"
                        title="Se deconnecter"
                      >
                        <LogOut size={16} className="mx-auto" />
                      </button>
                    ) : null}
                  </div>
                  {isAuthenticated ? <AccountQuickSwitch /> : null}
                </div>
              )}

              <Link
                href="/upload"
                className={[
                  "flex items-center rounded-2xl px-4 py-3 text-sm transition border",
                  compact ? "justify-center px-0" : "justify-between gap-3",
                  stablePathname === "/upload"
                    ? "bg-white text-black border-white/20"
                    : "bg-white/10 text-white border-white/10 hover:bg-white/15",
                ].join(" ")}
                title="Ajouter un son"
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 flex items-center justify-center" aria-hidden="true">
                    <Upload size={18} />
                  </span>
                  {!compact ? <span className="font-medium">Ajouter un son</span> : null}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </aside>

      <div className="md:hidden">
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div className="h-12 px-4 flex items-center justify-between">
            <Link
              href="/"
              className="text-lg font-light tracking-widest text-white"
              onClick={closeMobileMenu}
            >
              .mp3
            </Link>
            <button
              type="button"
              className="h-9 w-9 rounded-full border border-white/15 bg-white/5 text-white/90 flex items-center justify-center"
              aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-sidebar-drawer"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </header>

        <div
          className={[
            "fixed inset-0 z-50 transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          ].join(" ")}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/65"
            aria-label="Fermer le menu"
            onClick={() => setMobileOpen(false)}
          />

          <aside
            ref={drawerRef}
            id="mobile-sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation mobile"
            className={[
              "absolute right-0 top-0 h-full w-[84vw] max-w-[340px] bg-[#050506] border-l border-white/10 p-4 pt-[calc(4rem+env(safe-area-inset-top))]",
              "transition-transform duration-200",
              mobileOpen ? "translate-x-0" : "translate-x-full",
            ].join(" ")}
          >
            <nav className="flex flex-col gap-2" aria-label="Navigation principale">
              {nav.map(({ href, label, Icon }) => {
                const active = isActivePath(stablePathname, href);

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={closeMobileMenu}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                      active
                        ? "bg-[var(--mp3-accent-soft)] text-white"
                        : "text-white/70 hover:text-white hover:bg-white/5",
                    ].join(" ")}
                  >
                    <span className="w-6 flex items-center justify-center" aria-hidden="true">
                      <Icon size={18} className={active ? "text-[var(--mp3-accent-strong)]" : "opacity-85"} />
                    </span>
                    <span className="flex-1">{label}</span>
                    {href === "/favorites" && favorites.length > 0 ? (
                      <span className="text-[11px] rounded-full bg-white/10 border border-white/10 px-2 py-[2px] text-white/80">
                        {favorites.length > 99 ? "99+" : favorites.length}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6">
              <Link
                href="/upload"
                onClick={closeMobileMenu}
                className={[
                  "flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm transition border",
                  stablePathname === "/upload"
                    ? "bg-white text-black border-white/20"
                    : "bg-white/10 text-white border-white/10 hover:bg-white/15",
                ].join(" ")}
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 flex items-center justify-center" aria-hidden="true">
                    <Upload size={18} />
                  </span>
                  <span className="font-medium">Ajouter un son</span>
                </span>
              </Link>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href="/account" onClick={closeMobileMenu} className="min-w-0 flex-1">
                  <p className="text-xs text-white/45">Compte</p>
                  <p className="mt-1 truncate text-sm text-white/90">
                    {loading ? "Chargement..." : isAuthenticated ? primaryLabel || user?.email || "Connecte" : "Se connecter"}
                  </p>
                  <p className="mt-1 truncate text-xs text-white/45">
                    {isAuthenticated ? user?.email ?? "Session active" : "Compte requis pour upload et cloud"}
                  </p>
                </Link>

                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeMobileMenu();
                      void handleSignOut();
                    }}
                    className="h-9 w-9 rounded-full bg-white/8 text-white/75 transition hover:bg-white/12 hover:text-white"
                    title="Se deconnecter"
                  >
                    <LogOut size={16} className="mx-auto" />
                  </button>
                ) : null}
              </div>
              {isAuthenticated ? <AccountQuickSwitch onSwitched={closeMobileMenu} /> : null}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
