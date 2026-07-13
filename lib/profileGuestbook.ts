import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type GuestbookEntry = {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl: string;
  text: string;
  createdAt: number;
};

export type GuestbookData = {
  entries: GuestbookEntry[];
};

const MAX_ENTRIES = 200;
const MAX_ENTRY_LENGTH = 200;
const BUCKET = "account-data";

function getGuestbookPath(profileOwnerId: string): string {
  return `guestbook/${profileOwnerId}.json`;
}

function emptyData(): GuestbookData {
  return { entries: [] };
}

function normalizeData(raw: unknown): GuestbookData {
  if (!raw || typeof raw !== "object") return emptyData();
  const value = raw as { entries?: unknown };

  const entries: GuestbookEntry[] = Array.isArray(value.entries)
    ? value.entries.filter((e): e is GuestbookEntry =>
        Boolean(
          e &&
            typeof e === "object" &&
            typeof (e as GuestbookEntry).id === "string" &&
            typeof (e as GuestbookEntry).authorId === "string" &&
            typeof (e as GuestbookEntry).text === "string"
        )
      )
    : [];

  return { entries };
}

export async function readGuestbook(profileOwnerId: string): Promise<GuestbookData> {
  const admin = getSupabaseAdmin();
  if (!admin) return emptyData();

  const { data, error } = await admin.client.storage.from(BUCKET).download(getGuestbookPath(profileOwnerId));
  if (error || !data) return emptyData();

  try {
    return normalizeData(JSON.parse(await data.text()));
  } catch {
    return emptyData();
  }
}

async function writeGuestbook(profileOwnerId: string, data: GuestbookData): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getGuestbookPath(profileOwnerId), blob, { upsert: true, contentType: "application/json" });
}

export async function addGuestbookEntry(
  profileOwnerId: string,
  author: { authorId: string; authorDisplayName: string; authorAvatarUrl: string; text: string }
): Promise<GuestbookEntry> {
  const text = author.text.trim().slice(0, MAX_ENTRY_LENGTH);
  const entry: GuestbookEntry = {
    id: crypto.randomUUID(),
    authorId: author.authorId,
    authorDisplayName: author.authorDisplayName,
    authorAvatarUrl: author.authorAvatarUrl,
    text,
    createdAt: Date.now(),
  };

  const current = await readGuestbook(profileOwnerId);
  const updated: GuestbookData = {
    entries: [...current.entries, entry].slice(-MAX_ENTRIES),
  };
  await writeGuestbook(profileOwnerId, updated);

  return entry;
}

/**
 * Unlike track comments, the profile owner can also remove entries from
 * their own wall (moderation), not just the entry's author or an admin.
 */
export async function deleteGuestbookEntry(
  profileOwnerId: string,
  entryId: string,
  actorUserId: string,
  isAdmin: boolean
): Promise<"ok" | "not_found" | "forbidden"> {
  const current = await readGuestbook(profileOwnerId);
  const target = current.entries.find((e) => e.id === entryId);
  if (!target) return "not_found";
  if (target.authorId !== actorUserId && profileOwnerId !== actorUserId && !isAdmin) return "forbidden";

  const updated: GuestbookData = {
    entries: current.entries.filter((e) => e.id !== entryId),
  };
  await writeGuestbook(profileOwnerId, updated);
  return "ok";
}
