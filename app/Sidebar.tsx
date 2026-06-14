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
  Menu,
  Search as SearchIcon,
  Upload,
  X,
} from "lucide-react";
import { usePlayer } from "./PlayerContext";
import { useFocusTrap } from "./useFocusTrap";

const nav = [
  { href: "/", label: "Accueil", Icon: Home },
  { href: "/library", label: "Bibliotheque", Icon: LibraryBig },
  { href: "/playlists", label: "Playlists", Icon: ListMusic },
  { href: "/search", label: "Recherche", Icon: SearchIcon },
  { href: "/favorites", label: "Favoris", Icon: Heart },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  useFocusTrap(mobileOpen, drawerRef);

  const stablePathname = isHydrated ? pathname : null;
  const compact = focusMode && playing;

  function closeMobileMenu() {
    setMobileOpen(false);
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
          <div className="pointer-events-none absolute -top-24 -right-0 opacity-[0.4]">
            <Image
              src="/images/birds.jpg"
              alt=""
              aria-hidden="true"
              width={220}
              height={220}
              className="object-contain"
              priority={false}
            />
          </div>
        ) : null}

        <div className={["relative z-10", compact ? "mb-8 text-center" : "mb-10"].join(" ")}>
          <h1 className={["font-light tracking-widest text-white", compact ? "text-2xl" : "text-3xl"].join(" ")}>
            {compact ? ".m" : ".mp3"}
          </h1>
        </div>

        <nav className="relative z-10 flex flex-col gap-2" aria-label="Navigation principale">
          {nav.map(({ href, label, Icon }) => {
            const active = isActivePath(stablePathname, href);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center rounded-2xl px-4 py-3 text-sm transition",
                  compact ? "justify-center gap-0 px-0" : "gap-3",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/5",
                ].join(" ")}
                title={label}
              >
                <span className="w-6 flex items-center justify-center" aria-hidden="true">
                  <Icon size={18} className={active ? "text-white" : "opacity-80"} />
                </span>

                {!compact ? <span className="flex-1">{label}</span> : null}

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
          <div className={["relative", compact ? "h-[90px]" : "h-[240px]"].join(" ")}>
            {!compact ? (
              <>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 opacity-60 flex justify-center">
                  <Image
                    src="/images/blossom.jpg"
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

            <div className={["absolute inset-x-0 z-20", compact ? "bottom-0" : "bottom-[92px]"].join(" ")}>
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
        <header className="fixed top-0 left-0 right-0 z-50 h-16 px-4 border-b border-white/10 bg-black/90 backdrop-blur flex items-center justify-between">
          <Link
            href="/"
            className="text-2xl font-light tracking-widest text-white"
            onClick={closeMobileMenu}
          >
            .mp3
          </Link>
          <button
            type="button"
            className="h-10 w-10 rounded-full border border-white/15 bg-white/5 text-white/90 flex items-center justify-center"
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar-drawer"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
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
              "absolute right-0 top-0 h-full w-[84vw] max-w-[340px] bg-[#050506] border-l border-white/10 p-4 pt-20",
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
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:text-white hover:bg-white/5",
                    ].join(" ")}
                  >
                    <span className="w-6 flex items-center justify-center" aria-hidden="true">
                      <Icon size={18} className={active ? "text-white" : "opacity-85"} />
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
          </aside>
        </div>
      </div>
    </>
  );
}
