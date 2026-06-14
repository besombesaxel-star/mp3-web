import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";

export const runtime = "nodejs";

type Playlist = {
  id: string;
  name: string;
  trackSrcs: string[];
};

type Track = {
  title: string;
  artist?: string;
  src: string;
  cover?: string;
  accent?: string;
};

type MetaEntry = {
  title?: string;
  artist?: string;
};

type MetaFile = Record<string, MetaEntry>;

type CloudSnapshot = {
  savedAt: number;
  playlists: Playlist[];
  favorites: Track[];
  meta: MetaFile;
};

const META_PATH = path.join(process.cwd(), "data", "meta.json");

function getCloudPathForUser(userId: string) {
  return path.join(process.cwd(), "data", "cloud", `${userId}.json`);
}

async function ensureDataFile(filePath: string, fallback: unknown) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), "utf-8");
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  await ensureDataFile(filePath, fallback);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await ensureDataFile(filePath, value);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeTrack(value: unknown): Track | null {
  if (!isRecord(value)) return null;
  if (typeof value.title !== "string" || typeof value.src !== "string") return null;

  return {
    title: value.title,
    src: value.src,
    artist: typeof value.artist === "string" ? value.artist : undefined,
    cover: typeof value.cover === "string" ? value.cover : undefined,
    accent: typeof value.accent === "string" ? value.accent : undefined,
  };
}

function safePlaylist(value: unknown): Playlist | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (!Array.isArray(value.trackSrcs) || !value.trackSrcs.every((item) => typeof item === "string")) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    trackSrcs: value.trackSrcs,
  };
}

function safeMeta(value: unknown): MetaFile {
  if (!isRecord(value)) return {};
  const meta: MetaFile = {};

  for (const [src, entryValue] of Object.entries(value)) {
    if (!src) continue;
    if (!isRecord(entryValue)) continue;
    const title = typeof entryValue.title === "string" ? entryValue.title : undefined;
    const artist = typeof entryValue.artist === "string" ? entryValue.artist : undefined;
    if (!title && !artist) continue;
    meta[src] = { title, artist };
  }

  return meta;
}

function safeSnapshot(value: unknown): CloudSnapshot | null {
  if (!isRecord(value)) return null;
  const playlistsRaw = Array.isArray(value.playlists) ? value.playlists : [];
  const favoritesRaw = Array.isArray(value.favorites) ? value.favorites : [];

  const playlists = playlistsRaw
    .map((item: unknown) => safePlaylist(item))
    .filter((item: Playlist | null): item is Playlist => item !== null);
  const favorites = favoritesRaw
    .map((item: unknown) => safeTrack(item))
    .filter((item: Track | null): item is Track => item !== null);
  const meta = safeMeta(value.meta);

  const savedAt =
    typeof value.savedAt === "number" && Number.isFinite(value.savedAt) ? value.savedAt : Date.now();

  return {
    savedAt,
    playlists,
    favorites,
    meta,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const snapshotRaw = await readJson<unknown>(getCloudPathForUser(auth.user.id), null);
  const snapshot = safeSnapshot(snapshotRaw);
  if (!snapshot) {
    return NextResponse.json({ ok: true, exists: false });
  }

  return NextResponse.json({
    ok: true,
    exists: true,
    savedAt: snapshot.savedAt,
    playlistsCount: snapshot.playlists.length,
    favoritesCount: snapshot.favorites.length,
  });
}

export async function POST(req: Request) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const cloudPath = getCloudPathForUser(auth.user.id);

    if (action === "backup") {
      const playlistsRaw = Array.isArray(body?.playlists) ? body.playlists : [];
      const favoritesRaw = Array.isArray(body?.favorites) ? body.favorites : [];

      const playlists = playlistsRaw
        .map((item: unknown) => safePlaylist(item))
        .filter((item: Playlist | null): item is Playlist => item !== null);
      const favorites = favoritesRaw
        .map((item: unknown) => safeTrack(item))
        .filter((item: Track | null): item is Track => item !== null);
      const meta = safeMeta(await readJson<unknown>(META_PATH, {}));

      const snapshot: CloudSnapshot = {
        savedAt: Date.now(),
        playlists,
        favorites,
        meta,
      };

      await writeJson(cloudPath, snapshot);

      return NextResponse.json({
        ok: true,
        savedAt: snapshot.savedAt,
        playlistsCount: snapshot.playlists.length,
        favoritesCount: snapshot.favorites.length,
      });
    }

    if (action === "restore") {
      const snapshotRaw = await readJson<unknown>(cloudPath, null);
      const snapshot = safeSnapshot(snapshotRaw);
      if (!snapshot) {
        return NextResponse.json({ ok: false, error: "Aucune sauvegarde cloud" }, { status: 404 });
      }

      await writeJson(META_PATH, snapshot.meta);

      return NextResponse.json({
        ok: true,
        savedAt: snapshot.savedAt,
        playlists: snapshot.playlists,
        favorites: snapshot.favorites,
      });
    }

    return NextResponse.json({ ok: false, error: "Action invalide" }, { status: 400 });
  } catch (errorValue: unknown) {
    return NextResponse.json(
      { ok: false, error: "Cloud operation failed", details: getErrorMessage(errorValue) },
      { status: 500 }
    );
  }
}
