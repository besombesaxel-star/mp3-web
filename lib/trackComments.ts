import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hashStringToHex } from "@/lib/publicLinks";

export type TrackComment = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  text: string;
  createdAt: number;
};

export type TrackCommentsData = {
  comments: TrackComment[];
  reactions: Record<string, string[]>;
};

export const ALLOWED_TRACK_REACTIONS = ["🔥", "❤️", "😍", "🎧", "👏"];

const MAX_COMMENTS = 500;
const MAX_COMMENT_LENGTH = 300;
const BUCKET = "account-data";

export function getTrackId(src: string): string {
  return hashStringToHex(src);
}

function getTrackCommentsPath(src: string): string {
  return `track-comments/${getTrackId(src)}.json`;
}

function emptyData(): TrackCommentsData {
  return { comments: [], reactions: {} };
}

function normalizeData(raw: unknown): TrackCommentsData {
  if (!raw || typeof raw !== "object") return emptyData();
  const value = raw as { comments?: unknown; reactions?: unknown };

  const comments: TrackComment[] = Array.isArray(value.comments)
    ? value.comments.filter((c): c is TrackComment =>
        Boolean(
          c &&
            typeof c === "object" &&
            typeof (c as TrackComment).id === "string" &&
            typeof (c as TrackComment).userId === "string" &&
            typeof (c as TrackComment).text === "string"
        )
      )
    : [];

  const reactions: Record<string, string[]> = {};
  if (value.reactions && typeof value.reactions === "object") {
    for (const [emoji, userIds] of Object.entries(value.reactions as Record<string, unknown>)) {
      if (!ALLOWED_TRACK_REACTIONS.includes(emoji) || !Array.isArray(userIds)) continue;
      reactions[emoji] = [...new Set(userIds.filter((id): id is string => typeof id === "string"))];
    }
  }

  return { comments, reactions };
}

export async function readTrackComments(src: string): Promise<TrackCommentsData> {
  const admin = getSupabaseAdmin();
  if (!admin) return emptyData();

  const { data, error } = await admin.client.storage.from(BUCKET).download(getTrackCommentsPath(src));
  if (error || !data) return emptyData();

  try {
    return normalizeData(JSON.parse(await data.text()));
  } catch {
    return emptyData();
  }
}

async function writeTrackComments(src: string, data: TrackCommentsData): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getTrackCommentsPath(src), blob, { upsert: true, contentType: "application/json" });
}

export async function addTrackComment(
  src: string,
  author: { userId: string; displayName: string; avatarUrl: string; text: string }
): Promise<TrackComment> {
  const text = author.text.trim().slice(0, MAX_COMMENT_LENGTH);
  const comment: TrackComment = {
    id: crypto.randomUUID(),
    userId: author.userId,
    displayName: author.displayName,
    avatarUrl: author.avatarUrl,
    text,
    createdAt: Date.now(),
  };

  const current = await readTrackComments(src);
  const updated: TrackCommentsData = {
    ...current,
    comments: [...current.comments, comment].slice(-MAX_COMMENTS),
  };
  await writeTrackComments(src, updated);

  return comment;
}

export async function deleteTrackComment(
  src: string,
  commentId: string,
  actorUserId: string,
  isAdmin: boolean
): Promise<"ok" | "not_found" | "forbidden"> {
  const current = await readTrackComments(src);
  const target = current.comments.find((c) => c.id === commentId);
  if (!target) return "not_found";
  if (target.userId !== actorUserId && !isAdmin) return "forbidden";

  const updated: TrackCommentsData = {
    ...current,
    comments: current.comments.filter((c) => c.id !== commentId),
  };
  await writeTrackComments(src, updated);
  return "ok";
}

export async function toggleTrackReaction(src: string, emoji: string, userId: string): Promise<TrackCommentsData> {
  const current = await readTrackComments(src);
  const existing = current.reactions[emoji] ?? [];
  const has = existing.includes(userId);

  const nextReactions = {
    ...current.reactions,
    [emoji]: has ? existing.filter((id) => id !== userId) : [...existing, userId],
  };

  const updated: TrackCommentsData = { ...current, reactions: nextReactions };
  await writeTrackComments(src, updated);
  return updated;
}
