import crypto from "crypto";
import path from "path";
import { promises as fs } from "fs";
import { getCoverExtension, safeBaseName } from "@/lib/libraryFiles";
import type { LibraryTrack } from "@/lib/libraryTypes";
import {
  ensureLibraryDirs,
  findCoverUrl,
  getAudioSrcVariants,
  getCanonicalAudioDir,
  getCanonicalCoverDir,
  listLibraryAudioFiles,
  normalizeAudioSrc,
} from "@/lib/libraryStorage";

type MetaEntry = {
  title?: string;
  artist?: string;
};

type MetaFile = Record<string, MetaEntry>;

const META_PATH = path.join(process.cwd(), "data", "meta.json");

async function ensureMetaFile() {
  const dir = path.dirname(META_PATH);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(META_PATH);
  } catch {
    await fs.writeFile(META_PATH, JSON.stringify({}, null, 2), "utf-8");
  }
}

export async function readLocalMeta(): Promise<MetaFile> {
  await ensureMetaFile();
  try {
    const raw = await fs.readFile(META_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as MetaFile;
    }
  } catch {}
  return {};
}

async function writeLocalMeta(meta: MetaFile) {
  await ensureMetaFile();
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2), "utf-8");
}

function getMetaForSrc(meta: MetaFile, src: string) {
  for (const candidate of getAudioSrcVariants(src)) {
    const entry = meta[candidate];
    if (entry) return entry;
  }
  return null;
}

export async function listLocalTracks(): Promise<LibraryTrack[]> {
  const meta = await readLocalMeta();
  const audioFiles = await listLibraryAudioFiles();

  const tracks: LibraryTrack[] = [];

  for (const { file, src, addedAt } of audioFiles) {
    const base = file.replace(/\.mp3$/i, "");
    const defaultTitle = base.replace(/-\w{8}$/i, "").replace(/-/g, " ");
    const defaultArtist = "Local library";
    const coverUrl = await findCoverUrl(base);
    const metaEntry = getMetaForSrc(meta, src);

    tracks.push({
      title: (metaEntry?.title && metaEntry.title.trim()) || defaultTitle,
      artist: (metaEntry?.artist && metaEntry.artist.trim()) || defaultArtist,
      src: normalizeAudioSrc(src),
      cover: coverUrl,
      createdAt: addedAt,
      backend: "local",
      fileName: file,
    });
  }

  return tracks;
}

export async function uploadLocalTrack(audio: File, cover: File | null) {
  const id = crypto.randomBytes(4).toString("hex");
  const base = safeBaseName(audio.name || "track.mp3");
  const finalBase = `${base}-${id}`;

  await ensureLibraryDirs();

  const audioFilename = `${finalBase}.mp3`;
  const audioDir = getCanonicalAudioDir();
  const audioBuf = Buffer.from(await audio.arrayBuffer());
  await fs.writeFile(path.join(audioDir, audioFilename), audioBuf);

  let coverUrl: string | null = null;
  if (cover instanceof File && cover.size > 0) {
    const coverFilename = `${finalBase}${getCoverExtension(cover.name || "")}`;
    const coverDir = getCanonicalCoverDir();
    const coverBuf = Buffer.from(await cover.arrayBuffer());
    await fs.writeFile(path.join(coverDir, coverFilename), coverBuf);
    coverUrl = `/cover/${coverFilename}`;
  }

  return {
    title: base.replace(/-/g, " "),
    artist: "Local upload",
    src: `/audio/${audioFilename}`,
    cover: coverUrl,
    createdAt: Date.now(),
    backend: "local" as const,
    fileName: audioFilename,
  };
}

export async function saveLocalTrackMeta(src: string, title: string, artist: string) {
  const key = normalizeAudioSrc(src);
  const meta = await readLocalMeta();
  meta[key] = { title: title.trim(), artist: artist.trim() || "Local" };
  await writeLocalMeta(meta);
}
