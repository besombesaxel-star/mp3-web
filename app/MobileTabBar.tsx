"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Accueil", icon: "/icons/tab-home.svg" },
  { href: "/library", label: "Bibliotheque", icon: "/icons/tab-library.svg" },
  { href: "/search", label: "Recherche", icon: "/icons/tab-search.svg" },
  { href: "/favorites", label: "Favoris", icon: "/icons/tab-heart.svg" },
  { href: "/account", label: "Compte", icon: "/icons/tab-account.svg" },
] as const;

function isActivePath(pathname: string | null, href: string) {
  return pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));
}

// Mask-based icons instead of inline lucide SVGs: on iOS, an installed PWA
// can leave inline SVGs inside this fixed bottom bar unpainted after launch
// (a WebKit compositing bug). A CSS mask-image composites as a plain
// background paint rather than a separate animated SVG subtree, which
// sidesteps that bug entirely.
function TabIcon({ icon }: { icon: string }) {
  return (
    <span
      aria-hidden="true"
      className="block h-5 w-5 bg-current"
      style={{
        WebkitMaskImage: `url(${icon})`,
        maskImage: `url(${icon})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation principale"
    >
      <div className="h-[60px] flex items-stretch">
        {tabs.map(({ href, label, icon }) => {
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
              <TabIcon icon={icon} />
              <span className="text-[10px]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
