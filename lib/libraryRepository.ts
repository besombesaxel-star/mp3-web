import { isAcceptedAudioFileName, isAcceptedAudioUpload, isAcceptedCoverUpload } from "@/lib/libraryFiles";
import { listLocalTracks, saveLocalTrackMeta, uploadLocalTrack } from "@/lib/localLibrary";
import { isValidLibraryAudioSrc } from "@/lib/libraryStorage";
import { isSupabaseConfigured } from "@/lib/supabaseAdmin";
import { isR2Configured } from "@/lib/r2Storage";
import {
  createSupabaseUploadTargets,
  deleteSupabaseTrack,
  finalizeSupabaseTrackUpload,
  isSupabaseTrackSrc,
  listSupabaseTracks,
  saveSupabaseTrackCover,
  saveSupabaseTrackMeta,
  uploadSupabaseTrack,
} from "@/lib/supabaseLibrary";
import {
  createR2UploadTargets,
  deleteR2Track,
  finalizeR2TrackUpload,
  isR2TrackSrc,
  listR2Tracks,
  saveR2TrackCover,
  saveR2TrackMeta,
  uploadR2Track,
} from "@/lib/r2Library";
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
  if (isR2Configured()) return "r2";
  if (isSupabaseConfigured()) return "supabase";
  return "local";
}

export function isValidTrackSrc(src: string) {
  return isValidLibraryAudioSrc(src) || isR2TrackSrc(src) || isSupabaseTrackSrc(src);
}

export function isValidAudioUpload(audio: File) {
  return isAcceptedAudioUpload(audio);
}

export function isValidAudioFileName(name: string) {
  return isAcceptedAudioFileName(name);
}

export function isValidCoverUpload(cover: File) {
  return isAcceptedCoverUpload(cover);
}

export async function listTracksForApi() {
  const r2Configured = isR2Configured();
  const supabaseConfigured = isSupabaseConfigured();

  if (!r2Configured && !supabaseConfigured) {
    return listLocalTracks();
  }

  const [r2Tracks, supabaseTracks, localTracks] = await Promise.all([
    r2Configured ? listR2Tracks() : Promise.resolve([]),
    supabaseConfigured ? listSupabaseTracks() : Promise.resolve([]),
    listLocalTracks(),
  ]);

  const merged = [...r2Tracks];
  const knownKeys = new Set(r2Tracks.map((track) => dedupeTrackKey(track)));

  for (const supabaseTrack of supabaseTracks) {
    const key = dedupeTrackKey(supabaseTrack);
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    merged.push(supabaseTrack);
  }

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
  if (isR2Configured()) {
    if (!owner?.id) {
      throw new Error("Compte requis pour l'upload.");
    }

    return uploadR2Track(audio, cover, owner);
  }

  if (isSupabaseConfigured()) {
    if (!owner?.id) {
      throw new Error("Compte requis pour l'upload Supabase.");
    }

    return uploadSupabaseTrack(audio, cover, owner);
  }

  return uploadLocalTrack(audio, cover);
}

export async function createUploadTargetsForApi(audioName: string, coverName: string | null) {
  if (isR2Configured()) {
    return createR2UploadTargets(audioName, coverName);
  }

  if (!isSupabaseConfigured()) {
    throw new Error("Upload direct non disponible sans backend cloud configure.");
  }

  return createSupabaseUploadTargets(audioName, coverName);
}

export async function finalizeUploadForApi(
  audioPath: string,
  coverPath: string | null,
  owner: TrackOwnerInput
): Promise<LibraryTrack> {
  if (!owner?.id) {
    throw new Error("Compte requis pour l'upload.");
  }

  if (isR2Configured()) {
    return finalizeR2TrackUpload({ audioPath, coverPath, owner });
  }

  if (!isSupabaseConfigured()) {
    throw new Error("Upload direct non disponible sans backend cloud configure.");
  }

  return finalizeSupabaseTrackUpload({ audioPath, coverPath, owner });
}

export async function saveTrackMetaForApi(
  src: string,
  title: string,
  artist: string,
  actorUserId?: string | null,
  credits?: string | null
): Promise<LibraryMutationResult> {
  if (isR2TrackSrc(src)) {
    return saveR2TrackMeta(src, title, artist, actorUserId, credits);
  }

  if (isSupabaseTrackSrc(src)) {
    return saveSupabaseTrackMeta(src, title, artist, actorUserId, credits);
  }

  if (isValidLibraryAudioSrc(src)) {
    await saveLocalTrackMeta(src, title, artist, credits);
    return "ok";
  }

  if (isR2Configured()) {
    return saveR2TrackMeta(src, title, artist, actorUserId, credits);
  }

  if (isSupabaseConfigured()) {
    return saveSupabaseTrackMeta(src, title, artist, actorUserId, credits);
  }

  return "not_found";
}

export async function saveTrackCoverForApi(
  src: string,
  cover: File,
  actorUserId?: string | null
): Promise<LibraryMutationResult> {
  if (isR2TrackSrc(src) || isR2Configured()) {
    return saveR2TrackCover(src, cover, actorUserId);
  }

  if (isSupabaseTrackSrc(src) || isSupabaseConfigured()) {
    return saveSupabaseTrackCover(src, cover, actorUserId);
  }

  return "unsupported";
}

export async function deleteTrackForApi(src: string, actorUserId?: string | null): Promise<LibraryMutationResult> {
  if (isR2TrackSrc(src)) {
    return deleteR2Track(src, actorUserId);
  }

  if (isSupabaseTrackSrc(src)) {
    return deleteSupabaseTrack(src, actorUserId);
  }

  return "unsupported";
}
