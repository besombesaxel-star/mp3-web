import path from "path";
import { promises as fs } from "fs";

const PUBLIC_DIR = path.join(process.cwd(), "public");

const AUDIO_DIR_CANDIDATES = ["audio", "Audio"] as const;
const COVER_DIR_CANDIDATES = ["cover", "covers", "Cover", "Covers"] as const;

export type LibraryAudioFile = {
  file: string;
  addedAt: number;
  src: string;
};

function buildPublicUrl(dirName: string, file: string) {
  return `/${dirName}/${file}`;
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function getAudioRelativePath(src: string) {
  if (typeof src !== "string") return null;
  if (src.startsWith("/audio/")) return src.slice("/audio/".length);
  if (src.startsWith("/Audio/")) return src.slice("/Audio/".length);
  return null;
}

export function getCanonicalAudioDir() {
  return path.join(PUBLIC_DIR, "audio");
}

export function getCanonicalCoverDir() {
  return path.join(PUBLIC_DIR, "cover");
}

export async function ensureLibraryDirs() {
  await fs.mkdir(getCanonicalAudioDir(), { recursive: true });
  await fs.mkdir(getCanonicalCoverDir(), { recursive: true });
}

export function normalizeAudioSrc(src: string) {
  const relativePath = getAudioRelativePath(src);
  return relativePath ? buildPublicUrl("audio", relativePath) : src;
}

export function getAudioSrcVariants(src: string) {
  const relativePath = getAudioRelativePath(src);
  return relativePath ? [buildPublicUrl("audio", relativePath), buildPublicUrl("Audio", relativePath)] : [src];
}

export function isValidLibraryAudioSrc(src: string) {
  const relativePath = getAudioRelativePath(src);
  return (
    typeof relativePath === "string" &&
    relativePath.toLowerCase().endsWith(".mp3") &&
    !relativePath.includes("..") &&
    !relativePath.includes("\\")
  );
}

export async function listLibraryAudioFiles(): Promise<LibraryAudioFile[]> {
  const files = new Map<string, LibraryAudioFile>();

  for (const dirName of AUDIO_DIR_CANDIDATES) {
    const dirPath = path.join(PUBLIC_DIR, dirName);

    let names: string[] = [];
    try {
      names = (await fs.readdir(dirPath)).filter((file) => file.toLowerCase().endsWith(".mp3"));
    } catch {
      continue;
    }

    for (const file of names) {
      if (files.has(file)) continue;

      let addedAt = 0;
      try {
        const stats = await fs.stat(path.join(dirPath, file));
        addedAt = stats.mtimeMs;
      } catch {
        addedAt = 0;
      }

      files.set(file, {
        file,
        addedAt,
        src: buildPublicUrl(dirName, file),
      });
    }
  }

  return [...files.values()].sort((a, b) => b.addedAt - a.addedAt || a.file.localeCompare(b.file, "fr"));
}

export async function findCoverUrl(base: string) {
  const candidates = [`${base}.jpg`, `${base}.jpeg`, `${base}.png`, `${base}.webp`];

  for (const dirName of COVER_DIR_CANDIDATES) {
    const dirPath = path.join(PUBLIC_DIR, dirName);

    for (const file of candidates) {
      if (await pathExists(path.join(dirPath, file))) {
        return buildPublicUrl(dirName, file);
      }
    }
  }

  return null;
}
