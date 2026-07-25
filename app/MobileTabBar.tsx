"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
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
                "relative flex-1 flex flex-col items-center justify-center gap-1 transition active:scale-90",
                active ? "text-[var(--mp3-accent-strong)]" : "text-white/45",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0 h-[3px] w-8 rounded-full bg-[var(--mp3-accent-strong)] transition-all duration-200",
                  active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0",
                ].join(" ")}
                aria-hidden="true"
              />
              <TabIcon
                href={href}
                className={[
                  "shrink-0 w-5 h-5 transition-transform duration-200",
                  active ? "opacity-100 scale-110" : "opacity-80 scale-100",
                ].join(" ")}
              />
              <span className="text-[10px]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
