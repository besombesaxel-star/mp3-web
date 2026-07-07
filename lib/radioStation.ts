import { parseBuffer } from "music-metadata";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listTracksForApi } from "@/lib/libraryRepository";

const BUCKET = "account-data";
const UP_NEXT_COUNT = 5;
const FALLBACK_DURATION_SECONDS = 210;
const MAX_SCHEDULE_TRACKS = 150;
const DURATION_PROBE_CONCURRENCY = 8;

export type RadioTrack = {
  src: string;
  title: string;
  artist: string;
  cover: string | null;
  ownerDisplayName: string | null;
  durationSeconds: number;
};

export type RadioSchedule = {
  dayKey: string;
  epoch: number;
  tracks: RadioTrack[];
  totalDurationSeconds: number;
};

export type RadioNowPlaying = {
  dayKey: string;
  track: RadioTrack;
  trackIndex: number;
  totalTracks: number;
  offsetSeconds: number;
  serverNow: number;
  trackEndsAt: number;
  upNext: RadioTrack[];
};

function getDayKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getDayEpoch(now: number): number {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function mulberry32(seed: number) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const SCHEDULE_SCHEMA_VERSION = 2;

function getPath(dayKey: string) {
  return `radio/schedule-v${SCHEDULE_SCHEMA_VERSION}-${dayKey}.json`;
}

async function readTrackBytes(src: string): Promise<Uint8Array | null> {
  if (/^https?:\/\//i.test(src)) {
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  const relative = src.startsWith("/audio/") ? src.slice("/audio/".length) : null;
  if (!relative) return null;

  try {
    const [{ promises: fs }, path] = await Promise.all([import("fs"), import("path")]);
    const filePath = path.join(process.cwd(), "public", "audio", relative);
    return new Uint8Array(await fs.readFile(filePath));
  } catch {
    return null;
  }
}

async function probeDurationSeconds(src: string): Promise<number> {
  try {
    const bytes = await readTrackBytes(src);
    if (!bytes || bytes.length === 0) return FALLBACK_DURATION_SECONDS;

    const metadata = await parseBuffer(bytes, { mimeType: "audio/mpeg" }, { duration: true, skipCovers: true });
    const duration = metadata.format.duration;
    return typeof duration === "number" && Number.isFinite(duration) && duration > 1
      ? duration
      : FALLBACK_DURATION_SECONDS;
  } catch {
    return FALLBACK_DURATION_SECONDS;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function buildSchedule(dayKey: string, epoch: number): Promise<RadioSchedule> {
  const tracks = await listTracksForApi();
  const pool = seededShuffle(tracks, seedFromString(dayKey)).slice(0, MAX_SCHEDULE_TRACKS);

  const durations = await mapWithConcurrency(pool, DURATION_PROBE_CONCURRENCY, (t) => probeDurationSeconds(t.src));

  const radioTracks: RadioTrack[] = pool.map((t, i) => ({
    src: t.src,
    title: t.title,
    artist: t.artist,
    cover: t.cover,
    ownerDisplayName: t.ownerDisplayName ?? null,
    durationSeconds: durations[i],
  }));

  const totalDurationSeconds = radioTracks.reduce((sum, t) => sum + t.durationSeconds, 0);

  return { dayKey, epoch, tracks: radioTracks, totalDurationSeconds };
}

function parseSchedule(raw: string): RadioSchedule | null {
  try {
    const parsed = JSON.parse(raw) as RadioSchedule;
    if (
      parsed &&
      Array.isArray(parsed.tracks) &&
      typeof parsed.epoch === "number" &&
      typeof parsed.totalDurationSeconds === "number" &&
      parsed.tracks.every((t) => typeof t.durationSeconds === "number")
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function readPersistedSchedule(dayKey: string): Promise<RadioSchedule | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPath(dayKey));
  if (error || !data) return null;

  return parseSchedule(await data.text());
}

async function persistSchedule(schedule: RadioSchedule): Promise<RadioSchedule | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const blob = new Blob([JSON.stringify(schedule)], { type: "application/json" });
  const { error } = await admin.client.storage
    .from(BUCKET)
    .upload(getPath(schedule.dayKey), blob, { upsert: false, contentType: "application/json" });

  if (!error) return schedule;
  // Another request likely persisted the schedule for today concurrently; defer to it.
  return readPersistedSchedule(schedule.dayKey);
}

export async function getRadioSchedule(now: number = Date.now()): Promise<RadioSchedule | null> {
  const dayKey = getDayKey(now);
  const existing = await readPersistedSchedule(dayKey);
  if (existing) return existing;

  const schedule = await buildSchedule(dayKey, getDayEpoch(now));
  if (schedule.tracks.length === 0 || schedule.totalDurationSeconds <= 0) return null;

  return (await persistSchedule(schedule)) ?? schedule;
}

export async function getRadioNowPlaying(now: number = Date.now()): Promise<RadioNowPlaying | null> {
  const schedule = await getRadioSchedule(now);
  if (!schedule || schedule.tracks.length === 0 || schedule.totalDurationSeconds <= 0) return null;

  const totalTracks = schedule.tracks.length;
  const totalDuration = schedule.totalDurationSeconds;
  const elapsedSeconds = (((now - schedule.epoch) / 1000) % totalDuration + totalDuration) % totalDuration;

  let cursor = 0;
  let trackIndex = totalTracks - 1;
  for (let i = 0; i < totalTracks; i++) {
    const trackDuration = schedule.tracks[i].durationSeconds;
    if (elapsedSeconds < cursor + trackDuration) {
      trackIndex = i;
      break;
    }
    cursor += trackDuration;
  }

  const track = schedule.tracks[trackIndex];
  const offsetSeconds = Math.max(0, elapsedSeconds - cursor);
  const trackEndsAt = now - offsetSeconds * 1000 + track.durationSeconds * 1000;

  const upNext: RadioTrack[] = [];
  for (let i = 1; i <= UP_NEXT_COUNT && i < totalTracks; i++) {
    upNext.push(schedule.tracks[(trackIndex + i) % totalTracks]);
  }

  return {
    dayKey: schedule.dayKey,
    track,
    trackIndex,
    totalTracks,
    offsetSeconds,
    serverNow: now,
    trackEndsAt,
    upNext,
  };
}
