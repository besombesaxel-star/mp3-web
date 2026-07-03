import { ensureSupabaseAccountBucketReady, getSupabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET_PATH_PREFIX = "comments";
const MAX_COMMENTS_PER_TRACK = 200;
const MAX_CONTENT_LENGTH = 500;

export type TrackComment = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  content: string;
  createdAt: string;
};

function commentsPath(src: string) {
  return `${BUCKET_PATH_PREFIX}/${encodeURIComponent(src)}.json`;
}

export async function getCommentsForTrack(src: string): Promise<TrackComment[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin.client.storage.from(admin.accountBucket).download(commentsPath(src));
  if (error || !data) return [];

  try {
    const parsed = JSON.parse(await data.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveCommentsForTrack(src: string, comments: TrackComment[]) {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  await ensureSupabaseAccountBucketReady(admin.client, admin.accountBucket);
  const blob = new Blob([JSON.stringify(comments.slice(-MAX_COMMENTS_PER_TRACK))], { type: "application/json" });
  await admin.client.storage
    .from(admin.accountBucket)
    .upload(commentsPath(src), blob, { upsert: true, contentType: "application/json" });
}

export async function addCommentToTrack(
  src: string,
  input: { userId: string; displayName: string; avatarUrl: string; content: string }
): Promise<TrackComment | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const content = input.content.trim().slice(0, MAX_CONTENT_LENGTH);
  if (!content) return null;

  const comment: TrackComment = {
    id: crypto.randomUUID(),
    userId: input.userId,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    content,
    createdAt: new Date().toISOString(),
  };

  const current = await getCommentsForTrack(src);
  await saveCommentsForTrack(src, [...current, comment]);

  return comment;
}

export async function deleteCommentFromTrack(
  src: string,
  commentId: string,
  actorUserId: string,
  isAdmin: boolean
): Promise<"ok" | "forbidden" | "not_found"> {
  const current = await getCommentsForTrack(src);
  const target = current.find((c) => c.id === commentId);
  if (!target) return "not_found";

  if (target.userId !== actorUserId && !isAdmin) return "forbidden";

  await saveCommentsForTrack(src, current.filter((c) => c.id !== commentId));
  return "ok";
}
