"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Heart, Home, LibraryBig, Search as SearchIcon, UserRound } from "lucide-react";

const tabs = [
  { href: "/", label: "Accueil" },
  { href: "/library", label: "Bibliotheque" },
  { href: "/search", label: "Recherche" },
  { href: "/favorites", label: "Favoris" },
  { href: "/account", label: "Compte" },
] as const;

function isActivePath(pathname: string | null, href: string) {
  return pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));
}

function TabIcon({ href, className }: { href: (typeof tabs)[number]["href"]; className: string }) {
  switch (href) {
    case "/":
      return <Home size={20} className={className} />;
    case "/library":
      return <LibraryBig size={20} className={className} />;
    case "/search":
      return <SearchIcon size={20} className={className} />;
    case "/favorites":
      return <Heart size={20} className={className} />;
    case "/account":
      return <UserRound size={20} className={className} />;
    default:
      return null;
  }
}

export default function MobileTabBar() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    // Some iOS PWA launches leave the tab icons unpainted (a WebKit
    // compositing glitch). Forcing a reflow via a display toggle nudges the
    // compositor to repaint them - do it once after the first real paint,
    // and again whenever the app comes back to the foreground.
    const kick = () => {
      if (!nav.isConnected) return;
      const prevDisplay = nav.style.display;
      nav.style.display = "none";
      void nav.offsetHeight;
      nav.style.display = prevDisplay;
    };

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(kick);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") kick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", kick);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", kick);
    };
  }, []);

  return (
    <nav
      ref={navRef}
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation principale"
    >
      <div className="h-[60px] flex items-stretch">
        {tabs.map(({ href, label }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "relative flex-1 flex flex-col items-center justify-center gap-1",
                active ? "text-[var(--mp3-accent-strong)]" : "text-white/45",
              ].join(" ")}
            >
              {active ? (
                <span
                  className="absolute top-0 h-[3px] w-8 rounded-full bg-[var(--mp3-accent-strong)]"
                  aria-hidden="true"
                />
              ) : null}
              <TabIcon href={href} className="w-5 h-5" />
              <span className="text-[10px]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
