import { describe, expect, it } from "vitest";
import {
  buildSmartQueue,
  clamp,
  computeLeaders,
  emptyStats,
  getDayKey,
  isRecord,
  normalizeArtist,
  normalizeCustomEqGains,
  safePrefs,
  safeSession,
  safeStats,
  safeTrack,
  sanitizeFavoritesMap,
  tracksToFavoritesMap,
  type PlayerStats,
  type Track,
} from "@/app/PlayerContext";

describe("clamp", () => {
  it("clamps a value within [a, b]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("normalizeArtist", () => {
  it("trims whitespace and falls back to a dash", () => {
    expect(normalizeArtist("  Daft Punk  ")).toBe("Daft Punk");
    expect(normalizeArtist("")).toBe("-");
    expect(normalizeArtist(undefined)).toBe("-");
    expect(normalizeArtist("   ")).toBe("-");
  });
});

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
  });
});

describe("safeTrack", () => {
  it("accepts a minimal valid track and fills in optional fields", () => {
    const track = safeTrack({ src: "/audio/a.mp3", title: "A" });
    expect(track).toEqual({
      title: "A",
      artist: undefined,
      src: "/audio/a.mp3",
      cover: undefined,
      accent: undefined,
      ownerDisplayName: undefined,
      ownerId: undefined,
    });
  });

  it("keeps optional fields when present", () => {
    const track = safeTrack({
      src: "/audio/a.mp3",
      title: "A",
      artist: "Artist",
      cover: "/cover/a.jpg",
      accent: "#8B5CF6",
      ownerDisplayName: "Owner",
      ownerId: "u1",
    });
    expect(track).toMatchObject({ artist: "Artist", cover: "/cover/a.jpg", accent: "#8B5CF6", ownerId: "u1" });
  });

  it("rejects values missing src or title, and non-objects", () => {
    expect(safeTrack({ src: "/a.mp3" })).toBeNull();
    expect(safeTrack({ title: "A" })).toBeNull();
    expect(safeTrack(null)).toBeNull();
    expect(safeTrack("not an object")).toBeNull();
    expect(safeTrack([])).toBeNull();
  });
});

describe("tracksToFavoritesMap", () => {
  it("keys tracks by src, skipping entries without src/title", () => {
    const map = tracksToFavoritesMap([
      { title: "A", artist: "X", src: "/a.mp3" },
      { title: "", artist: "Y", src: "/b.mp3" },
      { title: "C", artist: "Z", src: "" },
    ]);
    expect(Object.keys(map)).toEqual(["/a.mp3"]);
    expect(map["/a.mp3"]).toMatchObject({ title: "A", artist: "X", src: "/a.mp3" });
  });
});

describe("sanitizeFavoritesMap", () => {
  it("accepts an array of tracks", () => {
    const result = sanitizeFavoritesMap([{ src: "/a.mp3", title: "A" }, { src: "/b.mp3", title: "B" }]);
    expect(Object.keys(result).sort()).toEqual(["/a.mp3", "/b.mp3"]);
  });

  it("accepts a record of tracks and drops malformed entries", () => {
    const result = sanitizeFavoritesMap({
      "/a.mp3": { src: "/a.mp3", title: "A" },
      "/b.mp3": { title: "B" }, // missing src on the value, but key present -> still accepted via fallback branch
      "/c.mp3": { notATrack: true },
    });
    expect(result["/a.mp3"]).toMatchObject({ title: "A" });
    expect(result["/b.mp3"]).toMatchObject({ title: "B", src: "/b.mp3" });
    expect(result["/c.mp3"]).toBeUndefined();
  });

  it("returns an empty object for non-array, non-record input", () => {
    expect(sanitizeFavoritesMap(null)).toEqual({});
    expect(sanitizeFavoritesMap("nope")).toEqual({});
  });
});

describe("safeSession", () => {
  it("returns null when tracks is missing or not an array", () => {
    expect(safeSession(null)).toBeNull();
    expect(safeSession({})).toBeNull();
    expect(safeSession({ tracks: "not an array" })).toBeNull();
  });

  it("normalizes a valid session, clamping volume and defaulting repeat", () => {
    const session = safeSession({
      tracks: [{ src: "/a.mp3", title: "A" }],
      index: 0,
      currentTime: 12.5,
      volume: 5, // out of range, should clamp to 1
      muted: true,
      shuffle: true,
      repeat: "bogus",
    });
    expect(session).toMatchObject({
      index: 0,
      currentTime: 12.5,
      volume: 1,
      muted: true,
      shuffle: true,
      repeat: "off",
    });
    expect(session?.tracks).toHaveLength(1);
  });

  it("filters out invalid tracks and defaults index to -1 when absent", () => {
    const session = safeSession({ tracks: [{ src: "/a.mp3", title: "A" }, { bogus: true }] });
    expect(session?.tracks).toHaveLength(1);
    expect(session?.index).toBe(-1);
  });
});

describe("normalizeCustomEqGains", () => {
  it("returns the default gains when the shape is wrong", () => {
    expect(normalizeCustomEqGains(null)).toEqual([0, 0, 0, 0, 0]);
    expect(normalizeCustomEqGains([1, 2, 3])).toEqual([0, 0, 0, 0, 0]);
  });

  it("clamps each band to [-12, 12] and zeroes non-numeric entries", () => {
    expect(normalizeCustomEqGains([20, -20, 5, "x", null])).toEqual([12, -12, 5, 0, 0]);
  });
});

describe("safePrefs", () => {
  it("returns full defaults for non-record input", () => {
    const prefs = safePrefs(null);
    expect(prefs).toMatchObject({
      focusMode: false,
      smoothTransitions: true,
      smartAutoplay: true,
      uiSounds: false,
      hapticsEnabled: true,
      loudnessNorm: true,
      fontSize: "md",
      highContrast: false,
      colorTheme: "steel",
      customThemeHue: 218,
      eqPreset: "off",
      fallingPetals: true,
    });
    expect(prefs.customEqGains).toEqual([0, 0, 0, 0, 0]);
  });

  it("keeps valid fields and falls back per-field on invalid ones", () => {
    const prefs = safePrefs({
      focusMode: true,
      fontSize: "huge", // invalid -> falls back to "md"
      colorTheme: "violet",
      customThemeHue: 400, // wraps modulo 360
      eqPreset: "bass",
      fallingPetals: false,
    });
    expect(prefs.focusMode).toBe(true);
    expect(prefs.fontSize).toBe("md");
    expect(prefs.colorTheme).toBe("violet");
    expect(prefs.customThemeHue).toBe(40);
    expect(prefs.eqPreset).toBe("bass");
    expect(prefs.fallingPetals).toBe(false);
  });
});

describe("emptyStats", () => {
  it("returns a fully-zeroed stats object", () => {
    const stats = emptyStats();
    expect(stats.totalPlays).toBe(0);
    expect(stats.topArtist).toBeNull();
    expect(stats.topTrack).toBeNull();
    expect(stats.byTrack).toEqual({});
    expect(stats.playsByDay).toEqual({});
    expect(stats.streakFreezeUsedDates).toEqual([]);
  });
});

describe("getDayKey", () => {
  it("formats a timestamp as local YYYY-MM-DD", () => {
    expect(getDayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
  });
});

describe("computeLeaders", () => {
  it("picks the artist/track with the most listened seconds", () => {
    const stats: PlayerStats = {
      ...emptyStats(),
      byArtist: {
        Aya: { seconds: 100, plays: 5 },
        Bo: { seconds: 300, plays: 2 },
      },
      byTrack: {
        "/a.mp3": { title: "A", seconds: 50, plays: 3 },
        "/b.mp3": { title: "B", seconds: 200, plays: 1 },
      },
    };
    const result = computeLeaders(stats);
    expect(result.topArtist).toMatchObject({ name: "Bo", seconds: 300 });
    expect(result.topTrack).toMatchObject({ src: "/b.mp3", title: "B", seconds: 200 });
  });

  it("returns null leaders when there is no data", () => {
    const result = computeLeaders(emptyStats());
    expect(result.topArtist).toBeNull();
    expect(result.topTrack).toBeNull();
  });
});

describe("safeStats", () => {
  it("returns empty stats for non-record input", () => {
    expect(safeStats(null)).toEqual(emptyStats());
  });

  it("cleans and recomputes leaders from a malformed-but-partially-valid payload", () => {
    const stats = safeStats({
      totalListenSeconds: 500,
      totalPlays: 10,
      byTrack: {
        "/a.mp3": { title: "A", seconds: 100, plays: 4 },
        "": { title: "ignored", seconds: 999, plays: 999 }, // empty key dropped
      },
      byArtist: { Aya: { seconds: 300, plays: 6 } },
      recentPlays: [{ src: "/a.mp3", playedAt: 1000, hour: 30 }, { notATrack: true }],
      playsByDay: { "2026-01-05": 3, "bad-day": 1 },
      achievements: { plays_10: { unlockedAt: 123 }, not_a_real_id: { unlockedAt: 456 } },
      commentsPosted: 7,
      streakFreezes: 99, // clamped to MAX_STREAK_FREEZES
      streakFreezeUsedDates: ["2026-01-01", "not-a-date"],
    });

    expect(stats.totalListenSeconds).toBe(500);
    expect(stats.byTrack["/a.mp3"]).toMatchObject({ title: "A", seconds: 100, plays: 4 });
    expect(stats.byTrack[""]).toBeUndefined();
    expect(stats.recentPlays).toHaveLength(1);
    expect(stats.recentPlays[0].hour).toBe(23); // clamped into [0, 23]
    expect(stats.playsByDay).toEqual({ "2026-01-05": 3 });
    expect(stats.achievements).toEqual({ plays_10: { unlockedAt: 123 } });
    expect(stats.commentsPosted).toBe(7);
    expect(stats.streakFreezes).toBe(2);
    expect(stats.streakFreezeUsedDates).toEqual(["2026-01-01"]);
    expect(stats.topArtist).toMatchObject({ name: "Aya", seconds: 300 });
    expect(stats.topTrack).toMatchObject({ src: "/a.mp3", seconds: 100 });
    expect(stats.uniqueTracksPlayed).toBe(1);
  });
});

describe("buildSmartQueue", () => {
  const library: Track[] = [
    { title: "A", artist: "Aya", src: "/a.mp3" },
    { title: "B", artist: "Bo", src: "/b.mp3" },
    { title: "C", artist: "Aya", src: "/c.mp3" },
    { title: "Current", artist: "Aya", src: "/current.mp3" },
  ];

  it("excludes the currently playing track", () => {
    const queue = buildSmartQueue(library, emptyStats(), {}, "/current.mp3");
    expect(queue.some((t) => t.src === "/current.mp3")).toBe(false);
  });

  it("returns an empty queue for an empty library", () => {
    expect(buildSmartQueue([], emptyStats(), {}, "")).toEqual([]);
  });

  it("ranks favorites and the top artist above unrelated tracks", () => {
    const stats: PlayerStats = { ...emptyStats(), topArtist: { name: "Aya", seconds: 100, plays: 1 } };
    const favoritesMap: Record<string, Track> = { "/b.mp3": library[1] };
    const queue = buildSmartQueue(library, stats, favoritesMap, "/current.mp3");
    // "B" is a favorite (+2.2) but not the top artist; "A"/"C" get the top-artist bonus (+1.4) only.
    // Favorite bonus outweighs the top-artist bonus, so the favorite should rank first.
    expect(queue[0].src).toBe("/b.mp3");
  });

  it("penalizes tracks played very recently", () => {
    // A single recent play (+1.6 recency) still nets negative once the "played in the
    // last 8" penalty (-2.6) applies, so it should rank below untouched tracks.
    const stats: PlayerStats = {
      ...emptyStats(),
      recentPlays: [{ src: "/a.mp3", playedAt: 1, hour: 0 }],
    };
    const queue = buildSmartQueue(library, stats, {}, "/current.mp3");
    const indexA = queue.findIndex((t) => t.src === "/a.mp3");
    const indexB = queue.findIndex((t) => t.src === "/b.mp3");
    expect(indexA).toBeGreaterThan(indexB);
  });
});
