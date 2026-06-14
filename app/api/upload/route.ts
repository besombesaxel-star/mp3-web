import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import crypto from "crypto";

export const runtime = "nodejs";

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function safeBaseName(name: string) {
  const base = name
    .replace(/\.[^/.]+$/, "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return base || "track";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const cover = form.get("cover");

    if (!(audio instanceof File)) {
      return NextResponse.json({ ok: false, error: "Tu dois envoyer un fichier MP3 (audio)." }, { status: 400 });
    }

    const audioName = audio.name || "track.mp3";
    const audioType = audio.type || "";
    const isMp3 = audioType.includes("audio/mpeg") || audioName.toLowerCase().endsWith(".mp3");
    if (!isMp3) {
      return NextResponse.json({ ok: false, error: "Seuls les fichiers .mp3 sont acceptés." }, { status: 400 });
    }

    const maxBytes = 80 * 1024 * 1024;
    if (audio.size > maxBytes) {
      return NextResponse.json({ ok: false, error: "Fichier trop lourd (max 80MB)." }, { status: 400 });
    }

    const id = crypto.randomBytes(4).toString("hex");
    const base = safeBaseName(audioName);
    const finalBase = `${base}-${id}`;

    // IMPORTANT: tu as public/Audio et public/Covers (majuscule)
    const root = process.cwd();
    const audioDir = path.join(root, "public", "Audio");
    const coverDir = path.join(root, "public", "Covers");

    await ensureDir(audioDir);
    await ensureDir(coverDir);

    const audioBuf = Buffer.from(await audio.arrayBuffer());
    const audioFilename = `${finalBase}.mp3`;
    await fs.writeFile(path.join(audioDir, audioFilename), audioBuf);

    let coverFilename: string | null = null;
    if (cover instanceof File && cover.size > 0) {
      const coverName = (cover.name || "").toLowerCase();
      const coverType = cover.type || "";

      const ok =
        coverType.startsWith("image/") ||
        coverName.endsWith(".jpg") ||
        coverName.endsWith(".jpeg") ||
        coverName.endsWith(".png") ||
        coverName.endsWith(".webp");

      if (!ok) {
        return NextResponse.json({ ok: false, error: "La cover doit être une image (jpg/png/webp)." }, { status: 400 });
      }

      const ext =
        coverName.endsWith(".png") ? ".png" :
        coverName.endsWith(".webp") ? ".webp" : ".jpg";

      const coverBuf = Buffer.from(await cover.arrayBuffer());
      coverFilename = `${finalBase}${ext}`;
      await fs.writeFile(path.join(coverDir, coverFilename), coverBuf);
    }

    return NextResponse.json({
      ok: true,
      track: {
        title: base.replace(/-/g, " "),
        artist: "Local upload",
        src: `/Audio/${audioFilename}`,
        cover: coverFilename ? `/Covers/${coverFilename}` : null,
      },
    });
  } catch (errorValue: unknown) {
    return NextResponse.json(
      { ok: false, error: "Upload failed", details: getErrorMessage(errorValue) },
      { status: 500 }
    );
  }
}
