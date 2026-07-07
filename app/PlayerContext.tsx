"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthProvider";
import { toast } from "./Toast";
import { vibrate } from "./haptics";
import { playChimeSound, playPopSound, unlockAudio } from "./sound";
import { getOrCreateSharedGraph, type SharedGraph } from "./audioGraph";
import { fetchTracksShared } from "./tracksCache";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { ACHIEVEMENTS, type AchievementId } from "@/lib/achievements";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";
import { cacheTracksForOffline } from "@/lib/offlineCache";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";

export type Track = {
  title: string;
  artist?: string;
  src: string; // ex: "/audio/Guala.mp3"
  cover?: string; // ex: "/cover/Guala.jpg"
  accent?: string; // ex: "#8B5CF6"
  ownerDisplayName?: string;
  ownerId?: string;
  credits?: string;
};

type RepeatMode = "off" | "all" | "one";
type ThemeMode = "midnight" | "sunset" | "ocean" | "day";
type FontSizeMode = "sm" | "md" | "lg" | "xl";
type EqPreset = "off" | "bass" | "vocal" | "night" | "custom";
export type EqGains = [number, number, number, number, number];


export type PlayerStats = {
  totalListenSeconds: number;
  uniqueTracksPlayed: number;
  totalPlays: number;

  topArtist: { name: string; seconds: number; plays: number } | null;
  topTrack:
    | { title: string; artist?: string; src: string; seconds: number; plays: number }
    | null;

  byTrack: Record<string, { title: string; artist?: string; seconds: number; plays: number }>;
  byArtist: Record<string, { seconds: number; plays: number }>;
  recentPlays: Array<{ src: string; playedAt: number; hour: number }>;
  firstPlayedAtByTrack: Record<string, number>;
  /** play counts keyed by local calendar day ("YYYY-MM-DD"), never pruned - powers the activity heatmap */
  playsByDay: Record<string, number>;

  /** âœ… achievements map: unlockedAt timestamp (ms) */
  achievements: Partial<Record<AchievementId, { unlockedAt: number }>>;
};

export type AchievementToast = {
  id: AchievementId;
  title: string;
  desc: string;
  icon: string;
} | null;

export type UndoToast = {
  message: string;
} | null;

export type QueueSuggestion = {
  id: string;
  fromUserId: string;
  fromDisplayName: string;
  track: Track;
} | null;

export type RemoteSession = {
  track: Track;
  position: number;
  deviceLabel: string;
  updatedAt: number;
} | null;

type PlayerCtx = {
  // queue actuelle
  tracks: Track[];
  track: Track | null;
  index: number;
  playing: boolean;

  progress: number;
  currentTime: number;
  duration: number;

  volume: number;
  muted: boolean;

  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
  toggleFocusMode: () => void;
  theme: ThemeMode;
  setTheme: (value: ThemeMode) => void;
  cycleTheme: () => void;
  fontSize: FontSizeMode;
  setFontSize: (value: FontSizeMode) => void;
  highContrast: boolean;
  toggleHighContrast: () => void;
  eqPreset: EqPreset;
  setEqPreset: (value: EqPreset) => void;
  cycleEqPreset: () => void;
  customEqGains: EqGains;
  setCustomEqGains: (value: EqGains) => void;

  expanded: boolean;
  setExpanded: (v: boolean) => void;

  queueOpen: boolean;
  setQueueOpen: (v: boolean) => void;

  setTracks: (t: Track[]) => void;

  playIndex: (i: number) => void;
  playTrack: (t: Track) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (ratio: number) => void;

  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;

  // compat: set queue + start (index ou track)
  setQueueAndPlay: (queue: Track[], start?: number | Track) => void;

  // âœ… queue helpers
  addToQueueNext: (t: Track) => void;
  addToQueueEnd: (t: Track) => void;
  moveInQueue: (from: number, to: number) => void;
  removeFromQueue: (src: string) => void;
  clearQueue: () => void;

  shuffle: boolean;
  repeat: RepeatMode;
  smoothTransitions: boolean;
  smartAutoplay: boolean;
  uiSounds: boolean;
  hapticsEnabled: boolean;
  loudnessNorm: boolean;
  toggleSmoothTransitions: () => void;
  toggleSmartAutoplay: () => void;
  toggleUiSounds: () => void;
  toggleHaptics: () => void;
  toggleLoudnessNorm: () => void;
  preloadedTrack: Track | null;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setRepeat: (mode: RepeatMode) => void;
  radioMode: boolean;
  tuneInRadio: () => Promise<boolean>;
  leaveRadio: () => void;

  // âœ… favoris
  favorites: Track[];
  isFavorite: (src: string) => boolean;
  toggleFavorite: (t: Track) => void;
  clearFavorites: () => void;

  // audio element
  getAudio: () => HTMLAudioElement | null;

  // âœ… stats + achievements
  stats: PlayerStats;
  resetStats: () => void;

  achievementToast: AchievementToast;
  dismissAchievementToast: () => void;

  undoToast: UndoToast;
  undoLastAction: () => void;
  dismissUndoToast: () => void;

  queueSuggestion: QueueSuggestion;
  acceptQueueSuggestion: () => void;
  dismissQueueSuggestion: () => void;
  suggestTrackToUser: (targetUserId: string, track: Track) => Promise<boolean>;

  remoteSession: RemoteSession;
  resumeOnThisDevice: () => void;
  dismissRemoteSession: () => void;

  /** âœ… pour dÃ©clencher lâ€™achievement â€œPremière playlistâ€ depuis PlaylistsPage */
  markPlaylistCreated: () => void;

  reloadFavoritesFromStorage: () => void;
};

const Ctx = createContext<PlayerCtx | null>(null);

const LS_FAV = "mp3:favorites:v1"; // record { [src]: Track }
const LS_STATS = "mp3:stats:v1";
const LS_SESSION = "mp3:session:v1";
const LS_PREFS = "mp3:prefs:v1";
const MAX_RECENT_PLAYS = 600;
const SOFT_CROSSFADE_MS = 620;
const SOFT_CROSSFADE_LEAD = 0.48;
const THEME_ORDER: ThemeMode[] = ["midnight", "sunset", "ocean", "day"];
const EQ_ORDER: EqPreset[] = ["off", "bass", "vocal", "night"];
const EQ_BANDS = [90, 250, 1000, 3500, 9000];
const DEFAULT_CUSTOM_EQ_GAINS: EqGains = [0, 0, 0, 0, 0];
const EQ_PRESET_GAINS: Record<EqPreset, EqGains> = {
  off: [0, 0, 0, 0, 0],
  bass: [5, 3, 0, -1, -2],
  vocal: [-2, -1, 3, 4, 2],
  night: [-1, 1, 2, 1, -1],
  custom: DEFAULT_CUSTOM_EQ_GAINS,
};

type PlayerSession = {
  tracks: Track[];
  index: number;
  currentTime: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
};

type PlayerPrefs = {
  focusMode: boolean;
  smoothTransitions: boolean;
  smartAutoplay: boolean;
  uiSounds: boolean;
  hapticsEnabled: boolean;
  loudnessNorm: boolean;
  theme: ThemeMode;
  fontSize: FontSizeMode;
  highContrast: boolean;
  eqPreset: EqPreset;
  customEqGains: EqGains;
};

type ApiTrack = {
  title: string;
  artist: string;
  src: string;
  cover: string | null;
  ownerDisplayName?: string | null;
  ownerId?: string | null;
  credits?: string | null;
};

type AccountResponse = {
  favoriteTracks?: ApiTrack[];
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function normalizeArtist(a?: string) {
  const s = (a ?? "").trim();
  return s || "-";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeTrack(value: unknown): Track | null {
  if (!isRecord(value)) return null;
  if (typeof value.src !== "string" || typeof value.title !== "string") return null;

  const artist = typeof value.artist === "string" ? value.artist : undefined;
  const cover = typeof value.cover === "string" ? value.cover : undefined;
  const accent = typeof value.accent === "string" ? value.accent : undefined;
  const ownerDisplayName = typeof value.ownerDisplayName === "string" ? value.ownerDisplayName : undefined;
  const ownerId = typeof value.ownerId === "string" ? value.ownerId : undefined;

  return {
    title: value.title,
    artist,
    src: value.src,
    cover,
    accent,
    ownerDisplayName,
    ownerId,
  };
}

function tracksToFavoritesMap(value: Array<ApiTrack | Track>) {
  const entries = value
    .filter((item): item is ApiTrack | Track => Boolean(item?.src && item?.title))
    .map((item) => [
      item.src,
      {
        title: item.title,
        artist: item.artist,
        src: item.src,
        cover: "cover" in item ? item.cover ?? undefined : undefined,
        accent: "accent" in item ? item.accent : undefined,
        ownerDisplayName: "ownerDisplayName" in item ? item.ownerDisplayName ?? undefined : undefined,
        ownerId: "ownerId" in item ? item.ownerId ?? undefined : undefined,
        credits: "credits" in item ? item.credits ?? undefined : undefined,
      } satisfies Track,
    ] as const);

  return Object.fromEntries(entries);
}

function sanitizeFavoritesMap(value: unknown): Record<string, Track> {
  const entries: Array<readonly [string, Track]> = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      const track = safeTrack(item);
      if (!track) continue;
      entries.push([track.src, track] as const);
    }

    return Object.fromEntries(entries) as Record<string, Track>;
  }

  if (!isRecord(value)) {
    return {};
  }

  for (const [src, trackValue] of Object.entries(value)) {
    const track = safeTrack(trackValue);
    if (track) {
      entries.push([track.src, track] as const);
      continue;
    }

    if (!src) continue;
    if (!isRecord(trackValue) || typeof trackValue.title !== "string") continue;

    entries.push([
      src,
      {
        title: trackValue.title,
        artist: typeof trackValue.artist === "string" ? trackValue.artist : undefined,
        src,
        cover: typeof trackValue.cover === "string" ? trackValue.cover : undefined,
        accent: typeof trackValue.accent === "string" ? trackValue.accent : undefined,
        ownerDisplayName:
          typeof trackValue.ownerDisplayName === "string" ? trackValue.ownerDisplayName : undefined,
        ownerId: typeof trackValue.ownerId === "string" ? trackValue.ownerId : undefined,
      } satisfies Track,
    ] as const);
  }

  return Object.fromEntries(entries) as Record<string, Track>;
}

function safeSession(parsed: unknown): PlayerSession | null {
  if (!isRecord(parsed)) return null;
  if (!Array.isArray(parsed.tracks)) return null;

  const tracks = parsed.tracks
    .map((item) => safeTrack(item))
    .filter((track): track is Track => track !== null);

  const index =
    typeof parsed.index === "number" && Number.isFinite(parsed.index) ? Math.floor(parsed.index) : -1;
  const currentTime =
    typeof parsed.currentTime === "number" && Number.isFinite(parsed.currentTime)
      ? Math.max(0, parsed.currentTime)
      : 0;
  const volume =
    typeof parsed.volume === "number" && Number.isFinite(parsed.volume) ? clamp(parsed.volume, 0, 1) : 1;
  const muted = Boolean(parsed.muted);
  const shuffle = Boolean(parsed.shuffle);
  const repeat: RepeatMode =
    parsed.repeat === "off" || parsed.repeat === "all" || parsed.repeat === "one"
      ? parsed.repeat
      : "off";

  return {
    tracks,
    index,
    currentTime,
    volume,
    muted,
    shuffle,
    repeat,
  };
}

function normalizeCustomEqGains(value: unknown): EqGains {
  if (!Array.isArray(value) || value.length !== 5) return [...DEFAULT_CUSTOM_EQ_GAINS];
  return value.map((v) => (typeof v === "number" && isFinite(v) ? Math.max(-12, Math.min(12, v)) : 0)) as EqGains;
}

function safePrefs(parsed: unknown): PlayerPrefs {
  if (!isRecord(parsed)) {
    return {
      focusMode: false,
      smoothTransitions: true,
      smartAutoplay: true,
      uiSounds: false,
      hapticsEnabled: true,
      loudnessNorm: true,
      theme: "midnight",
      fontSize: "md",
      highContrast: false,
      eqPreset: "off",
      customEqGains: [...DEFAULT_CUSTOM_EQ_GAINS],
    };
  }

  return {
    focusMode: Boolean(parsed.focusMode),
    smoothTransitions:
      typeof parsed.smoothTransitions === "boolean" ? parsed.smoothTransitions : true,
    smartAutoplay:
      typeof parsed.smartAutoplay === "boolean" ? parsed.smartAutoplay : true,
    uiSounds: typeof parsed.uiSounds === "boolean" ? parsed.uiSounds : false,
    hapticsEnabled: typeof parsed.hapticsEnabled === "boolean" ? parsed.hapticsEnabled : true,
    loudnessNorm: typeof parsed.loudnessNorm === "boolean" ? parsed.loudnessNorm : true,
    theme:
      parsed.theme === "midnight" ||
      parsed.theme === "sunset" ||
      parsed.theme === "ocean" ||
      parsed.theme === "day"
        ? parsed.theme
        : "midnight",
    fontSize:
      parsed.fontSize === "sm" || parsed.fontSize === "md" || parsed.fontSize === "lg" || parsed.fontSize === "xl"
        ? parsed.fontSize
        : "md",
    highContrast: typeof parsed.highContrast === "boolean" ? parsed.highContrast : false,
    eqPreset:
      parsed.eqPreset === "off" ||
      parsed.eqPreset === "bass" ||
      parsed.eqPreset === "vocal" ||
      parsed.eqPreset === "night" ||
      parsed.eqPreset === "custom"
        ? parsed.eqPreset
        : "off",
    customEqGains: normalizeCustomEqGains(parsed.customEqGains),
  };
}

function emptyStats(): PlayerStats {
  return {
    totalListenSeconds: 0,
    uniqueTracksPlayed: 0,
    totalPlays: 0,
    topArtist: null,
    topTrack: null,
    byTrack: {},
    byArtist: {},
    recentPlays: [],
    firstPlayedAtByTrack: {},
    playsByDay: {},
    achievements: {},
  };
}

function getDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeStats(parsed: unknown): PlayerStats {
  const base = emptyStats();
  if (!isRecord(parsed)) return base;

  const totalListenSeconds =
    typeof parsed.totalListenSeconds === "number" && Number.isFinite(parsed.totalListenSeconds)
      ? Math.max(0, parsed.totalListenSeconds)
      : 0;

  const totalPlays =
    typeof parsed.totalPlays === "number" && Number.isFinite(parsed.totalPlays)
      ? Math.max(0, parsed.totalPlays)
      : 0;

  const byTrack = isRecord(parsed.byTrack) ? parsed.byTrack : {};
  const byArtist = isRecord(parsed.byArtist) ? parsed.byArtist : {};
  const recentPlays = Array.isArray(parsed.recentPlays) ? parsed.recentPlays : [];
  const firstPlayedAtByTrack = isRecord(parsed.firstPlayedAtByTrack) ? parsed.firstPlayedAtByTrack : {};
  const playsByDay = isRecord(parsed.playsByDay) ? parsed.playsByDay : {};
  const achievements = isRecord(parsed.achievements) ? parsed.achievements : {};

  const cleanByTrack: PlayerStats["byTrack"] = {};
  for (const [src, value] of Object.entries(byTrack)) {
    if (typeof src !== "string" || !src) continue;
    const entry = isRecord(value) ? value : {};
    cleanByTrack[src] = {
      title: typeof entry.title === "string" ? entry.title : "Unknown",
      artist: typeof entry.artist === "string" ? entry.artist : undefined,
      seconds:
        typeof entry.seconds === "number" && Number.isFinite(entry.seconds)
          ? Math.max(0, entry.seconds)
          : 0,
      plays:
        typeof entry.plays === "number" && Number.isFinite(entry.plays)
          ? Math.max(0, entry.plays)
          : 0,
    };
  }

  const cleanByArtist: PlayerStats["byArtist"] = {};
  for (const [name, value] of Object.entries(byArtist)) {
    if (typeof name !== "string" || !name) continue;
    const entry = isRecord(value) ? value : {};
    cleanByArtist[name] = {
      seconds:
        typeof entry.seconds === "number" && Number.isFinite(entry.seconds)
          ? Math.max(0, entry.seconds)
          : 0,
      plays:
        typeof entry.plays === "number" && Number.isFinite(entry.plays)
          ? Math.max(0, entry.plays)
          : 0,
    };
  }

  const cleanRecentPlays: PlayerStats["recentPlays"] = [];
  for (const value of recentPlays) {
    if (!isRecord(value)) continue;
    if (typeof value.src !== "string" || !value.src) continue;

    const playedAt =
      typeof value.playedAt === "number" && Number.isFinite(value.playedAt) ? Math.max(0, value.playedAt) : 0;
    const hour =
      typeof value.hour === "number" && Number.isFinite(value.hour)
        ? clamp(Math.floor(value.hour), 0, 23)
        : new Date(playedAt || Date.now()).getHours();

    cleanRecentPlays.push({
      src: value.src,
      playedAt,
      hour,
    });
  }

  const cleanFirstPlayedAtByTrack: PlayerStats["firstPlayedAtByTrack"] = {};
  for (const [src, value] of Object.entries(firstPlayedAtByTrack)) {
    if (!src || typeof src !== "string") continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    cleanFirstPlayedAtByTrack[src] = Math.max(0, value);
  }

  const cleanPlaysByDay: PlayerStats["playsByDay"] = {};
  for (const [day, value] of Object.entries(playsByDay)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    cleanPlaysByDay[day] = Math.max(0, Math.round(value));
  }

  const cleanAchievements: PlayerStats["achievements"] = {};
  for (const [id, value] of Object.entries(achievements)) {
    if (!id) continue;
    const entry = isRecord(value) ? value : {};
    const unlockedAt =
      typeof entry.unlockedAt === "number" && Number.isFinite(entry.unlockedAt) ? entry.unlockedAt : 0;

    if (ACHIEVEMENTS.some((achievement) => achievement.id === id)) {
      cleanAchievements[id as AchievementId] = { unlockedAt: Math.max(0, unlockedAt) };
    }
  }

  const uniqueTracksPlayed = Object.keys(cleanByTrack).filter((k) => (cleanByTrack[k]?.plays ?? 0) > 0).length;

  return computeLeaders({
    totalListenSeconds,
    totalPlays,
    uniqueTracksPlayed,
    topArtist: null,
    topTrack: null,
    byTrack: cleanByTrack,
    byArtist: cleanByArtist,
    recentPlays: cleanRecentPlays,
    firstPlayedAtByTrack: cleanFirstPlayedAtByTrack,
    playsByDay: cleanPlaysByDay,
    achievements: cleanAchievements,
  });
}

function computeLeaders(stats: PlayerStats): PlayerStats {
  let topArtist: PlayerStats["topArtist"] = null;
  for (const [name, v] of Object.entries(stats.byArtist)) {
    if (!topArtist || v.seconds > topArtist.seconds) {
      topArtist = { name, seconds: v.seconds, plays: v.plays };
    }
  }

  let topTrack: PlayerStats["topTrack"] = null;
  for (const [src, v] of Object.entries(stats.byTrack)) {
    if (!topTrack || v.seconds > topTrack.seconds) {
      topTrack = { src, title: v.title, artist: v.artist, seconds: v.seconds, plays: v.plays };
    }
  }

  return { ...stats, topArtist, topTrack };
}

function buildSmartQueue(
  library: Track[],
  stats: PlayerStats,
  favoritesMap: Record<string, Track>,
  currentSrc: string
) {
  if (library.length === 0) return [];

  const recentWindow = stats.recentPlays.slice(-30);
  const recentCountBySrc = new Map<string, number>();
  for (const event of recentWindow) {
    recentCountBySrc.set(event.src, (recentCountBySrc.get(event.src) ?? 0) + 1);
  }

  const veryRecent = new Set(
    stats.recentPlays.slice(-8).map((event) => event.src).filter((src) => src !== currentSrc)
  );
  const topArtistName = stats.topArtist?.name ?? "";

  const scored = library
    .filter((item) => item.src !== currentSrc)
    .map((item) => {
      const trackStats = stats.byTrack[item.src];
      const recentCount = recentCountBySrc.get(item.src) ?? 0;
      let score = 0;

      score += recentCount * 1.6;
      score += (trackStats?.plays ?? 0) * 0.18;
      score += favoritesMap[item.src] ? 2.2 : 0;
      if (item.artist && item.artist === topArtistName) score += 1.4;
      if (veryRecent.has(item.src)) score -= 2.6;

      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  if (scored.length === 0) return library.slice(0, 40);
  return scored.slice(0, 40);
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isAuthenticated, loading: authLoading, user } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [tracks, _setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState<number>(-1);

  const track = useMemo(
    () => (index >= 0 && index < tracks.length ? tracks[index] : null),
    [index, tracks]
  );

  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [volume, _setVolume] = useState(1);
  const [muted, _setMuted] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("midnight");
  const [fontSize, setFontSize] = useState<FontSizeMode>("md");
  const [highContrast, setHighContrast] = useState(false);
  const [eqPreset, setEqPreset] = useState<EqPreset>("off");
  const [customEqGains, setCustomEqGains] = useState<EqGains>(DEFAULT_CUSTOM_EQ_GAINS);
  const customEqGainsRef = useRef(customEqGains);
  customEqGainsRef.current = customEqGains;

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [smoothTransitions, setSmoothTransitions] = useState(true);
  const [smartAutoplay, setSmartAutoplay] = useState(true);
  const [uiSounds, setUiSounds] = useState(false);
  const uiSoundsRef = useRef(uiSounds);
  uiSoundsRef.current = uiSounds;
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const hapticsEnabledRef = useRef(hapticsEnabled);
  hapticsEnabledRef.current = hapticsEnabled;
  const [loudnessNorm, setLoudnessNorm] = useState(true);
  const [preloadedTrack, setPreloadedTrack] = useState<Track | null>(null);

  const [radioMode, setRadioModeState] = useState(false);
  const radioModeRef = useRef(false);
  radioModeRef.current = radioMode;
  const radioPreviousRepeatRef = useRef<RepeatMode>("off");

  // Browsers only let an AudioContext play sound after a direct user gesture.
  // Unlock on the very first click/keypress anywhere so favorite/achievement
  // sounds work even though they're triggered well after that gesture fires.
  useEffect(() => {
    function handleFirstInteraction() {
      unlockAudio();
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    }
    window.addEventListener("pointerdown", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);
    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, []);

  useEffect(() => {
    deviceIdRef.current = getDeviceId();
    deviceLabelRef.current = getDeviceLabel();
  }, []);

  const shuffleHistoryRef = useRef<number[]>([]);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const plannedShuffleNextRef = useRef<number | null>(null);
  const autoAdvanceArmedRef = useRef(false);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const fadeInAfterTransitionRef = useRef(false);
  const startupFadeDoneRef = useRef(false);
  const smartAutoplayBusyRef = useRef(false);
  const sharedGraphRef = useRef<SharedGraph | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const normRafRef = useRef<number | null>(null);
  const normGainSmoothedRef = useRef(1);

  // âœ… Favoris
  const [favoritesMap, setFavoritesMap] = useState<Record<string, Track>>({});
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const favorites = useMemo(
    () =>
      Object.values(favoritesMap)
        .map((item) => safeTrack(item))
        .filter((item): item is Track => item !== null),
    [favoritesMap]
  );

  // âœ… Stats
  const [statsState, setStatsState] = useState<PlayerStats>(() => emptyStats());

  // âœ… Toast succÃ¨s
  const [achievementToast, setAchievementToast] = useState<AchievementToast>(null);
  const [undoToast, setUndoToast] = useState<UndoToast>(null);
  const [queueSuggestion, setQueueSuggestion] = useState<QueueSuggestion>(null);
  const [remoteSession, setRemoteSession] = useState<RemoteSession>(null);

  // refs pour calcul delta temps
  const lastCtRef = useRef<number>(0);
  const lastSrcRef = useRef<string>("");
  const playCountedForSrcRef = useRef<string>("");
  const resumeTimeRef = useRef<number | null>(null);
  const sessionHydratedRef = useRef(false);
  const undoActionRef = useRef<(() => void) | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSuggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAchievementIdsRef = useRef<Set<AchievementId>>(new Set());
  const favoritesRemoteHydratedRef = useRef(false);
  const lastSyncedFavoritesSignatureRef = useRef("");
  const eqPresetRemoteHydratedRef = useRef(false);
  const lastSyncedEqPresetRef = useRef("");
  const lastSyncedCustomEqGainsRef = useRef("");
  const nowPlayingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsRemoteHydratedRef = useRef(false);
  const statsSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef("");
  const deviceLabelRef = useRef("Appareil");
  const remoteSessionHydratedRef = useRef(false);
  const playbackSessionPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackSessionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function dismissAchievementToast() {
    setAchievementToast(null);
  }

  function clearUndoTimer() {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }

  function clearAutoAdvanceTimer() {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }

  function clearTransitionTimer() {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }

  function clearFadeFrame() {
    if (fadeFrameRef.current) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }

  function applyEqPresetToFilters(preset: EqPreset) {
    const filters = eqFiltersRef.current;
    if (!filters.length) return;
    const gains = preset === "custom" ? customEqGainsRef.current : EQ_PRESET_GAINS[preset];
    for (let i = 0; i < filters.length; i += 1) {
      filters[i].gain.value = gains[i] ?? 0;
    }
  }

  function ensureEqGraph(audio: HTMLAudioElement | null) {
    if (!audio || typeof window === "undefined") return;

    const graph = getOrCreateSharedGraph(audio);
    if (!graph) return;
    sharedGraphRef.current = graph;
    const audioCtx = graph.ctx;
    const source = graph.source;
    const analyser = graph.analyser;

    if (eqFiltersRef.current.length === 0 || eqFiltersRef.current[0]?.context !== audioCtx) {
      eqFiltersRef.current = EQ_BANDS.map((frequency) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
      });
    }

    try {
      source.disconnect();
    } catch {}
    try {
      graph.normGain.disconnect();
    } catch {}
    try {
      graph.limiter.disconnect();
    } catch {}
    try {
      analyser.disconnect();
    } catch {}
    for (const filter of eqFiltersRef.current) {
      try {
        filter.disconnect();
      } catch {}
    }

    let node: AudioNode = source;
    for (const filter of eqFiltersRef.current) {
      node.connect(filter);
      node = filter;
    }
    node.connect(graph.normGain);
    graph.normGain.connect(graph.limiter);
    graph.limiter.connect(analyser);
    analyser.connect(audioCtx.destination);
    graph.connected = true;
    applyEqPresetToFilters(eqPreset);
  }

  function dismissUndoToast() {
    clearUndoTimer();
    undoActionRef.current = null;
    setUndoToast(null);
  }

  function showUndoToast(message: string, onUndo: () => void) {
    clearUndoTimer();
    undoActionRef.current = onUndo;
    setUndoToast({ message });

    undoTimerRef.current = setTimeout(() => {
      undoActionRef.current = null;
      setUndoToast(null);
      undoTimerRef.current = null;
    }, 7000);
  }

  function undoLastAction() {
    const action = undoActionRef.current;
    dismissUndoToast();
    if (action) action();
  }

  function clearQueueSuggestionTimer() {
    if (queueSuggestionTimerRef.current) {
      clearTimeout(queueSuggestionTimerRef.current);
      queueSuggestionTimerRef.current = null;
    }
  }

  function dismissQueueSuggestion() {
    clearQueueSuggestionTimer();
    setQueueSuggestion(null);
  }

  function acceptQueueSuggestion() {
    setQueueSuggestion((current) => {
      if (current) addToQueueNext(current.track);
      return current;
    });
    dismissQueueSuggestion();
  }

  async function suggestTrackToUser(targetUserId: string, targetTrack: Track): Promise<boolean> {
    if (!accessToken || !targetTrack) return false;
    try {
      const res = await fetch("/api/queue/suggest", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          targetUserId,
          trackTitle: targetTrack.title,
          trackArtist: targetTrack.artist ?? "",
          trackSrc: targetTrack.src,
          trackCover: targetTrack.cover ?? "",
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      return Boolean(res.ok && json.ok);
    } catch {
      return false;
    }
  }

  function dismissRemoteSession() {
    setRemoteSession(null);
  }

  function resumeOnThisDevice() {
    if (!remoteSession) return;
    resumeTimeRef.current = remoteSession.position;
    playTrack(remoteSession.track);
    setRemoteSession(null);

    if (accessToken) {
      void fetch("/api/playback-session", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          track: {
            title: remoteSession.track.title,
            artist: remoteSession.track.artist ?? null,
            cover: remoteSession.track.cover ?? null,
            src: remoteSession.track.src,
          },
          position: remoteSession.position,
          duration: 0,
          deviceId: deviceIdRef.current,
          deviceLabel: deviceLabelRef.current,
          takeover: true,
        }),
      }).catch(() => {});
    }
  }

  function unlockAchievement(id: AchievementId) {
    const alreadyUnlocked = Boolean(statsState.achievements?.[id]);

    setStatsState((prev) => {
      if (prev.achievements?.[id]) return prev;

      const unlockedAt = Date.now();
      return computeLeaders({
        ...prev,
        achievements: { ...(prev.achievements ?? {}), [id]: { unlockedAt } },
      });
    });

    if (!alreadyUnlocked) {
      if (hapticsEnabledRef.current) vibrate([15, 40, 15]);
      if (uiSoundsRef.current) playChimeSound();
    }
  }

  function markPlaylistCreated() {
    unlockAchievement("first_playlist");
  }

  function pickRandomIndex(exclude: number) {
    if (tracks.length <= 1) return exclude;
    let r = exclude;
    while (r === exclude) r = Math.floor(Math.random() * tracks.length);
    return r;
  }

  function getPlannedShuffleNext(currentIndex: number) {
    const planned = plannedShuffleNextRef.current;
    if (
      typeof planned === "number" &&
      planned >= 0 &&
      planned < tracks.length &&
      planned !== currentIndex
    ) {
      return planned;
    }

    const nextIdx = pickRandomIndex(currentIndex);
    plannedShuffleNextRef.current = nextIdx;
    return nextIdx;
  }

  function consumePlannedShuffleNext(currentIndex: number) {
    const nextIdx = getPlannedShuffleNext(currentIndex);
    plannedShuffleNextRef.current = null;
    return nextIdx;
  }

  function peekNextIndex(currentIndex: number) {
    if (tracks.length === 0) return null;
    if (currentIndex < 0) return tracks.length > 0 ? 0 : null;

    if (shuffle) return getPlannedShuffleNext(currentIndex);

    const last = tracks.length - 1;
    if (currentIndex < last) return currentIndex + 1;
    if (repeat === "all") return 0;
    return null;
  }

  async function buildAndStartSmartQueue(currentSrc: string) {
    if (smartAutoplayBusyRef.current) return false;
    smartAutoplayBusyRef.current = true;

    try {
      const apiTracks = await fetchTracksShared(accessToken);
      const library: Track[] = apiTracks.map((item) => ({
        title: item.title,
        artist: item.artist,
        src: item.src,
        cover: item.cover ?? undefined,
        ownerDisplayName: item.ownerDisplayName ?? undefined,
        ownerId: item.ownerId ?? undefined,
        credits: item.credits ?? undefined,
      }));

      const queue = buildSmartQueue(library, statsState, favoritesMap, currentSrc);
      if (queue.length === 0) return false;

      setQueueAndPlay(queue, 0);
      toast("Lecture intelligente : la suite selon tes gouts", "music");
      return true;
    } catch {
      return false;
    } finally {
      smartAutoplayBusyRef.current = false;
    }
  }

  async function startSmartAutoplay(currentSrc: string) {
    if (!smartAutoplay) return false;
    return buildAndStartSmartQueue(currentSrc);
  }

  type RadioLiveTrackInfo = {
    src: string;
    title: string;
    artist: string;
    cover: string | null;
    ownerDisplayName: string | null;
    offsetSeconds: number;
  };

  async function fetchRadioLiveTrack(): Promise<RadioLiveTrackInfo | null> {
    try {
      const res = await fetch("/api/radio/live", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok || !json.track?.src) return null;
      return {
        src: json.track.src,
        title: json.track.title ?? "Radio en direct",
        artist: json.track.artist ?? "",
        cover: json.track.cover ?? null,
        ownerDisplayName: json.track.ownerDisplayName ?? null,
        offsetSeconds: typeof json.offsetSeconds === "number" ? json.offsetSeconds : 0,
      };
    } catch {
      return null;
    }
  }

  function playRadioTrack(data: RadioLiveTrackInfo) {
    resumeTimeRef.current = data.offsetSeconds > 0 ? data.offsetSeconds : null;
    setQueueAndPlay(
      [
        {
          title: data.title,
          artist: data.artist || undefined,
          src: data.src,
          cover: data.cover || undefined,
          ownerDisplayName: data.ownerDisplayName || undefined,
        },
      ],
      0
    );
  }

  async function applyRadioSync() {
    if (!radioModeRef.current) return;
    const data = await fetchRadioLiveTrack();
    if (!data || !radioModeRef.current) return;

    if (lastSrcRef.current !== data.src) {
      playRadioTrack(data);
      return;
    }

    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      if (Math.abs(audio.currentTime - data.offsetSeconds) > 6) {
        audio.currentTime = clamp(data.offsetSeconds, 0, audio.duration);
        lastCtRef.current = audio.currentTime;
      }
    }
  }

  async function tuneInRadio(): Promise<boolean> {
    const data = await fetchRadioLiveTrack();
    if (!data) return false;

    radioPreviousRepeatRef.current = repeat;
    setRepeat("one");
    setRadioModeState(true);
    playRadioTrack(data);
    return true;
  }

  function leaveRadio() {
    setRadioModeState(false);
    setRepeat(radioPreviousRepeatRef.current);
  }

  // Keeps the live radio in sync with the shared schedule: advances to the
  // next scheduled track (or corrects drift) every few seconds, regardless
  // of which page is currently mounted.
  useEffect(() => {
    if (!radioMode) return;
    const id = setInterval(() => {
      void applyRadioSync();
    }, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioMode]);

  useEffect(() => {
    return () => {
      clearUndoTimer();
      clearAutoAdvanceTimer();
      clearTransitionTimer();
      clearFadeFrame();
      audioRef.current?.pause();
      preloadAudioRef.current?.pause();

      const graph = sharedGraphRef.current;
      try {
        graph?.source.disconnect();
      } catch {}
      try {
        graph?.analyser.disconnect();
      } catch {}
      for (const filter of eqFiltersRef.current) {
        try {
          filter.disconnect();
        } catch {}
      }
      eqFiltersRef.current = [];
      if (graph) {
        graph.connected = false;
      }
      sharedGraphRef.current = null;
    };
  }, []);

  // init audio once + listeners
  useEffect(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    if (!preloadAudioRef.current) preloadAudioRef.current = new Audio();
    const audio = audioRef.current;
    const preloadAudio = preloadAudioRef.current;
    audio.crossOrigin = "anonymous";
    preloadAudio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    preloadAudio.preload = "auto";
    ensureEqGraph(audio);

    const onTime = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0;
      const ct = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      setDuration(d);
      setCurrentTime(ct);
      setProgress(d > 0 ? ct / d : 0);

      // stats: temps d'Ã©coute seulement si playing + track
      const src = track?.src ?? "";
      if (!playing || !src) {
        lastCtRef.current = ct;
        lastSrcRef.current = src;
        return;
      }

      // si track change, reset base
      if (lastSrcRef.current !== src) {
        lastSrcRef.current = src;
        lastCtRef.current = ct;
        return;
      }

      const prevCt = lastCtRef.current;
      const delta = ct - prevCt;

      // ignore seek/jumps
      if (!Number.isFinite(delta) || delta <= 0 || delta > 1.2) {
        lastCtRef.current = ct;
        return;
      }

      lastCtRef.current = ct;

      setStatsState((prev) => {
        const next: PlayerStats = {
          ...prev,
          totalListenSeconds: prev.totalListenSeconds + delta,
          byTrack: { ...prev.byTrack },
          byArtist: { ...prev.byArtist },
          recentPlays: prev.recentPlays,
          firstPlayedAtByTrack: prev.firstPlayedAtByTrack,
          playsByDay: prev.playsByDay,
          achievements: { ...(prev.achievements ?? {}) },
          uniqueTracksPlayed: prev.uniqueTracksPlayed,
          totalPlays: prev.totalPlays,
          topArtist: prev.topArtist,
          topTrack: prev.topTrack,
        };

        // byTrack
        const existingT = next.byTrack[src] ?? {
          title: track?.title ?? "Unknown",
          artist: track?.artist,
          seconds: 0,
          plays: 0,
        };
        next.byTrack[src] = {
          ...existingT,
          title: track?.title ?? existingT.title,
          artist: track?.artist ?? existingT.artist,
          seconds: (existingT.seconds ?? 0) + delta,
        };

        // byArtist
        const artistName = normalizeArtist(track?.artist);
        const existingA = next.byArtist[artistName] ?? { seconds: 0, plays: 0 };
        next.byArtist[artistName] = {
          ...existingA,
          seconds: existingA.seconds + delta,
        };

        const uniqueTracksPlayed = Object.keys(next.byTrack).filter((k) => (next.byTrack[k]?.plays ?? 0) > 0).length;
        const computed = computeLeaders({ ...next, uniqueTracksPlayed });

        return computed;
      });

      if (!smoothTransitions || !playing || !track || repeat === "one") return;
      if (autoAdvanceArmedRef.current) return;
      if (!Number.isFinite(d) || d <= 0) return;

      const remaining = d - ct;
      if (!Number.isFinite(remaining) || remaining > SOFT_CROSSFADE_LEAD || remaining <= 0) return;

      const nextIdx = peekNextIndex(index);
      if (nextIdx === null) return;

      autoAdvanceArmedRef.current = true;
      clearAutoAdvanceTimer();
      clearTransitionTimer();
      clearFadeFrame();

      const transitionMs = Math.max(140, Math.min(SOFT_CROSSFADE_MS, remaining * 1000));
      const start = performance.now();
      const fromVolume = muted ? 0 : clamp(volume, 0, 1);

      if (fromVolume > 0 && !muted) {
        const fadeOut = (now: number) => {
          const ratio = clamp((now - start) / transitionMs, 0, 1);
          audio.volume = clamp(fromVolume * (1 - ratio), 0, 1);
          if (ratio < 1 && autoAdvanceArmedRef.current) {
            fadeFrameRef.current = window.requestAnimationFrame(fadeOut);
          } else {
            fadeFrameRef.current = null;
          }
        };
        fadeFrameRef.current = window.requestAnimationFrame(fadeOut);
      }

      autoAdvanceTimerRef.current = setTimeout(() => {
        fadeInAfterTransitionRef.current = true;
        doNext(true);
        autoAdvanceArmedRef.current = false;
      }, Math.max(40, transitionMs - 40));
    };

    const onPlay = () => {
      const src = track?.src ?? "";
      if (!src) return;

      if (fadeInAfterTransitionRef.current) {
        fadeInAfterTransitionRef.current = false;
        clearFadeFrame();

        const target = muted ? 0 : clamp(volume, 0, 1);
        const fadeMs = 260;
        const start = performance.now();

        audio.volume = 0;
        audio.muted = false;

        const fadeIn = (now: number) => {
          const ratio = clamp((now - start) / fadeMs, 0, 1);
          audio.volume = clamp(target * ratio, 0, 1);
          if (ratio < 1) {
            fadeFrameRef.current = window.requestAnimationFrame(fadeIn);
          } else {
            audio.muted = muted;
            fadeFrameRef.current = null;
          }
        };

        if (target > 0) {
          fadeFrameRef.current = window.requestAnimationFrame(fadeIn);
        } else {
          audio.muted = muted;
        }
      }

      const ct = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      if (ct > 1.2) return;

      if (playCountedForSrcRef.current === src) return;
      playCountedForSrcRef.current = src;

      const hour = new Date().getHours();
      const playedAt = Date.now();

      setStatsState((prev) => {
        const next: PlayerStats = {
          ...prev,
          totalPlays: prev.totalPlays + 1,
          byTrack: { ...prev.byTrack },
          byArtist: { ...prev.byArtist },
          recentPlays: [...prev.recentPlays],
          firstPlayedAtByTrack: { ...prev.firstPlayedAtByTrack },
          playsByDay: { ...prev.playsByDay },
          achievements: { ...(prev.achievements ?? {}) },
          uniqueTracksPlayed: prev.uniqueTracksPlayed,
          totalListenSeconds: prev.totalListenSeconds,
          topArtist: prev.topArtist,
          topTrack: prev.topTrack,
        };

        const existingT = next.byTrack[src] ?? {
          title: track?.title ?? "Unknown",
          artist: track?.artist,
          seconds: 0,
          plays: 0,
        };
        next.byTrack[src] = {
          ...existingT,
          title: track?.title ?? existingT.title,
          artist: track?.artist ?? existingT.artist,
          plays: (existingT.plays ?? 0) + 1,
        };

        const dayKey = getDayKey(playedAt);
        next.playsByDay[dayKey] = (next.playsByDay[dayKey] ?? 0) + 1;

        const artistName = normalizeArtist(track?.artist);
        const existingA = next.byArtist[artistName] ?? { seconds: 0, plays: 0 };
        next.byArtist[artistName] = {
          ...existingA,
          plays: existingA.plays + 1,
        };

        next.recentPlays.push({ src, playedAt, hour });
        if (next.recentPlays.length > MAX_RECENT_PLAYS) {
          next.recentPlays.splice(0, next.recentPlays.length - MAX_RECENT_PLAYS);
        }
        if (!next.firstPlayedAtByTrack[src]) {
          next.firstPlayedAtByTrack[src] = playedAt;
        }

        const uniqueTracksPlayed = Object.keys(next.byTrack).filter((k) => (next.byTrack[k]?.plays ?? 0) > 0).length;
        const computed = computeLeaders({ ...next, uniqueTracksPlayed });

        return computed;
      });

      if (hour >= 0 && hour < 6) {
        unlockAchievement("night_listen");
      }
    };

    const onEnded = () => {
      playCountedForSrcRef.current = "";
      autoAdvanceArmedRef.current = false;
      clearAutoAdvanceTimer();
      clearTransitionTimer();
      clearFadeFrame();

      if (repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      doNext(true);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      clearAutoAdvanceTimer();
      clearTransitionTimer();
      clearFadeFrame();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat, playing, smoothTransitions, track, volume, muted, index, shuffle, tracks.length]);

  // volume / mute apply
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = clamp(volume, 0, 1);
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    ensureEqGraph(audio);
    applyEqPresetToFilters(eqPreset);

    const audioCtx = sharedGraphRef.current?.ctx ?? null;
    if (playing && audioCtx?.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqPreset, playing, customEqGains]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.mp3Theme = theme;
    document.documentElement.dataset.mp3Theme = theme;
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.mp3FontSize = fontSize;
  }, [fontSize]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.mp3Contrast = highContrast ? "high" : "normal";
  }, [highContrast]);

  // preload next track for smoother transitions
  useEffect(() => {
    const preloadAudio = preloadAudioRef.current;
    if (!preloadAudio) return;

    const nextIdx = peekNextIndex(index);
    if (nextIdx === null || nextIdx < 0 || nextIdx >= tracks.length) {
      preloadAudio.src = "";
      setPreloadedTrack(null);
      return;
    }

    const nextTrack = tracks[nextIdx];
    setPreloadedTrack(nextTrack);

    if (!preloadAudio.src.endsWith(nextTrack.src)) {
      preloadAudio.src = nextTrack.src;
      preloadAudio.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, index, shuffle, repeat]);

  // load favorites
  useEffect(() => {
    let cancelled = false;

    function hydrateLocalFavorites() {
      try {
        const raw = localStorage.getItem(LS_FAV);
        if (!raw) {
          setFavoritesMap({});
          setFavoritesHydrated(true);
          return;
        }

        const parsed = JSON.parse(raw);
        setFavoritesMap(sanitizeFavoritesMap(parsed));
        setFavoritesHydrated(true);
        return;
      } catch {}

      setFavoritesMap({});
      setFavoritesHydrated(true);
    }

    async function hydrateRemoteFavorites() {
      try {
        const res = await fetch("/api/account", {
          cache: "no-store",
          headers: createAuthorizedHeaders(accessToken),
        });
        if (!res.ok) {
          favoritesRemoteHydratedRef.current = false;
          hydrateLocalFavorites();
          return;
        }

        const json = (await res.json()) as AccountResponse;
        const nextFavorites = tracksToFavoritesMap(Array.isArray(json.favoriteTracks) ? json.favoriteTracks : []);
        if (cancelled) return;

        lastSyncedFavoritesSignatureRef.current = JSON.stringify(Object.keys(nextFavorites).sort());
        favoritesRemoteHydratedRef.current = true;
        setFavoritesMap(nextFavorites);
        setFavoritesHydrated(true);
      } catch {
        favoritesRemoteHydratedRef.current = false;
        if (!cancelled) {
          hydrateLocalFavorites();
        }
      }
    }

    if (authLoading) return;

    setFavoritesHydrated(false);

    if (!isAuthenticated || !accessToken) {
      favoritesRemoteHydratedRef.current = false;
      lastSyncedFavoritesSignatureRef.current = "";
      hydrateLocalFavorites();
      return;
    }

    void hydrateRemoteFavorites();

    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, isAuthenticated]);

  // persist favorites
  useEffect(() => {
    if (!favoritesHydrated) {
      return;
    }

    try {
      localStorage.setItem(LS_FAV, JSON.stringify(favoritesMap));
    } catch {}
  }, [favoritesHydrated, favoritesMap]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !accessToken || !favoritesRemoteHydratedRef.current) {
      return;
    }

    const favoriteSrcs = Object.keys(favoritesMap).sort();
    const signature = JSON.stringify(favoriteSrcs);
    if (signature === lastSyncedFavoritesSignatureRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetch("/api/account", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ favoriteSrcs }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("favorite sync failed");
          }

          lastSyncedFavoritesSignatureRef.current = signature;
        })
        .catch(() => {});
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [accessToken, authLoading, favoritesMap, isAuthenticated]);

  // hydrate eq preset from the account when signed in
  useEffect(() => {
    let cancelled = false;

    async function hydrateRemoteEqPreset() {
      try {
        const res = await fetch("/api/account", {
          cache: "no-store",
          headers: createAuthorizedHeaders(accessToken),
        });
        if (!res.ok) {
          eqPresetRemoteHydratedRef.current = false;
          return;
        }

        const json = await res.json();
        if (cancelled) return;

        const remoteEqPreset = json.eqPreset;
        if (
          remoteEqPreset === "off" ||
          remoteEqPreset === "bass" ||
          remoteEqPreset === "vocal" ||
          remoteEqPreset === "night" ||
          remoteEqPreset === "custom"
        ) {
          lastSyncedEqPresetRef.current = remoteEqPreset;
          setEqPreset(remoteEqPreset);
        } else {
          lastSyncedEqPresetRef.current = "";
        }

        const remoteCustomEqGains = normalizeCustomEqGains(json.customEqGains);
        if (Array.isArray(json.customEqGains)) {
          lastSyncedCustomEqGainsRef.current = JSON.stringify(remoteCustomEqGains);
          setCustomEqGains(remoteCustomEqGains);
        } else {
          lastSyncedCustomEqGainsRef.current = "";
        }

        eqPresetRemoteHydratedRef.current = true;
      } catch {
        eqPresetRemoteHydratedRef.current = false;
      }
    }

    if (authLoading) return;

    if (!isAuthenticated || !accessToken) {
      eqPresetRemoteHydratedRef.current = false;
      lastSyncedEqPresetRef.current = "";
      lastSyncedCustomEqGainsRef.current = "";
      return;
    }

    void hydrateRemoteEqPreset();

    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, isAuthenticated]);

  // push eq preset + custom gains changes to the account
  useEffect(() => {
    if (authLoading || !isAuthenticated || !accessToken || !eqPresetRemoteHydratedRef.current) {
      return;
    }

    const customEqGainsSignature = JSON.stringify(customEqGains);
    const presetChanged = eqPreset !== lastSyncedEqPresetRef.current;
    const gainsChanged = customEqGainsSignature !== lastSyncedCustomEqGainsRef.current;
    if (!presetChanged && !gainsChanged) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetch("/api/account", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ eqPreset, customEqGains }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("eq preset sync failed");
          }

          lastSyncedEqPresetRef.current = eqPreset;
          lastSyncedCustomEqGainsRef.current = customEqGainsSignature;
        })
        .catch(() => {});
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [accessToken, authLoading, eqPreset, customEqGains, isAuthenticated]);

  // listen for collaborative queue suggestions from other users (Realtime Broadcast)
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const supabase = getSupabaseBrowserAuthClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`user:${user.id}`)
      .on("broadcast", { event: "queue_suggestion" }, ({ payload }) => {
        const data = payload as {
          id?: string;
          fromUserId?: string;
          fromDisplayName?: string;
          track?: { title?: string; artist?: string; src?: string; cover?: string };
        };
        if (!data?.id || !data.fromUserId || !data.fromDisplayName || !data.track?.title || !data.track?.src) return;

        clearQueueSuggestionTimer();
        setQueueSuggestion({
          id: data.id,
          fromUserId: data.fromUserId,
          fromDisplayName: data.fromDisplayName,
          track: {
            title: data.track.title,
            artist: data.track.artist,
            src: data.track.src,
            cover: data.track.cover,
          },
        });

        queueSuggestionTimerRef.current = setTimeout(() => {
          setQueueSuggestion(null);
          queueSuggestionTimerRef.current = null;
        }, 20000);
      })
      .on("broadcast", { event: "session_update" }, ({ payload }) => {
        const data = payload as {
          session?: { track?: Track; position?: number; deviceId?: string; deviceLabel?: string; updatedAt?: number };
        };
        const session = data?.session;
        if (!session?.track?.title || !session.track.src || !session.deviceId) return;
        if (session.deviceId === deviceIdRef.current) return;

        setRemoteSession({
          track: session.track,
          position: session.position ?? 0,
          deviceLabel: session.deviceLabel ?? "Un autre appareil",
          updatedAt: session.updatedAt ?? Date.now(),
        });
      })
      .on("broadcast", { event: "session_takeover" }, ({ payload }) => {
        const data = payload as { deviceId?: string };
        if (!data?.deviceId || data.deviceId === deviceIdRef.current) return;
        setPlaying(false);
        setRemoteSession(null);
      })
      .subscribe();

    return () => {
      clearQueueSuggestionTimer();
      void supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user?.id]);

  // load stats (localStorage first, then merge remote if authenticated)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_STATS);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const safe = safeStats(parsed);
      shownAchievementIdsRef.current = new Set(
        ACHIEVEMENTS.filter((achievement) => Boolean(safe.achievements[achievement.id])).map(
          (achievement) => achievement.id
        )
      );
      setStatsState(safe);
    } catch {}
  }, []);

  // load remote stats on auth (use whichever has more plays)
  useEffect(() => {
    if (authLoading || !isAuthenticated || !accessToken) return;
    if (statsRemoteHydratedRef.current) return;
    statsRemoteHydratedRef.current = true;

    void fetch("/api/stats", {
      cache: "no-store",
      headers: createAuthorizedHeaders(accessToken),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { stats?: unknown } | null) => {
        if (!data?.stats) return;
        const remote = safeStats(data.stats);
        setStatsState((local) => {
          if (remote.totalPlays > local.totalPlays) {
            shownAchievementIdsRef.current = new Set(
              ACHIEVEMENTS.filter((a) => Boolean(remote.achievements[a.id])).map((a) => a.id)
            );
            return remote;
          }
          return local;
        });
      })
      .catch(() => {});
  }, [authLoading, isAuthenticated, accessToken]);

  // push stats to server every 3 minutes while authenticated
  useEffect(() => {
    if (authLoading || !isAuthenticated || !accessToken) return;

    if (statsSyncTimerRef.current) clearTimeout(statsSyncTimerRef.current);
    statsSyncTimerRef.current = setTimeout(() => {
      void fetch("/api/stats", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify(statsState),
      }).catch(() => {});
    }, 180_000);

    return () => {
      if (statsSyncTimerRef.current) clearTimeout(statsSyncTimerRef.current);
    };
  }, [authLoading, isAuthenticated, accessToken, statsState]);

  // load UI/audio prefs
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PREFS);
      if (!raw) return;
      const prefs = safePrefs(JSON.parse(raw));
      setFocusMode(prefs.focusMode);
      setSmoothTransitions(prefs.smoothTransitions);
      setSmartAutoplay(prefs.smartAutoplay);
      setUiSounds(prefs.uiSounds);
      setHapticsEnabled(prefs.hapticsEnabled);
      setLoudnessNorm(prefs.loudnessNorm);
      setTheme(prefs.theme);
      setFontSize(prefs.fontSize);
      setHighContrast(prefs.highContrast);
      setEqPreset(prefs.eqPreset);
      setCustomEqGains(prefs.customEqGains);
    } catch {}
  }, []);

  // load playback session
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (!raw) {
        sessionHydratedRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw);
      const session = safeSession(parsed);
      if (!session) {
        sessionHydratedRef.current = true;
        return;
      }

      _setTracks(session.tracks);
      shuffleHistoryRef.current = [];
      plannedShuffleNextRef.current = null;

      const safeIndex =
        session.tracks.length === 0 ? -1 : clamp(session.index, 0, session.tracks.length - 1);
      setIndex(safeIndex);
      setPlaying(false);

      _setVolume(session.volume);
      _setMuted(session.muted);
      setShuffle(session.shuffle);
      setRepeat(session.repeat);

      resumeTimeRef.current = safeIndex >= 0 ? session.currentTime : null;
    } catch {
      // ignore malformed session
    } finally {
      sessionHydratedRef.current = true;
    }
  }, []);

  // persist stats
  useEffect(() => {
    try {
      localStorage.setItem(LS_STATS, JSON.stringify(statsState));
    } catch {}
  }, [statsState]);

  useEffect(() => {
    if (statsState.totalPlays >= 10 && !statsState.achievements?.plays_10) {
      unlockAchievement("plays_10");
    }
    if (statsState.totalListenSeconds >= 3600 && !statsState.achievements?.listen_1h) {
      unlockAchievement("listen_1h");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unlockAchievement is redefined every render; only the tracked stats should retrigger this
  }, [
    statsState.totalPlays,
    statsState.totalListenSeconds,
    statsState.achievements?.plays_10,
    statsState.achievements?.listen_1h,
  ]);

  useEffect(() => {
    if (favorites.length > 0 && !statsState.achievements?.first_favorite) {
      unlockAchievement("first_favorite");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unlockAchievement is redefined every render; only these two values should retrigger this
  }, [favorites.length, statsState.achievements?.first_favorite]);

  useEffect(() => {
    for (const def of ACHIEVEMENTS) {
      if (!statsState.achievements?.[def.id]) continue;
      if (shownAchievementIdsRef.current.has(def.id)) continue;
      shownAchievementIdsRef.current.add(def.id);
      setAchievementToast({ id: def.id, title: def.title, desc: def.desc, icon: def.icon });
      break;
    }
  }, [statsState.achievements]);

  // sync now-playing to server
  useEffect(() => {
    if (authLoading || !isAuthenticated || !accessToken) return;

    if (nowPlayingTimerRef.current) clearTimeout(nowPlayingTimerRef.current);

    if (!track || !playing) {
      nowPlayingTimerRef.current = setTimeout(() => {
        void fetch("/api/now-playing", {
          method: "DELETE",
          headers: createAuthorizedHeaders(accessToken),
        }).catch(() => {});
      }, 12_000);
      return () => {
        if (nowPlayingTimerRef.current) clearTimeout(nowPlayingTimerRef.current);
      };
    }

    nowPlayingTimerRef.current = setTimeout(() => {
      void fetch("/api/now-playing", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: track.title,
          artist: track.artist ?? null,
          cover: track.cover ?? null,
          src: track.src,
        }),
      }).catch(() => {});
    }, 1500);

    return () => {
      if (nowPlayingTimerRef.current) clearTimeout(nowPlayingTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on track?.src only, not the whole track object
  }, [track?.src, playing, isAuthenticated, accessToken, authLoading]);

  // hydrate cross-device playback session once per auth session (offers a "resume here" prompt)
  useEffect(() => {
    if (authLoading || !isAuthenticated || !accessToken) return;
    if (remoteSessionHydratedRef.current) return;
    remoteSessionHydratedRef.current = true;

    void fetch("/api/playback-session", {
      cache: "no-store",
      headers: createAuthorizedHeaders(accessToken),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { session?: { track?: Track; position?: number; deviceId?: string; deviceLabel?: string; updatedAt?: number } } | null) => {
        const session = data?.session;
        if (!session?.track?.title || !session.track.src || !session.deviceId) return;
        if (session.deviceId === deviceIdRef.current) return;

        setRemoteSession({
          track: session.track,
          position: session.position ?? 0,
          deviceLabel: session.deviceLabel ?? "Un autre appareil",
          updatedAt: session.updatedAt ?? Date.now(),
        });
      })
      .catch(() => {});
  }, [authLoading, isAuthenticated, accessToken]);

  // register this device in the "active sessions" list (immediately, then every 5 min)
  useEffect(() => {
    if (authLoading || !isAuthenticated || !accessToken) return;

    function sendHeartbeat() {
      void fetch("/api/sessions", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken!, { "Content-Type": "application/json" }),
        body: JSON.stringify({ deviceId: deviceIdRef.current, deviceLabel: deviceLabelRef.current }),
      }).catch(() => {});
    }

    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, 5 * 60_000);
    return () => clearInterval(intervalId);
  }, [authLoading, isAuthenticated, accessToken]);

  // push local playback position to the server (debounced on change + periodic while playing)
  useEffect(() => {
    if (authLoading || !isAuthenticated || !accessToken || !track) return;

    function pushSession() {
      const audio = audioRef.current;
      void fetch("/api/playback-session", {
        method: "PUT",
        headers: createAuthorizedHeaders(accessToken!, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          track: { title: track!.title, artist: track!.artist ?? null, cover: track!.cover ?? null, src: track!.src },
          position: audio?.currentTime ?? 0,
          duration: audio?.duration ?? 0,
          deviceId: deviceIdRef.current,
          deviceLabel: deviceLabelRef.current,
        }),
      }).catch(() => {});
    }

    if (playbackSessionPushTimerRef.current) clearTimeout(playbackSessionPushTimerRef.current);
    playbackSessionPushTimerRef.current = setTimeout(pushSession, 2000);

    if (playbackSessionIntervalRef.current) clearInterval(playbackSessionIntervalRef.current);
    if (playing) {
      playbackSessionIntervalRef.current = setInterval(pushSession, 20_000);
    }

    return () => {
      if (playbackSessionPushTimerRef.current) clearTimeout(playbackSessionPushTimerRef.current);
      if (playbackSessionIntervalRef.current) clearInterval(playbackSessionIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on track?.src/playing only; position is read live from audioRef
  }, [track?.src, playing, isAuthenticated, accessToken, authLoading]);

  // persist prefs
  useEffect(() => {
    const payload: PlayerPrefs = {
      focusMode,
      smoothTransitions,
      smartAutoplay,
      uiSounds,
      hapticsEnabled,
      loudnessNorm,
      theme,
      fontSize,
      highContrast,
      eqPreset,
      customEqGains,
    };
    try {
      localStorage.setItem(LS_PREFS, JSON.stringify(payload));
    } catch {}
  }, [
    focusMode,
    smoothTransitions,
    smartAutoplay,
    uiSounds,
    hapticsEnabled,
    loudnessNorm,
    theme,
    fontSize,
    highContrast,
    eqPreset,
    customEqGains,
  ]);

  // persist playback session
  useEffect(() => {
    if (!sessionHydratedRef.current) return;

    const session: PlayerSession = {
      tracks,
      index,
      currentTime,
      volume,
      muted,
      shuffle,
      repeat,
    };

    try {
      localStorage.setItem(LS_SESSION, JSON.stringify(session));
    } catch {}
  }, [tracks, index, currentTime, volume, muted, shuffle, repeat]);

  // when selected track source changes => load track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const trackSrc = track?.src ?? "";
    autoAdvanceArmedRef.current = false;
    clearAutoAdvanceTimer();
    clearTransitionTimer();
    clearFadeFrame();

    lastCtRef.current = 0;
    lastSrcRef.current = trackSrc;
    playCountedForSrcRef.current = "";

    if (!trackSrc) {
      audio.pause();
      audio.src = "";
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    if (fadeInAfterTransitionRef.current && !muted) {
      audio.volume = 0;
      audio.muted = false;
    } else {
      audio.volume = clamp(volume, 0, 1);
      audio.muted = muted;
    }

    audio.src = trackSrc;
    audio.currentTime = 0;

    const resumeAt = resumeTimeRef.current;
    if (typeof resumeAt === "number" && Number.isFinite(resumeAt) && resumeAt > 0) {
      const applyResume = () => {
        const d = Number.isFinite(audio.duration) ? audio.duration : resumeAt;
        audio.currentTime = clamp(resumeAt, 0, d > 0 ? d : resumeAt);
        lastCtRef.current = audio.currentTime;
      };

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        applyResume();
      } else {
        audio.addEventListener("loadedmetadata", applyResume, { once: true });
      }
      resumeTimeRef.current = null;
    }

    if (playing) {
      audio.play().catch(() => setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, track?.src]);

  // play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;

    if (!playing) {
      audio.pause();
      return;
    }

    if (startupFadeDoneRef.current) {
      audio.play().catch(() => setPlaying(false));
      return;
    }

    startupFadeDoneRef.current = true;
    const targetVolume = muted ? 0 : clamp(volume, 0, 1);
    if (targetVolume <= 0) {
      audio.play().catch(() => setPlaying(false));
      return;
    }

    audio.volume = 0;
    audio.play().catch(() => setPlaying(false));

    const fadeMs = 900;
    const start = performance.now();
    clearFadeFrame();
    const fadeIn = (now: number) => {
      const ratio = clamp((now - start) / fadeMs, 0, 1);
      audio.volume = clamp(targetVolume * ratio, 0, 1);
      if (ratio < 1) {
        fadeFrameRef.current = window.requestAnimationFrame(fadeIn);
      } else {
        fadeFrameRef.current = null;
      }
    };
    fadeFrameRef.current = window.requestAnimationFrame(fadeIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, track]);

  // normalisation du volume entre morceaux : ajuste en douceur un gain partagÃ©
  // pour viser un niveau sonore perÃ§u constant, avec un limiteur en sÃ©curitÃ©
  useEffect(() => {
    const graph = sharedGraphRef.current;

    if (!playing || !loudnessNorm) {
      if (normRafRef.current) {
        window.cancelAnimationFrame(normRafRef.current);
        normRafRef.current = null;
      }
      if (graph) graph.normGain.gain.value = 1;
      normGainSmoothedRef.current = 1;
      return;
    }

    if (!graph) return;

    const data = new Float32Array(graph.analyser.fftSize);
    const targetRms = 0.12;
    const minGain = 0.6;
    const maxGain = 1.6;

    const tick = () => {
      graph.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);

      if (rms > 0.002) {
        const desired = clamp(targetRms / rms, minGain, maxGain);
        normGainSmoothedRef.current += (desired - normGainSmoothedRef.current) * 0.01;
        graph.normGain.gain.value = clamp(normGainSmoothedRef.current, minGain, maxGain);
      }

      normRafRef.current = window.requestAnimationFrame(tick);
    };

    normRafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (normRafRef.current) {
        window.cancelAnimationFrame(normRafRef.current);
        normRafRef.current = null;
      }
    };
  }, [playing, loudnessNorm]);

  // intÃ©gration MediaSession : contrÃ´les depuis l'Ã©cran de verrouillage / la
  // notification mÃ©dia du systÃ¨me (mobile et desktop)
  const mediaSessionActionsRef = useRef({ togglePlay, next, prev });
  mediaSessionActionsRef.current = { togglePlay, next, prev };

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    ms.setActionHandler("play", () => mediaSessionActionsRef.current.togglePlay());
    ms.setActionHandler("pause", () => mediaSessionActionsRef.current.togglePlay());
    ms.setActionHandler("previoustrack", () => mediaSessionActionsRef.current.prev());
    ms.setActionHandler("nexttrack", () => mediaSessionActionsRef.current.next());
    try {
      ms.setActionHandler("seekto", (details) => {
        const audio = audioRef.current;
        if (audio && typeof details.seekTime === "number") {
          audio.currentTime = details.seekTime;
        }
      });
    } catch {}

    return () => {
      try {
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("previoustrack", null);
        ms.setActionHandler("nexttrack", null);
        ms.setActionHandler("seekto", null);
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    if (!track) {
      ms.metadata = null;
      return;
    }

    ms.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || "",
      album: ".mp3",
      artwork: track.cover ? [{ src: track.cover, sizes: "512x512", type: "image/png" }] : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on these fields only, not the whole track object
  }, [track?.title, track?.artist, track?.cover]);

  // titre de l'onglet : montre ce qui joue sans avoir besoin de cliquer sur l'onglet
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (!track) {
      document.title = ".mp3";
      return;
    }

    const icon = playing ? "▶" : "❚❚";
    document.title = `${icon} ${track.title}${track.artist ? ` - ${track.artist}` : ""} . mp3`;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on these fields only, not the whole track object
  }, [track?.title, track?.artist, playing]);

  function createQueueSnapshot() {
    return {
      tracks: [...tracks],
      index,
      playing,
    };
  }

  function restoreQueueSnapshot(snapshot: { tracks: Track[]; index: number; playing: boolean }) {
    _setTracks(snapshot.tracks);
    shuffleHistoryRef.current = [];
    plannedShuffleNextRef.current = null;

    if (snapshot.tracks.length === 0) {
      setIndex(-1);
      setPlaying(false);
      return;
    }

    const safeIndex = clamp(snapshot.index, 0, snapshot.tracks.length - 1);
    setIndex(safeIndex);
    setPlaying(Boolean(snapshot.playing));
  }

  function setTracks(t: Track[]) {
    _setTracks(t);
    shuffleHistoryRef.current = [];
    plannedShuffleNextRef.current = null;
    autoAdvanceArmedRef.current = false;
    clearAutoAdvanceTimer();
    clearTransitionTimer();
    clearFadeFrame();
    setIndex((prev) => {
      if (t.length === 0) return -1;
      if (prev < 0) return -1;
      if (prev >= t.length) return t.length - 1;
      return prev;
    });
  }

  function runSoftTransition(action: () => void) {
    const audio = audioRef.current;
    const targetVolume = muted ? 0 : clamp(volume, 0, 1);

    if (!smoothTransitions || !playing || !track || !audio || targetVolume <= 0) {
      fadeInAfterTransitionRef.current = false;
      clearTransitionTimer();
      action();
      return;
    }

    clearAutoAdvanceTimer();
    clearTransitionTimer();
    clearFadeFrame();
    autoAdvanceArmedRef.current = false;
    audio.muted = false;
    audio.volume = targetVolume;

    const transitionMs = 240;
    const start = performance.now();

    const fadeOut = (now: number) => {
      const ratio = clamp((now - start) / transitionMs, 0, 1);
      audio.volume = clamp(targetVolume * (1 - ratio), 0, 1);
      if (ratio < 1) {
        fadeFrameRef.current = window.requestAnimationFrame(fadeOut);
      } else {
        fadeFrameRef.current = null;
      }
    };

    fadeFrameRef.current = window.requestAnimationFrame(fadeOut);
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null;
      fadeInAfterTransitionRef.current = true;
      action();
    }, Math.max(100, transitionMs - 20));
  }

  function playIndex(i: number) {
    if (i < 0 || i >= tracks.length) return;
    if (i === index) {
      setPlaying(true);
      return;
    }

    runSoftTransition(() => {
      plannedShuffleNextRef.current = null;
      setIndex(i);
      setPlaying(true);
    });
  }

  function playTrack(t: Track) {
    if (!t) return;

    const i = tracks.findIndex((x) => x.src === t.src);
    if (i >= 0) {
      if (i === index) {
        setPlaying(true);
        return;
      }

      runSoftTransition(() => {
        plannedShuffleNextRef.current = null;
        setIndex(i);
        setPlaying(true);
      });
      return;
    }

    runSoftTransition(() => {
      _setTracks((prev) => {
        const next = [...prev, t];
        shuffleHistoryRef.current = [];
        plannedShuffleNextRef.current = null;
        setIndex(next.length - 1);
        setPlaying(true);
        return next;
      });
    });
  }

  function togglePlay() {
    if (!track) {
      if (tracks.length > 0) playIndex(0);
      return;
    }
    setPlaying((p) => !p);
  }

  function seekTo(ratio: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const d = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (d <= 0) return;
    audio.currentTime = clamp(ratio * d, 0, d);

    lastCtRef.current = audio.currentTime;
    lastSrcRef.current = track?.src ?? "";
  }

  function setVolume(v: number) {
    _setVolume(clamp(v, 0, 1));
    if (v > 0) _setMuted(false);
  }

  function setMuted(m: boolean) {
    _setMuted(m);
  }

  function doNext(fromEnded: boolean) {
    if (tracks.length === 0) return;

    if (index < 0) {
      playIndex(0);
      return;
    }

    if (shuffle) {
      const nextIdx = consumePlannedShuffleNext(index);
      shuffleHistoryRef.current.push(index);
      setIndex(nextIdx);
      setPlaying(true);
      return;
    }

    const last = tracks.length - 1;

    if (index === last) {
      if (repeat === "all") {
        setIndex(0);
        setPlaying(true);
      } else {
        if (fromEnded) {
          setPlaying(false);
          const currentSrc = track?.src ?? "";
          if (smartAutoplay) {
            void startSmartAutoplay(currentSrc);
          }
        }
      }
      return;
    }

    setIndex(index + 1);
    setPlaying(true);
  }

  function next() {
    runSoftTransition(() => {
      doNext(false);
    });
  }

  function prev() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      lastCtRef.current = 0;
      return;
    }

    if (tracks.length === 0 || index < 0) return;

    if (shuffle) {
      const hist = shuffleHistoryRef.current;
      const last = hist.pop();
      if (last !== undefined) {
        runSoftTransition(() => {
          setIndex(last);
          setPlaying(true);
        });
        return;
      }
      const prevIdx = pickRandomIndex(index);
      runSoftTransition(() => {
        setIndex(prevIdx);
        setPlaying(true);
      });
      return;
    }

    if (index === 0) {
      if (repeat === "all") {
        runSoftTransition(() => {
          setIndex(tracks.length - 1);
          setPlaying(true);
        });
      } else {
        audio.currentTime = 0;
        lastCtRef.current = 0;
      }
      return;
    }

    runSoftTransition(() => {
      setIndex(index - 1);
      setPlaying(true);
    });
  }

  function toggleShuffle() {
    setShuffle((s) => {
      const next = !s;
      if (next) shuffleHistoryRef.current = [];
      plannedShuffleNextRef.current = null;
      return next;
    });
  }

  function toggleSmartAutoplay() {
    setSmartAutoplay((value) => !value);
  }

  function toggleUiSounds() {
    setUiSounds((value) => !value);
  }

  function toggleHaptics() {
    setHapticsEnabled((value) => !value);
  }

  function toggleSmoothTransitions() {
    setSmoothTransitions((value) => !value);
  }

  function toggleLoudnessNorm() {
    setLoudnessNorm((value) => !value);
  }

  function toggleFocusMode() {
    setFocusMode((value) => !value);
  }

  function toggleHighContrast() {
    setHighContrast((value) => !value);
  }

  function cycleTheme() {
    setTheme((value) => {
      const index = THEME_ORDER.indexOf(value);
      if (index < 0) return THEME_ORDER[0];
      return THEME_ORDER[(index + 1) % THEME_ORDER.length];
    });
  }

  function cycleEqPreset() {
    setEqPreset((value) => {
      const index = EQ_ORDER.indexOf(value);
      if (index < 0) return EQ_ORDER[0];
      return EQ_ORDER[(index + 1) % EQ_ORDER.length];
    });
  }

  function cycleRepeat() {
    plannedShuffleNextRef.current = null;
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }

  function applyQueueAndPlay(queue: Track[], start?: number | Track) {
    _setTracks(queue);
    plannedShuffleNextRef.current = null;
    autoAdvanceArmedRef.current = false;
    clearAutoAdvanceTimer();
    clearTransitionTimer();
    clearFadeFrame();

    let startIndex = 0;
    if (typeof start === "number") startIndex = start;
    else if (start && typeof start === "object") {
      const i = queue.findIndex((t) => t.src === start.src);
      startIndex = i >= 0 ? i : 0;
    }

    if (queue.length === 0) {
      setIndex(-1);
      setPlaying(false);
      return;
    }

    if (startIndex < 0) startIndex = 0;
    if (startIndex >= queue.length) startIndex = queue.length - 1;

    shuffleHistoryRef.current = [];
    setIndex(startIndex);
    setPlaying(true);
  }

  function setQueueAndPlay(queue: Track[], start?: number | Track) {
    if (queue.length === 0) {
      applyQueueAndPlay(queue, start);
      return;
    }

    runSoftTransition(() => {
      applyQueueAndPlay(queue, start);
    });
  }

  function addToQueueEnd(t: Track) {
    if (!t) return;
    _setTracks((prev) => {
      if (prev.some((x) => x.src === t.src)) return prev;
      plannedShuffleNextRef.current = null;
      return [...prev, t];
    });
  }

  function addToQueueNext(t: Track) {
    if (!t) return;
    _setTracks((prev) => {
      if (prev.some((x) => x.src === t.src)) return prev;

      if (prev.length === 0 || index < 0) {
        plannedShuffleNextRef.current = null;
        setIndex(0);
        setPlaying(true);
        return [t];
      }

      const insertAt = Math.min(prev.length, index + 1);
      const next = [...prev.slice(0, insertAt), t, ...prev.slice(insertAt)];
      plannedShuffleNextRef.current = null;
      return next;
    });
  }

  function moveInQueue(from: number, to: number) {
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    if (from === to) return;
    plannedShuffleNextRef.current = null;

    _setTracks((prev) => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

    setIndex((cur) => {
      if (cur < 0) return cur;
      if (cur === from) return to;
      if (from < cur && cur <= to) return cur - 1;
      if (to <= cur && cur < from) return cur + 1;
      return cur;
    });
  }

  function removeFromQueue(src: string) {
    if (!src) return;
    const removeIndex = tracks.findIndex((t) => t.src === src);
    if (removeIndex < 0) return;
    plannedShuffleNextRef.current = null;

    const snapshot = createQueueSnapshot();
    const removedTrack = tracks[removeIndex];

    _setTracks((prev) => {
      const i = prev.findIndex((t) => t.src === src);
      if (i < 0) return prev;

      const next = prev.filter((t) => t.src !== src);

      setIndex((cur) => {
        if (next.length === 0) return -1;
        if (cur < 0) return -1;
        if (i < cur) return cur - 1;
        if (i === cur) return Math.min(cur, next.length - 1);
        return cur;
      });

      if (next.length === 0) setPlaying(false);
      return next;
    });

    showUndoToast(`Retire: ${removedTrack?.title ?? "morceau"}`, () => {
      restoreQueueSnapshot(snapshot);
    });
  }

  function clearQueue() {
    if (tracks.length === 0) return;
    const snapshot = createQueueSnapshot();
    plannedShuffleNextRef.current = null;
    autoAdvanceArmedRef.current = false;
    clearAutoAdvanceTimer();
    clearTransitionTimer();
    clearFadeFrame();

    _setTracks([]);
    setIndex(-1);
    setPlaying(false);
    shuffleHistoryRef.current = [];

    showUndoToast("File videe", () => {
      restoreQueueSnapshot(snapshot);
    });
  }

  function isFavorite(src: string) {
    return !!favoritesMap[src];
  }

  function toggleFavorite(t: Track) {
    if (!t?.src) return;

    const wasFav = !!favoritesMap[t.src];
    setFavoritesMap((prev) => {
      const next = { ...prev };
      if (wasFav) {
        delete next[t.src];
      } else {
        next[t.src] = t;
      }
      return next;
    });

    toast(wasFav ? "Retiré des favoris" : "Ajouté aux favoris", "heart");

    if (!wasFav) {
      if (hapticsEnabledRef.current) vibrate(12);
      if (uiSoundsRef.current) playPopSound();
      void cacheTracksForOffline([{ src: t.src, cover: t.cover }]);
    }
  }

  function clearFavorites() {
    setFavoritesMap({});
  }

  function reloadFavoritesFromStorage() {
    try {
      const raw = localStorage.getItem(LS_FAV);
      if (!raw) { setFavoritesMap({}); return; }
      setFavoritesMap(sanitizeFavoritesMap(JSON.parse(raw)));
    } catch { setFavoritesMap({}); }
  }

  function getAudio() {
    return audioRef.current;
  }

  function resetStats() {
    shownAchievementIdsRef.current = new Set();
    setStatsState(emptyStats());
    setAchievementToast(null);
  }

  const stats = useMemo(() => computeLeaders(statsState), [statsState]);

  const value: PlayerCtx = {
    tracks,
    track,
    index,
    playing,

    progress,
    currentTime,
    duration,

    volume,
    muted,

    focusMode,
    setFocusMode,
    toggleFocusMode,
    theme,
    setTheme,
    cycleTheme,
    fontSize,
    setFontSize,
    highContrast,
    toggleHighContrast,
    eqPreset,
    setEqPreset,
    cycleEqPreset,
    customEqGains,
    setCustomEqGains,

    expanded,
    setExpanded,

    queueOpen,
    setQueueOpen,

    setTracks,

    playIndex,
    playTrack,
    togglePlay,
    next,
    prev,
    seekTo,

    setVolume,
    setMuted,

    setQueueAndPlay,

    addToQueueNext,
    addToQueueEnd,
    moveInQueue,
    removeFromQueue,
    clearQueue,

    shuffle,
    repeat,
    smoothTransitions,
    smartAutoplay,
    uiSounds,
    hapticsEnabled,
    loudnessNorm,
    toggleSmoothTransitions,
    toggleSmartAutoplay,
    toggleUiSounds,
    toggleHaptics,
    toggleLoudnessNorm,
    preloadedTrack,
    toggleShuffle,
    cycleRepeat,
    setRepeat,
    radioMode,
    tuneInRadio,
    leaveRadio,

    favorites,
    isFavorite,
    toggleFavorite,
    clearFavorites,

    getAudio,

    stats,
    resetStats,

    achievementToast,
    dismissAchievementToast,

    undoToast,
    undoLastAction,
    dismissUndoToast,

    queueSuggestion,
    acceptQueueSuggestion,
    dismissQueueSuggestion,
    suggestTrackToUser,

    remoteSession,
    resumeOnThisDevice,
    dismissRemoteSession,

    markPlaylistCreated,

    reloadFavoritesFromStorage,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

