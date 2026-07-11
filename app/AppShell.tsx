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
import CursorGlow from "./CursorGlow";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEmbed = pathname?.startsWith("/embed");

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
      <CursorGlow />
      <OfflineBanner />

      <div className="relative z-10 flex h-screen">
        <Sidebar />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 pt-[calc(4rem+env(safe-area-inset-top))] md:p-8" tabIndex={-1}>
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <KeyboardShortcuts />
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
