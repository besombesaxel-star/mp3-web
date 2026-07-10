import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type SharedPlaylist = {
  id: string;
  name: string;
  trackSrcs: string[];
  ownerId: string;
  collaboratorIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type SharedPlaylistResult = "ok" | "not_found" | "forbidden" | "full";

const BUCKET = "account-data";
const MAX_NAME_LENGTH = 80;
const MAX_TRACKS = 1000;
const MAX_COLLABORATORS = 20;

function getPlaylistPath(id: string) {
  return `shared-playlists/${id}.json`;
}

function getIndexPath(userId: string) {
  return `shared-playlist-index/${userId}.json`;
}

function isMember(playlist: SharedPlaylist, userId: string) {
  return playlist.ownerId === userId || playlist.collaboratorIds.includes(userId);
}

async function readIndex(userId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin.client.storage.from(BUCKET).download(getIndexPath(userId));
  if (error || !data) return [];

  try {
    const parsed = JSON.parse(await data.text());
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function writeIndex(userId: string, ids: string[]): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const blob = new Blob([JSON.stringify(ids)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getIndexPath(userId), blob, { upsert: true, contentType: "application/json" });
}

async function addToIndex(userId: string, playlistId: string): Promise<void> {
  const ids = await readIndex(userId);
  if (ids.includes(playlistId)) return;
  await writeIndex(userId, [...ids, playlistId]);
}

async function removeFromIndex(userId: string, playlistId: string): Promise<void> {
  const ids = await readIndex(userId);
  if (!ids.includes(playlistId)) return;
  await writeIndex(userId, ids.filter((id) => id !== playlistId));
}

function normalizePlaylist(raw: unknown): SharedPlaylist | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.ownerId !== "string") return null;

  return {
    id: v.id,
    name: typeof v.name === "string" ? v.name.slice(0, MAX_NAME_LENGTH) : "Playlist",
    trackSrcs: Array.isArray(v.trackSrcs) ? v.trackSrcs.filter((s): s is string => typeof s === "string").slice(0, MAX_TRACKS) : [],
    ownerId: v.ownerId,
    collaboratorIds: Array.isArray(v.collaboratorIds)
      ? [...new Set(v.collaboratorIds.filter((s): s is string => typeof s === "string"))].slice(0, MAX_COLLABORATORS)
      : [],
    createdAt: typeof v.createdAt === "number" ? v.createdAt : Date.now(),
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : Date.now(),
  };
}

export async function readSharedPlaylist(id: string): Promise<SharedPlaylist | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin.client.storage.from(BUCKET).download(getPlaylistPath(id));
  if (error || !data) return null;

  try {
    return normalizePlaylist(JSON.parse(await data.text()));
  } catch {
    return null;
  }
}

async function writeSharedPlaylist(playlist: SharedPlaylist): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const blob = new Blob([JSON.stringify(playlist)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getPlaylistPath(playlist.id), blob, { upsert: true, contentType: "application/json" });
}

export async function createSharedPlaylist(ownerId: string, name: string): Promise<SharedPlaylist> {
  const playlist: SharedPlaylist = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, MAX_NAME_LENGTH) || "Playlist",
    trackSrcs: [],
    ownerId,
    collaboratorIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await writeSharedPlaylist(playlist);
  await addToIndex(ownerId, playlist.id);
  return playlist;
}

export async function listSharedPlaylistsForUser(userId: string): Promise<SharedPlaylist[]> {
  const ids = await readIndex(userId);
  const playlists = await Promise.all(ids.map((id) => readSharedPlaylist(id)));
  return playlists
    .filter((p): p is SharedPlaylist => p !== null && isMember(p, userId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updateSharedPlaylist(
  id: string,
  patch: { name?: string; trackSrcs?: string[] },
  actorId: string
): Promise<SharedPlaylistResult> {
  const playlist = await readSharedPlaylist(id);
  if (!playlist) return "not_found";
  if (!isMember(playlist, actorId)) return "forbidden";

  const next: SharedPlaylist = {
    ...playlist,
    name: patch.name !== undefined ? patch.name.trim().slice(0, MAX_NAME_LENGTH) || playlist.name : playlist.name,
    trackSrcs: patch.trackSrcs !== undefined ? [...new Set(patch.trackSrcs)].slice(0, MAX_TRACKS) : playlist.trackSrcs,
    updatedAt: Date.now(),
  };
  await writeSharedPlaylist(next);
  return "ok";
}

export async function addCollaborator(id: string, targetUserId: string, actorId: string): Promise<SharedPlaylistResult> {
  const playlist = await readSharedPlaylist(id);
  if (!playlist) return "not_found";
  if (playlist.ownerId !== actorId) return "forbidden";
  if (targetUserId === playlist.ownerId || playlist.collaboratorIds.includes(targetUserId)) return "ok";
  if (playlist.collaboratorIds.length >= MAX_COLLABORATORS) return "full";

  const next: SharedPlaylist = {
    ...playlist,
    collaboratorIds: [...playlist.collaboratorIds, targetUserId],
    updatedAt: Date.now(),
  };
  await writeSharedPlaylist(next);
  await addToIndex(targetUserId, id);
  return "ok";
}

export async function removeCollaborator(id: string, targetUserId: string, actorId: string): Promise<SharedPlaylistResult> {
  const playlist = await readSharedPlaylist(id);
  if (!playlist) return "not_found";
  if (targetUserId === playlist.ownerId) return "forbidden";
  // Owner can remove anyone; a collaborator can remove themself (leave).
  if (playlist.ownerId !== actorId && actorId !== targetUserId) return "forbidden";

  const next: SharedPlaylist = {
    ...playlist,
    collaboratorIds: playlist.collaboratorIds.filter((cid) => cid !== targetUserId),
    updatedAt: Date.now(),
  };
  await writeSharedPlaylist(next);
  await removeFromIndex(targetUserId, id);
  return "ok";
}

export async function deleteSharedPlaylist(id: string, actorId: string): Promise<SharedPlaylistResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return "not_found";

  const playlist = await readSharedPlaylist(id);
  if (!playlist) return "not_found";
  if (playlist.ownerId !== actorId) return "forbidden";

  await Promise.all([
    removeFromIndex(playlist.ownerId, id),
    ...playlist.collaboratorIds.map((cid) => removeFromIndex(cid, id)),
  ]);
  await admin.client.storage.from(BUCKET).remove([getPlaylistPath(id)]);
  return "ok";
}
