"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
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

      <div className="relative z-10 flex h-screen">
        <Sidebar />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 pt-[calc(4rem+env(safe-area-inset-top))] md:p-8" tabIndex={-1}>
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <KeyboardShortcuts />
      <WelcomeCard />
      <PwaInstaller />
      <LauncherHeartbeat />
      <LandscapeGuard />
      <MobileTabBar />
      <MiniPlayer />
      <PlayerOverlay />
      <div className="pointer-events-none fixed -top-20 right-0 z-[1] w-[520px] h-[431px] opacity-40" aria-hidden="true">
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

      <div className="fixed top-0 right-16 z-[55] flex items-center gap-[8px] md:top-3 md:right-4">
        <NotificationBell />
        <GlobalChat />
      </div>
    </>
  );
}
