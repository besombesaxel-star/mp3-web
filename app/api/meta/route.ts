import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

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

async function readMeta(): Promise<MetaFile> {
  await ensureMetaFile();
  const raw = await fs.readFile(META_PATH, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as MetaFile;
  } catch {}
  return {};
}

async function writeMeta(meta: MetaFile) {
  await ensureMetaFile();
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2), "utf-8");
}

function normalizeSrc(src: string) {
  // support /Audio/... and /audio/...
  if (src.startsWith("/audio/")) return "/Audio/" + src.slice("/audio/".length);
  if (src.startsWith("/covers/")) return "/Covers/" + src.slice("/covers/".length);
  return src;
}

function isValidAudioSrc(src: string) {
  const s = normalizeSrc(src);
  return (
    typeof s === "string" &&
    (s.startsWith("/Audio/") || s.startsWith("/audio/")) &&
    s.toLowerCase().endsWith(".mp3") &&
    !s.includes("..") &&
    !s.includes("\\")
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  const meta = await readMeta();
  return NextResponse.json({ meta });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const src = body?.src;
    const title = body?.title;
    const artist = body?.artist;

    if (typeof src !== "string" || !isValidAudioSrc(src)) {
      return NextResponse.json({ ok: false, error: "src invalide" }, { status: 400 });
    }

    if (typeof title !== "string" || typeof artist !== "string") {
      return NextResponse.json({ ok: false, error: "title/artist invalides" }, { status: 400 });
    }

    const cleanTitle = title.trim();
    const cleanArtist = artist.trim();

    if (!cleanTitle) {
      return NextResponse.json({ ok: false, error: "Le titre ne peut pas être vide" }, { status: 400 });
    }

    const key = normalizeSrc(src);

    const meta = await readMeta();
    meta[key] = { title: cleanTitle, artist: cleanArtist || "Local" };
    await writeMeta(meta);

    return NextResponse.json({ ok: true });
  } catch (errorValue: unknown) {
    return NextResponse.json(
      { ok: false, error: "Meta update failed", details: getErrorMessage(errorValue) },
      { status: 500 }
    );
  }
}
