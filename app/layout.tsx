import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Sidebar from "../app/Sidebar";
import MiniPlayer from "../app/MiniPlayer";
import PlayerOverlay from "../app/PlayerOverlay";
import KeyboardShortcuts from "../app/KeyboardShortcuts";
import PwaInstaller from "../app/PwaInstaller";
import { PlayerProvider } from "../app/PlayerContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: ".mp3",
  description: "Personal music player",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  appleWebApp: {
    capable: true,
    title: ".mp3",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a href="#main-content" className="skip-link">
          Aller au contenu principal
        </a>

        <PlayerProvider>
          <div className="flex h-screen">
            <Sidebar />
            <main id="main-content" className="flex-1 overflow-y-auto p-4 pt-20 md:p-8" tabIndex={-1}>
              {children}
            </main>
          </div>

          <KeyboardShortcuts />
          <PwaInstaller />
          <MiniPlayer />
          <PlayerOverlay />
        </PlayerProvider>
      </body>
    </html>
  );
}
