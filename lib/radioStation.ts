import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listTracksForApi } from "@/lib/libraryRepository";

const BUCKET = "account-data";
const SLOT_SECONDS = 210;
const UP_NEXT_COUNT = 5;

export type RadioTrack = {
  src: string;
  title: string;
  artist: string;
  cover: string | null;
  ownerDisplayName: string | null;
};

export type RadioSchedule = {
  dayKey: string;
  epoch: number;
  slotSeconds: number;
  tracks: RadioTrack[];
};

export type RadioNowPlaying = {
  dayKey: string;
  track: RadioTrack;
  trackIndex: number;
  totalTracks: number;
  offsetSeconds: number;
  slotSeconds: number;
  serverNow: number;
  slotEndsAt: number;
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

function getPath(dayKey: string) {
  return `radio/schedule-${dayKey}.json`;
}

async function buildSchedule(dayKey: string, epoch: number): Promise<RadioSchedule> {
  const tracks = await listTracksForApi();
  const pool: RadioTrack[] = tracks.map((t) => ({
    src: t.src,
    title: t.title,
    artist: t.artist,
    cover: t.cover,
    ownerDisplayName: t.ownerDisplayName ?? null,
  }));

  return {
    dayKey,
    epoch,
    slotSeconds: SLOT_SECONDS,
    tracks: seededShuffle(pool, seedFromString(dayKey)),
  };
}

function parseSchedule(raw: string): RadioSchedule | null {
  try {
    const parsed = JSON.parse(raw) as RadioSchedule;
    if (parsed && Array.isArray(parsed.tracks) && typeof parsed.epoch === "number") {
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
  if (schedule.tracks.length === 0) return null;

  return (await persistSchedule(schedule)) ?? schedule;
}

export async function getRadioNowPlaying(now: number = Date.now()): Promise<RadioNowPlaying | null> {
  const schedule = await getRadioSchedule(now);
  if (!schedule || schedule.tracks.length === 0) return null;

  const totalTracks = schedule.tracks.length;
  const slotSeconds = schedule.slotSeconds;
  const elapsedSeconds = Math.floor((now - schedule.epoch) / 1000);
  const slotNumber = Math.floor(elapsedSeconds / slotSeconds);
  const trackIndex = ((slotNumber % totalTracks) + totalTracks) % totalTracks;
  const offsetSeconds = ((elapsedSeconds % slotSeconds) + slotSeconds) % slotSeconds;
  const slotEndsAt = schedule.epoch + (slotNumber + 1) * slotSeconds * 1000;

  const upNext: RadioTrack[] = [];
  for (let i = 1; i <= UP_NEXT_COUNT && i < totalTracks; i++) {
    upNext.push(schedule.tracks[(trackIndex + i) % totalTracks]);
  }

  return {
    dayKey: schedule.dayKey,
    track: schedule.tracks[trackIndex],
    trackIndex,
    totalTracks,
    offsetSeconds,
    slotSeconds,
    serverNow: now,
    slotEndsAt,
    upNext,
  };
}
