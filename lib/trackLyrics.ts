import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hashStringToHex } from "@/lib/publicLinks";

export type TrackLyrics = {
  text: string;
  updatedAt: number;
  updatedBy: string;
};

const BUCKET = "account-data";
const MAX_LYRICS_LENGTH = 8000;

function getTrackLyricsPath(src: string): string {
  return `track-lyrics/${hashStringToHex(src)}.json`;
}

function normalize(raw: unknown): TrackLyrics | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const text = typeof value.text === "string" ? value.text.trim().slice(0, MAX_LYRICS_LENGTH) : "";
  if (!text) return null;

  const updatedAt =
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now();
  const updatedBy = typeof value.updatedBy === "string" ? value.updatedBy : "";

  return { text, updatedAt, updatedBy };
}

export async function readTrackLyrics(src: string): Promise<TrackLyrics | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin.client.storage.from(BUCKET).download(getTrackLyricsPath(src));
  if (error || !data) return null;

  try {
    return normalize(JSON.parse(await data.text()));
  } catch {
    return null;
  }
}

export async function writeTrackLyrics(src: string, text: string, updatedBy: string): Promise<TrackLyrics | null> {
  const trimmed = text.trim().slice(0, MAX_LYRICS_LENGTH);
  if (!trimmed) return null;

  const lyrics: TrackLyrics = { text: trimmed, updatedAt: Date.now(), updatedBy };

  const admin = getSupabaseAdmin();
  if (!admin) return lyrics;

  const blob = new Blob([JSON.stringify(lyrics)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getTrackLyricsPath(src), blob, { upsert: true, contentType: "application/json" });

  return lyrics;
}

export async function deleteTrackLyrics(src: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  await admin.client.storage.from(BUCKET).remove([getTrackLyricsPath(src)]);
}
