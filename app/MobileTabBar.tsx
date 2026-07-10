"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, LibraryBig, Search as SearchIcon, UserRound } from "lucide-react";

const tabs = [
  { href: "/", label: "Accueil", Icon: Home },
  { href: "/library", label: "Bibliotheque", Icon: LibraryBig },
  { href: "/search", label: "Recherche", Icon: SearchIcon },
  { href: "/favorites", label: "Favoris", Icon: Heart },
  { href: "/account", label: "Compte", Icon: UserRound },
];

function isActivePath(pathname: string | null, href: string) {
  return pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));
}

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation principale"
    >
      <div className="h-[60px] flex items-stretch">
        {tabs.map(({ href, label, Icon }) => {
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
              <Icon
                size={20}
                className={[
                  "transition-transform duration-200",
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
