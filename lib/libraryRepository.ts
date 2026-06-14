import { isFirebaseConfigured } from "@/lib/firebaseAdmin";
import { isFirebaseTrackSrc, listFirebaseTracks, saveFirebaseTrackMeta, uploadFirebaseTrack } from "@/lib/firebaseLibrary";
import { isAcceptedCoverUpload, isAcceptedMp3Upload } from "@/lib/libraryFiles";
import { listLocalTracks, saveLocalTrackMeta, uploadLocalTrack } from "@/lib/localLibrary";
import { isValidLibraryAudioSrc } from "@/lib/libraryStorage";
import { isSupabaseConfigured } from "@/lib/supabaseAdmin";
import {
  deleteSupabaseTrack,
  isSupabaseTrackSrc,
  listSupabaseTracks,
  saveSupabaseTrackMeta,
  uploadSupabaseTrack,
} from "@/lib/supabaseLibrary";
import type { LibraryBackend, LibraryMutationResult, LibraryTrack } from "@/lib/libraryTypes";

type TrackOwnerInput = {
  displayName?: string | null;
  email?: string | null;
  id: string;
};

function dedupeTrackKey(track: LibraryTrack) {
  return (track.fileName || track.src).toLowerCase();
}

export function getLibraryBackendMode(): LibraryBackend {
  if (isSupabaseConfigured()) return "supabase";
  return isFirebaseConfigured() ? "firebase" : "local";
}

export function isValidTrackSrc(src: string) {
  return isValidLibraryAudioSrc(src) || isFirebaseTrackSrc(src) || isSupabaseTrackSrc(src);
}

export function isValidAudioUpload(audio: File) {
  return isAcceptedMp3Upload(audio);
}

export function isValidCoverUpload(cover: File) {
  return isAcceptedCoverUpload(cover);
}

export async function listTracksForApi() {
  if (isSupabaseConfigured()) {
    const [supabaseTracks, localTracks] = await Promise.all([listSupabaseTracks(), listLocalTracks()]);
    if (supabaseTracks.length === 0) {
      return localTracks;
    }

    const merged = [...supabaseTracks];
    const knownKeys = new Set(supabaseTracks.map((track) => dedupeTrackKey(track)));

    for (const localTrack of localTracks) {
      const key = dedupeTrackKey(localTrack);
      if (knownKeys.has(key)) continue;
      merged.push(localTrack);
    }

    merged.sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title, "fr"));
    return merged;
  }

  if (!isFirebaseConfigured()) {
    return listLocalTracks();
  }

  const [firebaseTracks, localTracks] = await Promise.all([listFirebaseTracks(), listLocalTracks()]);
  if (firebaseTracks.length === 0) {
    return localTracks;
  }

  const merged = [...firebaseTracks];
  const knownKeys = new Set(firebaseTracks.map((track) => dedupeTrackKey(track)));

  for (const localTrack of localTracks) {
    const key = dedupeTrackKey(localTrack);
    if (knownKeys.has(key)) continue;
    merged.push(localTrack);
  }

  merged.sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title, "fr"));
  return merged;
}

export async function uploadTrackForApi(
  audio: File,
  cover: File | null,
  owner?: TrackOwnerInput | null
): Promise<LibraryTrack> {
  if (isSupabaseConfigured()) {
    if (!owner?.id) {
      throw new Error("Compte requis pour l'upload Supabase.");
    }

    return uploadSupabaseTrack(audio, cover, owner);
  }

  if (isFirebaseConfigured()) {
    return uploadFirebaseTrack(audio, cover);
  }

  return uploadLocalTrack(audio, cover);
}

export async function saveTrackMetaForApi(
  src: string,
  title: string,
  artist: string,
  actorUserId?: string | null
): Promise<LibraryMutationResult> {
  if (isSupabaseTrackSrc(src)) {
    return saveSupabaseTrackMeta(src, title, artist, actorUserId);
  }

  if (isFirebaseTrackSrc(src)) {
    return (await saveFirebaseTrackMeta(src, title, artist)) ? "ok" : "not_found";
  }

  if (isValidLibraryAudioSrc(src)) {
    await saveLocalTrackMeta(src, title, artist);
    return "ok";
  }

  if (isSupabaseConfigured()) {
    return saveSupabaseTrackMeta(src, title, artist, actorUserId);
  }

  if (isFirebaseConfigured()) {
    return (await saveFirebaseTrackMeta(src, title, artist)) ? "ok" : "not_found";
  }

  return "not_found";
}

export async function deleteTrackForApi(src: string, actorUserId?: string | null): Promise<LibraryMutationResult> {
  if (isSupabaseTrackSrc(src)) {
    return deleteSupabaseTrack(src, actorUserId);
  }

  return "unsupported";
}
