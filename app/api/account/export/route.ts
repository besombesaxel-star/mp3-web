import { listTracksForApi } from "@/lib/libraryRepository";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { ZipWriter } from "@/lib/zipWriter";
import { unexpectedErrorResponse } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "sans-titre";
}

function extensionFromUrl(url: string, fallback: string) {
  try {
    const pathname = new URL(url).pathname;
    const dot = pathname.lastIndexOf(".");
    if (dot === -1) return fallback;
    const ext = pathname.slice(dot);
    return /^\.[a-z0-9]{2,5}$/i.test(ext) ? ext : fallback;
  } catch {
    return fallback;
  }
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const auth = await readAuthenticatedUser(req);
    if (!auth.user) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const allTracks = await listTracksForApi();
    const ownTracks = allTracks.filter((t) => t.ownerId === auth.user!.id);

    if (ownTracks.length === 0) {
      return Response.json({ ok: false, error: "Aucun son a exporter." }, { status: 404 });
    }

    const usedNames = new Set<string>();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const zip = new ZipWriter(controller);

        for (const track of ownTracks) {
          const audioBuffer = await fetchBuffer(track.src);
          if (!audioBuffer) continue; // skip tracks we can't fetch rather than aborting the whole export

          const ext = extensionFromUrl(track.src, ".mp3");
          const baseName = sanitizeFileName(`${track.artist} - ${track.title}`.replace(/^ - | - $/g, "") || track.title);
          let fileName = `${baseName}${ext}`;
          let suffix = 2;
          while (usedNames.has(fileName.toLowerCase())) {
            fileName = `${baseName} (${suffix})${ext}`;
            suffix += 1;
          }
          usedNames.add(fileName.toLowerCase());

          zip.addFile(fileName, audioBuffer);

          if (track.cover) {
            const coverBuffer = await fetchBuffer(track.cover);
            if (coverBuffer) {
              const coverExt = extensionFromUrl(track.cover, ".jpg");
              zip.addFile(`covers/${baseName}${coverExt}`, coverBuffer);
            }
          }
        }

        zip.finish();
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="ma-bibliotheque.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return unexpectedErrorResponse();
  }
}
