"use client";

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
      <div className="fixed top-0 right-16 z-[55] flex items-center gap-[8px] md:top-3 md:right-4">
        <NotificationBell />
        <GlobalChat />
      </div>
    </>
  );
}
