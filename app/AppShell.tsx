"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import MobileTabBar from "./MobileTabBar";
import LandscapeGuard from "./LandscapeGuard";
import OfflineBanner from "./OfflineBanner";
import PageTransition from "./PageTransition";
import DynamicBackdrop from "./DynamicBackdrop";
import MiniPlayer from "./MiniPlayer";
import PlayerOverlay from "./PlayerOverlay";
import KeyboardShortcuts from "./KeyboardShortcuts";
import PwaInstaller from "./PwaInstaller";
import GlobalChat from "./GlobalChat";
import NotificationBell from "./NotificationBell";
import LauncherHeartbeat from "./LauncherHeartbeat";
import CustomCursor from "./CustomCursor";
import FallingPetals from "./FallingPetals";
import WelcomeCard from "./WelcomeCard";
import { usePlayer } from "./PlayerContext";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEmbed = pathname?.startsWith("/embed");
  const { fallingPetals } = usePlayer();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isEmbed) {
    return (
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    );
  }

  return (
    <>
      <DynamicBackdrop />
      {fallingPetals && <FallingPetals />}
      <CustomCursor />
      <OfflineBanner />

      {/*
        Mobile chrome (header row, tab bar) lives in normal document flow as
        flex children instead of position:fixed. iOS can leave fixed-position
        chrome mispainted/mispositioned right after a standalone PWA launch
        (env(safe-area-inset-*) resolving late relative to first paint) - an
        in-flow flex column sidesteps that class of bug entirely while still
        keeping the header and tab bar always on screen (main is the only
        scrolling region). Desktop layout (flex-row, Sidebar + main) is
        unchanged.
      */}
      <div className="fixed inset-0 z-10 flex flex-col md:static md:flex md:h-screen md:flex-row">
        <div className="relative z-[60] flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 md:contents">
          <button
            type="button"
            className="h-9 w-9 rounded-full border border-white/15 bg-white/5 text-white/90 flex items-center justify-center md:hidden"
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar-drawer"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <div className="flex items-center gap-[8px] md:fixed md:top-3 md:right-4 md:z-[55]">
            <NotificationBell />
            <GlobalChat />
          </div>
        </div>

        <Sidebar mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />

        <main id="main-content" className="flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-8" tabIndex={-1}>
          <PageTransition>{children}</PageTransition>
        </main>

        <MobileTabBar />
      </div>

      <KeyboardShortcuts />
      <WelcomeCard />
      <PwaInstaller />
      <LauncherHeartbeat />
      <LandscapeGuard />
      <MiniPlayer />
      <PlayerOverlay />
      <div
        className="pointer-events-none fixed -top-10 right-0 z-[1] w-64 h-56 opacity-15 md:-top-20 md:w-[520px] md:h-[431px] md:opacity-40"
        aria-hidden="true"
      >
        <Image
          src="/images/flowers.png"
          alt=""
          width={520}
          height={431}
          className="w-full h-full object-contain"
          priority
        />
      </div>

      <div
        className="pointer-events-none fixed left-64 bottom-[72px] z-[1] hidden h-[220px] w-[420px] opacity-40 md:block"
        aria-hidden="true"
      >
        <Image
          src="/images/flower miror.png"
          alt=""
          width={736}
          height={294}
          className="h-full w-full object-contain object-left-bottom"
          priority={false}
        />
      </div>
    </>
  );
}
