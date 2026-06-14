import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

type MetaEntry = { title?: string; artist?: string };
type MetaFile = Record<string, MetaEntry>;

const META_PATH = path.join(process.cwd(), "data", "meta.json");

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readMeta(): Promise<MetaFile> {
  try {
    const raw = await fs.readFile(META_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as MetaFile;
  } catch {}
  return {};
}

export async function GET() {
  const root = process.cwd();

  // ⚠️ tu utilises Audio/Covers avec majuscule (d’après tes captures)
  const audioDir = path.join(root, "public", "Audio");
  const coverDir = path.join(root, "public", "Covers");

  const meta = await readMeta();

  let audioFiles: string[] = [];
  try {
    audioFiles = (await fs.readdir(audioDir)).filter((f) => f.toLowerCase().endsWith(".mp3"));
  } catch {
    audioFiles = [];
  }

  const tracks: Array<{ title: string; artist: string; src: string; cover: string | null }> = [];

  for (const file of audioFiles) {
    const base = file.replace(/\.mp3$/i, "");

    // src canonical (majuscule)
    const src = `/Audio/${file}`;

    // titre par défaut depuis filename
    const defaultTitle = base.replace(/-\w{8}$/i, "").replace(/-/g, " ");
    const defaultArtist = "Local library";

    // cover lookup
    const candidates = [`${base}.jpg`, `${base}.jpeg`, `${base}.png`, `${base}.webp`];
    let coverUrl: string | null = null;

    for (const c of candidates) {
      const p = path.join(coverDir, c);
      if (await exists(p)) {
        coverUrl = `/Covers/${c}`;
        break;
      }
    }

    // override meta (supporte aussi /audio/ si jamais)
    const m = meta[src] ?? meta[src.replace("/Audio/", "/audio/")] ?? null;

    tracks.push({
      title: (m?.title && m.title.trim()) || defaultTitle,
      artist: (m?.artist && m.artist.trim()) || defaultArtist,
      src,
      cover: coverUrl,
    });
  }

  // tu avais déjà reverse() pour “récemment ajoutés”
  tracks.reverse();

  return NextResponse.json({ tracks });
}