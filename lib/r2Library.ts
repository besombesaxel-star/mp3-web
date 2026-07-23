import crypto from "crypto";
import {
  createR2PresignedPutUrl,
  deleteR2Objects,
  getR2Admin,
  getR2KeyFromPublicUrl,
  getR2Object,
  getR2PublicUrl,
  isR2Configured,
  listR2Objects,
  putR2Object,
  type R2Admin,
} from "@/lib/r2Storage";
import {
  getAudioContentType,
  getAudioExtension,
  getCoverContentType,
  getCoverExtension,
  isAcceptedAudioFileName,
  safeBaseName,
  stripAudioExtension,
} from "@/lib/libraryFiles";
import type { LibraryMutationResult, LibraryTrack } from "@/lib/libraryTypes";

type R2CatalogTrack = {
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

type R2TrackOwner = {
  displayName?: string | null;
  email?: string | null;
  id: string;
};

type R2Catalog = {
  version: number;
  updatedAt: number;
  tracks: R2CatalogTrack[];
};

function emptyCatalog(): R2Catalog {
  return { version: 1, updatedAt: 0, tracks: [] };
}

function toLibraryTrack(track: R2CatalogTrack): LibraryTrack | null {
  if (typeof track.src !== "string" || typeof track.title !== "string") {
    return null;
  }

  return {
    title: track.title,
    artist: typeof track.artist === "string" && track.artist.trim() ? track.artist : "Local library",
    src: track.src,
    cover: typeof track.cover === "string" ? track.cover : null,
    createdAt: typeof track.createdAt === "number" ? track.createdAt : 0,
    backend: "r2",
    fileName: typeof track.fileName === "string" ? track.fileName : undefined,
    ownerDisplayName: typeof track.ownerDisplayName === "string" ? track.ownerDisplayName : null,
    ownerEmail: typeof track.ownerEmail === "string" ? track.ownerEmail : null,
    ownerId: typeof track.ownerId === "string" ? track.ownerId : null,
    credits: typeof track.credits === "string" ? track.credits : null,
  };
}

function normalizeCatalog(raw: unknown): R2Catalog {
  if (!raw || typeof raw !== "object") return emptyCatalog();

  const value = raw as { version?: unknown; updatedAt?: unknown; tracks?: unknown };
  const rawTracks = Array.isArray(value.tracks) ? value.tracks : [];
  const tracks: R2CatalogTrack[] = [];

  for (const item of rawTracks) {
    if (!item || typeof item !== "object") continue;
    const track = item as Partial<R2CatalogTrack>;
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
      credits: typeof track.credits === "string" ? track.credits : null,
    });
  }

  return {
    version: typeof value.version === "number" ? value.version : 1,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    tracks,
  };
}

async function readR2Catalog(admin: R2Admin): Promise<R2Catalog> {
  const buffer = await getR2Object(admin, admin.catalogPath);
  if (!buffer) return emptyCatalog();

  const text = buffer.toString("utf-8");
  if (!text.trim()) return emptyCatalog();

  try {
    return normalizeCatalog(JSON.parse(text));
  } catch {
    return emptyCatalog();
  }
}

async function writeR2Catalog(admin: R2Admin, catalog: R2Catalog) {
  const payload = JSON.stringify(
    {
      version: 1,
      updatedAt: Date.now(),
      tracks: catalog.tracks,
    },
    null,
    2
  );

  await putR2Object(admin, admin.catalogPath, payload, "application/json", { cacheControl: "no-cache" });
}

function dedupeCatalogTracks(tracks: R2CatalogTrack[]) {
  const seen = new Set<string>();
  const result: R2CatalogTrack[] = [];

  for (const track of tracks) {
    const key = (track.fileName || track.src).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(track);
  }

  result.sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title, "fr"));
  return result;
}

async function listR2FallbackTracks(admin: R2Admin): Promise<LibraryTrack[]> {
  const [audioObjects, coverObjects] = await Promise.all([
    listR2Objects(admin, "audio"),
    listR2Objects(admin, "cover"),
  ]);

  const coverByBase = new Map<string, string>();
  for (const object of coverObjects) {
    const base = object.name.replace(/\.(jpg|jpeg|png|webp)$/i, "");
    coverByBase.set(base, getR2PublicUrl(admin, `cover/${object.name}`));
  }

  const tracks: R2CatalogTrack[] = [];
  for (const object of audioObjects) {
    if (!isAcceptedAudioFileName(object.name)) continue;

    const base = stripAudioExtension(object.name);
    const audioPath = `audio/${object.name}`;

    tracks.push({
      title: base.replace(/-\w{8}$/i, "").replace(/-/g, " "),
      artist: "Shared library",
      src: getR2PublicUrl(admin, audioPath),
      cover: coverByBase.get(base) || null,
      createdAt: object.createdAt,
      fileName: object.name,
      audioPath,
      coverPath: coverByBase.has(base) ? `cover/${base}` : null,
      ownerDisplayName: null,
      ownerEmail: null,
      ownerId: null,
    });
  }

  return dedupeCatalogTracks(tracks)
    .map((track) => toLibraryTrack(track))
    .filter((track): track is LibraryTrack => track !== null);
}

export function isR2TrackSrc(src: string) {
  const admin = getR2Admin();
  if (!admin) return false;
  return getR2KeyFromPublicUrl(admin, src) !== null;
}

export async function listR2Tracks(): Promise<LibraryTrack[]> {
  if (!isR2Configured()) return [];
  const admin = getR2Admin();
  if (!admin) return [];

  const catalog = await readR2Catalog(admin);
  const tracks = dedupeCatalogTracks(catalog.tracks)
    .map((track) => toLibraryTrack(track))
    .filter((track): track is LibraryTrack => track !== null);

  if (tracks.length > 0) {
    return tracks;
  }

  return listR2FallbackTracks(admin);
}

function findCatalogTrackBySrc(catalog: R2Catalog, src: string) {
  return catalog.tracks.find((track) => track.src === src) ?? null;
}

function isTrackOwnedByUser(track: R2CatalogTrack, actorUserId: string | null | undefined) {
  return Boolean(actorUserId && track.ownerId && track.ownerId === actorUserId);
}

function resolveAudioPath(admin: R2Admin, track: R2CatalogTrack) {
  if (typeof track.audioPath === "string" && track.audioPath.trim()) {
    return track.audioPath.trim();
  }
  return getR2KeyFromPublicUrl(admin, track.src);
}

function resolveCoverPath(admin: R2Admin, track: R2CatalogTrack) {
  if (typeof track.coverPath === "string" && track.coverPath.trim()) {
    return track.coverPath.trim();
  }
  if (typeof track.cover !== "string" || !track.cover.trim()) {
    return null;
  }
  return getR2KeyFromPublicUrl(admin, track.cover);
}

export async function uploadR2Track(audio: File, cover: File | null, owner: R2TrackOwner): Promise<LibraryTrack> {
  const admin = getR2Admin();
  if (!admin) {
    throw new Error("R2 n'est pas configure.");
  }

  const id = crypto.randomUUID().slice(0, 8);
  const base = safeBaseName(audio.name || "track.mp3");
  const finalBase = `${base}-${id}`;
  const createdAt = Date.now();

  const extension = getAudioExtension(audio.name || "", audio.type);
  const audioFilename = `${finalBase}${extension}`;
  const audioPath = `audio/${audioFilename}`;
  const audioBuffer = Buffer.from(await audio.arrayBuffer());

  await putR2Object(admin, audioPath, audioBuffer, audio.type || getAudioContentType(extension), {
    cacheControl: "max-age=31536000",
  });

  const audioPublicUrl = getR2PublicUrl(admin, audioPath);

  let coverPublicUrl: string | null = null;
  let coverPath: string | null = null;

  if (cover instanceof File && cover.size > 0) {
    const coverExtension = getCoverExtension(cover.name || "");
    const coverFilename = `${finalBase}${coverExtension}`;
    coverPath = `cover/${coverFilename}`;
    const coverBuffer = Buffer.from(await cover.arrayBuffer());

    await putR2Object(admin, coverPath, coverBuffer, cover.type || getCoverContentType(coverExtension), {
      cacheControl: "max-age=31536000",
    });

    coverPublicUrl = getR2PublicUrl(admin, coverPath);
  }

  const catalog = await readR2Catalog(admin);
  const nextTrack: R2CatalogTrack = {
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
  await writeR2Catalog(admin, catalog);

  const libraryTrack = toLibraryTrack(nextTrack);
  if (!libraryTrack) {
    throw new Error("Impossible de construire la piste partagee.");
  }

  return libraryTrack;
}

export async function createR2UploadTargets(audioName: string, coverName: string | null) {
  const admin = getR2Admin();
  if (!admin) {
    throw new Error("R2 n'est pas configure.");
  }

  const id = crypto.randomUUID().slice(0, 8);
  const base = safeBaseName(audioName || "track.mp3");
  const finalBase = `${base}-${id}`;

  const audioExtension = getAudioExtension(audioName || "");
  const audioPath = `audio/${finalBase}${audioExtension}`;
  const audioContentType = getAudioContentType(audioExtension);
  const audioUrl = await createR2PresignedPutUrl(admin, audioPath, audioContentType);

  let coverTarget: { path: string; url: string; contentType: string } | null = null;
  if (coverName) {
    const coverExtension = getCoverExtension(coverName);
    const coverPath = `cover/${finalBase}${coverExtension}`;
    const coverContentType = getCoverContentType(coverExtension);
    const coverUrl = await createR2PresignedPutUrl(admin, coverPath, coverContentType);
    coverTarget = { path: coverPath, url: coverUrl, contentType: coverContentType };
  }

  return {
    bucket: admin.bucket,
    audio: { path: audioPath, url: audioUrl, contentType: audioContentType },
    cover: coverTarget,
  };
}

export async function finalizeR2TrackUpload(params: {
  audioPath: string;
  coverPath: string | null;
  owner: R2TrackOwner;
}): Promise<LibraryTrack> {
  const admin = getR2Admin();
  if (!admin) {
    throw new Error("R2 n'est pas configure.");
  }

  if (!params.audioPath.startsWith("audio/") || (params.coverPath && !params.coverPath.startsWith("cover/"))) {
    throw new Error("Chemin de fichier invalide.");
  }

  const audioPublicUrl = getR2PublicUrl(admin, params.audioPath);
  const coverPublicUrl = params.coverPath ? getR2PublicUrl(admin, params.coverPath) : null;

  const createdAt = Date.now();
  const fileName = params.audioPath.split("/").pop() || "track.mp3";
  const base = stripAudioExtension(fileName).replace(/-\w{8}$/i, "");

  const catalog = await readR2Catalog(admin);
  const nextTrack: R2CatalogTrack = {
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
  await writeR2Catalog(admin, catalog);

  const libraryTrack = toLibraryTrack(nextTrack);
  if (!libraryTrack) {
    throw new Error("Impossible de construire la piste partagee.");
  }

  return libraryTrack;
}

export async function saveR2TrackMeta(
  src: string,
  title: string,
  artist: string,
  actorUserId?: string | null,
  credits?: string | null
): Promise<LibraryMutationResult> {
  if (!isR2Configured()) return "unsupported";
  const admin = getR2Admin();
  if (!admin) return "unsupported";

  const catalog = await readR2Catalog(admin);
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
  await writeR2Catalog(admin, catalog);
  return "ok";
}

export async function saveR2TrackCover(
  src: string,
  cover: File,
  actorUserId?: string | null
): Promise<LibraryMutationResult> {
  if (!isR2Configured()) return "unsupported";

  const admin = getR2Admin();
  if (!admin) return "unsupported";

  const catalog = await readR2Catalog(admin);
  const target = findCatalogTrackBySrc(catalog, src);
  if (!target) return "not_found";
  if (!isTrackOwnedByUser(target, actorUserId)) return "forbidden";

  const previousCoverPath = resolveCoverPath(admin, target);
  const base = safeBaseName(target.fileName ? stripAudioExtension(target.fileName) : target.title || "track");
  const coverId = crypto.randomUUID().slice(0, 8);
  const coverExtension = getCoverExtension(cover.name || "");
  const coverPath = `cover/${base}-${coverId}${coverExtension}`;
  const coverBuffer = Buffer.from(await cover.arrayBuffer());

  await putR2Object(admin, coverPath, coverBuffer, cover.type || getCoverContentType(coverExtension), {
    cacheControl: "max-age=31536000",
  });

  const coverPublicUrl = getR2PublicUrl(admin, coverPath);

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
  await writeR2Catalog(admin, catalog);

  if (previousCoverPath && previousCoverPath !== coverPath) {
    await deleteR2Objects(admin, [previousCoverPath]).catch(() => {});
  }

  return "ok";
}

export async function deleteR2Track(src: string, actorUserId?: string | null): Promise<LibraryMutationResult> {
  if (!isR2Configured()) return "unsupported";

  const admin = getR2Admin();
  if (!admin) return "unsupported";

  const catalog = await readR2Catalog(admin);
  const target = findCatalogTrackBySrc(catalog, src);
  if (!target) return "not_found";
  if (!isTrackOwnedByUser(target, actorUserId)) return "forbidden";

  const removePaths = [resolveAudioPath(admin, target), resolveCoverPath(admin, target)].filter(
    (value): value is string => Boolean(value)
  );

  if (removePaths.length > 0) {
    await deleteR2Objects(admin, removePaths);
  }

  catalog.tracks = catalog.tracks.filter((track) => track.src !== src);
  catalog.tracks = dedupeCatalogTracks(catalog.tracks);
  await writeR2Catalog(admin, catalog);
  return "ok";
}
