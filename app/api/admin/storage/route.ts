import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/adminAccess";
import { readAuthenticatedUser } from "@/lib/supabaseAuthServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2Admin, listR2Objects } from "@/lib/r2Storage";
import { listTracksForApi } from "@/lib/libraryRepository";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCOUNT_DATA_PREFIXES = ["profiles", "stats", "notifications", "badges", "chat", "push"];

type FileObjectLike = {
  name: string;
  metadata?: { size?: number } | null;
};

async function listAllFiles(client: SupabaseClient, bucket: string, prefix: string): Promise<FileObjectLike[]> {
  const all: FileObjectLike[] = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });

    if (error || !data) break;

    // storage.list() can return sub-folder placeholders (no id/size); keep only real files.
    for (const entry of data) {
      if (entry.id) all.push(entry);
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return all;
}

function sumSize(files: FileObjectLike[]): number {
  return files.reduce((total, file) => total + (file.metadata?.size ?? 0), 0);
}

export async function GET(req: Request) {
  const auth = await readAuthenticatedUser(req);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!isAdminUser(auth.user.id)) {
    return NextResponse.json({ ok: false, error: "Acces refuse" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const r2Admin = getR2Admin();
  if (!admin && !r2Admin) {
    return NextResponse.json({ ok: true, configured: false });
  }

  try {
    const [r2AudioFiles, r2CoverFiles, legacyAudioFiles, legacyCoverFiles, tracks, accountDataCounts] =
      await Promise.all([
        r2Admin ? listR2Objects(r2Admin, "audio") : Promise.resolve([] as FileObjectLike[]),
        r2Admin ? listR2Objects(r2Admin, "cover") : Promise.resolve([] as FileObjectLike[]),
        admin ? listAllFiles(admin.client, admin.bucket, "audio") : Promise.resolve([] as FileObjectLike[]),
        admin ? listAllFiles(admin.client, admin.bucket, "cover") : Promise.resolve([] as FileObjectLike[]),
        listTracksForApi(),
        admin
          ? Promise.all(
              ACCOUNT_DATA_PREFIXES.map((prefix) =>
                listAllFiles(admin.client, admin.accountBucket, prefix).catch(() => [] as FileObjectLike[])
              )
            )
          : Promise.resolve([] as FileObjectLike[][]),
      ]);

    const audioFiles = [...r2AudioFiles, ...legacyAudioFiles];
    const coverFiles = [...r2CoverFiles, ...legacyCoverFiles];

    const ownerByFileName = new Map<string, { ownerId: string; displayName: string }>();
    for (const track of tracks) {
      if (track.fileName && track.ownerId) {
        ownerByFileName.set(track.fileName, {
          ownerId: track.ownerId,
          displayName: track.ownerDisplayName?.trim() || track.ownerEmail?.trim() || "Inconnu",
        });
      }
    }

    const usageByOwner = new Map<string, { ownerId: string; displayName: string; bytes: number; trackCount: number }>();
    for (const file of audioFiles) {
      const owner = ownerByFileName.get(file.name);
      if (!owner) continue;
      const size = file.metadata?.size ?? 0;
      const existing = usageByOwner.get(owner.ownerId) ?? {
        ownerId: owner.ownerId,
        displayName: owner.displayName,
        bytes: 0,
        trackCount: 0,
      };
      existing.bytes += size;
      existing.trackCount += 1;
      usageByOwner.set(owner.ownerId, existing);
    }

    const topUsers = [...usageByOwner.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 15);

    const accountDataFiles = accountDataCounts.flat();

    return NextResponse.json({
      ok: true,
      configured: true,
      media: {
        audioBytes: sumSize(audioFiles),
        audioCount: audioFiles.length,
        coverBytes: sumSize(coverFiles),
        coverCount: coverFiles.length,
      },
      legacyMedia: {
        audioBytes: sumSize(legacyAudioFiles),
        audioCount: legacyAudioFiles.length,
        coverBytes: sumSize(legacyCoverFiles),
        coverCount: legacyCoverFiles.length,
      },
      accountData: {
        bytes: sumSize(accountDataFiles),
        count: accountDataFiles.length,
      },
      topUsers,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
