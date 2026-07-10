import crypto from "crypto";
import { getSupabaseAdmin, ensureSupabaseBucketReady, isSupabaseConfigured } from "@/lib/supabaseAdmin";
import {
  getAudioContentType,
  getAudioExtension,
  getCoverExtension,
  isAcceptedAudioFileName,
  safeBaseName,
  stripAudioExtension,
} from "@/lib/libraryFiles";
import type { LibraryMutationResult, LibraryTrack } from "@/lib/libraryTypes";

type SupabaseCatalogTrack = {
  title: string;
  artist: string;
  src: string;
  cover: string | null;
  createdAt: number;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
  ownerId?: string | null;
  updatedAt?: number;
  fileName?: string;
  audioPath?: string;
  coverPath?: string | null;
  credits?: string | null;
};

type SupabaseTrackOwner = {
  displayName?: string | null;
  email?: string | null;
  id: string;
};

type SupabaseCatalog = {
  version: number;
  updatedAt: number;
  tracks: SupabaseCatalogTrack[];
};

const EMPTY_CATALOG: SupabaseCatalog = {
  version: 1,
  updatedAt: 0,
  tracks: [],
};

function getPublicUrl(value: unknown) {
  if (!value || typeof value !== "object") return "";
  if ("publicUrl" in value && typeof value.publicUrl === "string") return value.publicUrl;
  if ("publicURL" in value && typeof value.publicURL === "string") return value.publicURL;
  return "";
}

function toLibraryTrack(track: SupabaseCatalogTrack): LibraryTrack | null {
  if (typeof track.src !== "string" || typeof track.title !== "string") {
    return null;
  }

  return {
    title: track.title,
    artist: typeof track.artist === "string" && track.artist.trim() ? track.artist : "Local library",
    src: track.src,
    cover: typeof track.cover === "string" ? track.cover : null,
    createdAt: typeof track.createdAt === "number" ? track.createdAt : 0,
    backend: "supabase",
    fileName: typeof track.fileName === "string" ? track.fileName : undefined,
    ownerDisplayName: typeof track.ownerDisplayName === "string" ? track.ownerDisplayName : null,
    ownerEmail: typeof track.ownerEmail === "string" ? track.ownerEmail : null,
    ownerId: typeof track.ownerId === "string" ? track.ownerId : null,
    credits: typeof track.credits === "string" ? track.credits : null,
  };
}

function emptyCatalog() {
  return { ...EMPTY_CATALOG, tracks: [] };
}

function isMissingObjectError(error: unknown) {
  return error instanceof Error && /not found|404|no such file/i.test(error.message);
}

function normalizeCatalog(raw: unknown): SupabaseCatalog {
  if (!raw || typeof raw !== "object") return emptyCatalog();

  const value = raw as { version?: unknown; updatedAt?: unknown; tracks?: unknown };
  const rawTracks = Array.isArray(value.tracks) ? value.tracks : [];
  const tracks: SupabaseCatalogTrack[] = [];

  for (const item of rawTracks) {
    if (!item || typeof item !== "object") continue;
    const track = item as Partial<SupabaseCatalogTrack>;
    if (typeof track.src !== "string" || typeof track.title !== "string") continue;

    tracks.push({
      title: track.title,
      artist: typeof track.artist === "string" ? track.artist : "Local library",
      src: track.src,
      cover: typeof track.cover === "string" ? track.cover : null,
      createdAt: typeof track.createdAt === "number" ? track.createdAt : 0,
      ownerDisplayName: typeof track.ownerDisplayName === "string" ? track.ownerDisplayName : null,
      ownerEmail: typeof track.ownerEmail === "string" ? track.ownerEmail : null,
      ownerId: typeof track.ownerId === "string" ? track.ownerId : null,
      updatedAt: typeof track.updatedAt === "number" ? track.updatedAt : undefined,
      fileName: typeof track.fileName === "string" ? track.fileName : undefined,
      audioPath: typeof track.audioPath === "string" ? track.audioPath : undefined,
      coverPath: typeof track.coverPath === "string" ? track.coverPath : null,
    });
  }

  return {
    version: typeof value.version === "number" ? value.version : 1,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    tracks,
  };
}

async function readBlobText(data: unknown) {
  if (data instanceof Blob) {
    return data.text();
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return data.toString("utf-8");
  }

  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }

  if (typeof data === "string") {
    return data;
  }

  if (data && typeof data === "object" && "text" in data && typeof data.text === "function") {
    const result = await data.text();
    return typeof result === "string" ? result : String(result);
  }

  return "";
}

async function readSupabaseCatalog() {
  const admin = getSupabaseAdmin();
  if (!admin) return emptyCatalog();

  await ensureSupabaseBucketReady(admin.client, admin.bucket);

  const { data, error } = await admin.client.storage.from(admin.bucket).download(admin.catalogPath);
  if (error) {
    if (isMissingObjectError(error)) return emptyCatalog();
    throw error;
  }

  const text = await readBlobText(data);
  if (!text.trim()) return emptyCatalog();

  try {
    return normalizeCatalog(JSON.parse(text));
  } catch {
    return emptyCatalog();
  }
}

async function writeSupabaseCatalog(catalog: SupabaseCatalog) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase n'est pas configure.");
  }

  await ensureSupabaseBucketReady(admin.client, admin.bucket);

  const payload = JSON.stringify(
    {
      version: 1,
      updatedAt: Date.now(),
      tracks: catalog.tracks,
    },
    null,
    2
  );

  const { error } = await admin.client.storage.from(admin.bucket).upload(admin.catalogPath, payload, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: true,
  });

  if (error) {
    throw error;
  }
}

function dedupeCatalogTracks(tracks: SupabaseCatalogTrack[]) {
  const seen = new Set<string>();
  const result: SupabaseCatalogTrack[] = [];

  for (const track of tracks) {
    const key = (track.fileName || track.src).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(track);
  }

  result.sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title, "fr"));
  return result;
}

async function listStorageFallbackTracks() {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  await ensureSupabaseBucketReady(admin.client, admin.bucket);

  const { data: audioObjects, error: audioError } = await admin.client.storage.from(admin.bucket).list("audio", {
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });

  if (audioError) {
    throw audioError;
  }

  const { data: coverObjects, error: coverError } = await admin.client.storage.from(admin.bucket).list("cover", {
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });

  if (coverError) {
    throw coverError;
  }

  const coverByBase = new Map<string, string>();
  for (const object of coverObjects ?? []) {
    const name = typeof object.name === "string" ? object.name : "";
    if (!name) continue;
    const base = name.replace(/\.(jpg|jpeg|png|webp)$/i, "");
    const coverPath = `cover/${name}`;
    const publicData = admin.client.storage.from(admin.bucket).getPublicUrl(coverPath).data;
    coverByBase.set(base, getPublicUrl(publicData));
  }

  const tracks: SupabaseCatalogTrack[] = [];
  for (const object of audioObjects ?? []) {
    const name = typeof object.name === "string" ? object.name : "";
    if (!name || !isAcceptedAudioFileName(name)) continue;

    const base = stripAudioExtension(name);
    const audioPath = `audio/${name}`;
    const publicData = admin.client.storage.from(admin.bucket).getPublicUrl(audioPath).data;
    const createdAtRaw =
      typeof object.created_at === "string"
        ? object.created_at
        : typeof object.updated_at === "string"
          ? object.updated_at
          : "";

    tracks.push({
      title: base.replace(/-\w{8}$/i, "").replace(/-/g, " "),
      artist: "Shared library",
      src: getPublicUrl(publicData),
      cover: coverByBase.get(base) || null,
      createdAt: createdAtRaw ? new Date(createdAtRaw).getTime() : 0,
      fileName: name,
      audioPath,
      coverPath: coverByBase.has(base) ? `cover/${base}` : null,
      ownerDisplayName: null,
      ownerEmail: null,
      ownerId: null,
    });
  }

  return dedupeCatalogTracks(tracks).map((track) => toLibraryTrack(track)).filter((track): track is LibraryTrack => track !== null);
}

export function isSupabaseTrackSrc(src: string) {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && /supabase\.co$/i.test(url.hostname) && url.pathname.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

export async function listSupabaseTracks(): Promise<LibraryTrack[]> {
  if (!isSupabaseConfigured()) return [];

  const catalog = await readSupabaseCatalog();
  const tracks = dedupeCatalogTracks(catalog.tracks)
    .map((track) => toLibraryTrack(track))
    .filter((track): track is LibraryTrack => track !== null);

  if (tracks.length > 0) {
    return tracks;
  }

  return listStorageFallbackTracks();
}

function findCatalogTrackBySrc(catalog: SupabaseCatalog, src: string) {
  return catalog.tracks.find((track) => track.src === src) ?? null;
}

function isTrackOwnedByUser(track: SupabaseCatalogTrack, actorUserId: string | null | undefined) {
  return Boolean(actorUserId && track.ownerId && track.ownerId === actorUserId);
}

function getStoragePathFromPublicUrl(src: string, bucket: string) {
  try {
    const url = new URL(src);
    const prefix = `/storage/v1/object/public/${bucket}/`;
    const index = url.pathname.indexOf(prefix);
    if (index < 0) return null;
    return decodeURIComponent(url.pathname.slice(index + prefix.length));
  } catch {
    return null;
  }
}

function resolveAudioPath(track: SupabaseCatalogTrack, bucket: string) {
  if (typeof track.audioPath === "string" && track.audioPath.trim()) {
    return track.audioPath.trim();
  }

  return getStoragePathFromPublicUrl(track.src, bucket);
}

function resolveCoverPath(track: SupabaseCatalogTrack, bucket: string) {
  if (typeof track.coverPath === "string" && track.coverPath.trim()) {
    return track.coverPath.trim();
  }

  if (typeof track.cover !== "string" || !track.cover.trim()) {
    return null;
  }

  return getStoragePathFromPublicUrl(track.cover, bucket);
}

export async function uploadSupabaseTrack(audio: File, cover: File | null, owner: SupabaseTrackOwner) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase n'est pas configure.");
  }

  await ensureSupabaseBucketReady(admin.client, admin.bucket);

  const id = crypto.randomUUID().slice(0, 8);
  const base = safeBaseName(audio.name || "track.mp3");
  const finalBase = `${base}-${id}`;
  const createdAt = Date.now();

  const extension = getAudioExtension(audio.name || "", audio.type);
  const audioFilename = `${finalBase}${extension}`;
  const audioPath = `audio/${audioFilename}`;
  const audioBuffer = Buffer.from(await audio.arrayBuffer());

  const { error: audioUploadError } = await admin.client.storage.from(admin.bucket).upload(audioPath, audioBuffer, {
    contentType: audio.type || getAudioContentType(extension),
    cacheControl: "31536000",
    upsert: false,
  });

  if (audioUploadError) {
    throw audioUploadError;
  }

  const audioPublicUrl = getPublicUrl(admin.client.storage.from(admin.bucket).getPublicUrl(audioPath).data);

  let coverPublicUrl: string | null = null;
  let coverPath: string | null = null;

  if (cover instanceof File && cover.size > 0) {
    const coverFilename = `${finalBase}${getCoverExtension(cover.name || "")}`;
    coverPath = `cover/${coverFilename}`;
    const coverBuffer = Buffer.from(await cover.arrayBuffer());

    const { error: coverUploadError } = await admin.client.storage.from(admin.bucket).upload(coverPath, coverBuffer, {
      contentType: cover.type || "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });

    if (coverUploadError) {
      throw coverUploadError;
    }

    coverPublicUrl = getPublicUrl(admin.client.storage.from(admin.bucket).getPublicUrl(coverPath).data);
  }

  const catalog = await readSupabaseCatalog();
  const nextTrack: SupabaseCatalogTrack = {
    title: base.replace(/-/g, " "),
    artist: "Local upload",
    src: audioPublicUrl,
    cover: coverPublicUrl,
    createdAt,
    ownerDisplayName: owner.displayName?.trim() || null,
    ownerEmail: owner.email?.trim() || null,
    ownerId: owner.id,
    updatedAt: createdAt,
    fileName: audioFilename,
    audioPath,
    coverPath,
  };

  catalog.tracks = dedupeCatalogTracks([nextTrack, ...catalog.tracks]);
  await writeSupabaseCatalog(catalog);

  const libraryTrack = toLibraryTrack(nextTrack);
  if (!libraryTrack) {
    throw new Error("Impossible de construire la piste partagee.");
  }

  return libraryTrack;
}

export async function createSupabaseUploadTargets(audioName: string, coverName: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase n'est pas configure.");
  }

  await ensureSupabaseBucketReady(admin.client, admin.bucket);

  const id = crypto.randomUUID().slice(0, 8);
  const base = safeBaseName(audioName || "track.mp3");
  const finalBase = `${base}-${id}`;

  const audioPath = `audio/${finalBase}${getAudioExtension(audioName || "")}`;
  const { data: audioSigned, error: audioError } = await admin.client.storage
    .from(admin.bucket)
    .createSignedUploadUrl(audioPath);

  if (audioError || !audioSigned) {
    throw audioError ?? new Error("Impossible de preparer l'upload audio.");
  }

  let coverTarget: { path: string; token: string } | null = null;
  if (coverName) {
    const coverPath = `cover/${finalBase}${getCoverExtension(coverName)}`;
    const { data: coverSigned, error: coverError } = await admin.client.storage
      .from(admin.bucket)
      .createSignedUploadUrl(coverPath);

    if (coverError || !coverSigned) {
      throw coverError ?? new Error("Impossible de preparer l'upload de la cover.");
    }

    coverTarget = { path: coverPath, token: coverSigned.token };
  }

  return {
    bucket: admin.bucket,
    audio: { path: audioPath, token: audioSigned.token },
    cover: coverTarget,
  };
}

export async function finalizeSupabaseTrackUpload(params: {
  audioPath: string;
  coverPath: string | null;
  owner: SupabaseTrackOwner;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase n'est pas configure.");
  }

  if (!params.audioPath.startsWith("audio/") || (params.coverPath && !params.coverPath.startsWith("cover/"))) {
    throw new Error("Chemin de fichier invalide.");
  }

  const audioPublicUrl = getPublicUrl(admin.client.storage.from(admin.bucket).getPublicUrl(params.audioPath).data);
  const coverPublicUrl = params.coverPath
    ? getPublicUrl(admin.client.storage.from(admin.bucket).getPublicUrl(params.coverPath).data)
    : null;

  const createdAt = Date.now();
  const fileName = params.audioPath.split("/").pop() || "track.mp3";
  const base = stripAudioExtension(fileName).replace(/-\w{8}$/i, "");

  const catalog = await readSupabaseCatalog();
  const nextTrack: SupabaseCatalogTrack = {
    title: base.replace(/-/g, " "),
    artist: "Local upload",
    src: audioPublicUrl,
    cover: coverPublicUrl,
    createdAt,
    ownerDisplayName: params.owner.displayName?.trim() || null,
    ownerEmail: params.owner.email?.trim() || null,
    ownerId: params.owner.id,
    updatedAt: createdAt,
    fileName,
    audioPath: params.audioPath,
    coverPath: params.coverPath,
  };

  catalog.tracks = dedupeCatalogTracks([nextTrack, ...catalog.tracks]);
  await writeSupabaseCatalog(catalog);

  const libraryTrack = toLibraryTrack(nextTrack);
  if (!libraryTrack) {
    throw new Error("Impossible de construire la piste partagee.");
  }

  return libraryTrack;
}

export async function saveSupabaseTrackMeta(
  src: string,
  title: string,
  artist: string,
  actorUserId?: string | null,
  credits?: string | null
): Promise<LibraryMutationResult> {
  if (!isSupabaseConfigured()) return "unsupported";

  const catalog = await readSupabaseCatalog();
  const target = findCatalogTrackBySrc(catalog, src);
  if (!target) return "not_found";
  if (!isTrackOwnedByUser(target, actorUserId)) return "forbidden";

  catalog.tracks = catalog.tracks.map((track) => {
    if (track.src !== src) return track;
    return {
      ...track,
      title: title.trim(),
      artist: artist.trim() || "Local",
      credits: typeof credits === "string" ? credits.trim().slice(0, 300) || null : track.credits ?? null,
      updatedAt: Date.now(),
    };
  });

  catalog.tracks = dedupeCatalogTracks(catalog.tracks);
  await writeSupabaseCatalog(catalog);
  return "ok";
}

export async function saveSupabaseTrackCover(
  src: string,
  cover: File,
  actorUserId?: string | null
): Promise<LibraryMutationResult> {
  if (!isSupabaseConfigured()) return "unsupported";

  const admin = getSupabaseAdmin();
  if (!admin) return "unsupported";

  const catalog = await readSupabaseCatalog();
  const target = findCatalogTrackBySrc(catalog, src);
  if (!target) return "not_found";
  if (!isTrackOwnedByUser(target, actorUserId)) return "forbidden";

  await ensureSupabaseBucketReady(admin.client, admin.bucket);

  const previousCoverPath = resolveCoverPath(target, admin.bucket);
  const base = safeBaseName(target.fileName ? stripAudioExtension(target.fileName) : target.title || "track");
  const coverId = crypto.randomUUID().slice(0, 8);
  const coverPath = `cover/${base}-${coverId}${getCoverExtension(cover.name || "")}`;
  const coverBuffer = Buffer.from(await cover.arrayBuffer());

  const { error: coverUploadError } = await admin.client.storage.from(admin.bucket).upload(coverPath, coverBuffer, {
    contentType: cover.type || "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });

  if (coverUploadError) {
    throw coverUploadError;
  }

  const coverPublicUrl = getPublicUrl(admin.client.storage.from(admin.bucket).getPublicUrl(coverPath).data);

  catalog.tracks = catalog.tracks.map((track) => {
    if (track.src !== src) return track;
    return {
      ...track,
      cover: coverPublicUrl,
      coverPath,
      updatedAt: Date.now(),
    };
  });

  catalog.tracks = dedupeCatalogTracks(catalog.tracks);
  await writeSupabaseCatalog(catalog);

  if (previousCoverPath && previousCoverPath !== coverPath) {
    await admin.client.storage.from(admin.bucket).remove([previousCoverPath]).catch(() => {});
  }

  return "ok";
}

export async function deleteSupabaseTrack(
  src: string,
  actorUserId?: string | null
): Promise<LibraryMutationResult> {
  if (!isSupabaseConfigured()) return "unsupported";

  const admin = getSupabaseAdmin();
  if (!admin) return "unsupported";

  const catalog = await readSupabaseCatalog();
  const target = findCatalogTrackBySrc(catalog, src);
  if (!target) return "not_found";
  if (!isTrackOwnedByUser(target, actorUserId)) return "forbidden";

  await ensureSupabaseBucketReady(admin.client, admin.bucket);

  const removePaths = [resolveAudioPath(target, admin.bucket), resolveCoverPath(target, admin.bucket)].filter(
    (value): value is string => Boolean(value)
  );

  if (removePaths.length > 0) {
    const { error } = await admin.client.storage.from(admin.bucket).remove(removePaths);
    if (error) {
      throw error;
    }
  }

  catalog.tracks = catalog.tracks.filter((track) => track.src !== src);
  catalog.tracks = dedupeCatalogTracks(catalog.tracks);
  await writeSupabaseCatalog(catalog);
  return "ok";
}
