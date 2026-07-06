import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type DirectMessage = {
  id: string;
  senderId: string;
  content: string;
  createdAt: number;
};

const BUCKET = "account-data";
const MAX_MESSAGES = 300;

export function getConversationId(a: string, b: string): string {
  return [a, b].sort().join("__");
}

export function getOtherParticipant(conversationId: string, userId: string): string | null {
  const [a, b] = conversationId.split("__");
  if (a === userId) return b ?? null;
  if (b === userId) return a ?? null;
  return null;
}

function getConversationPath(conversationId: string) {
  return `dm/${conversationId}.json`;
}

export async function readConversation(conversationId: string): Promise<DirectMessage[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin.client.storage.from(BUCKET).download(getConversationPath(conversationId));
  if (error || !data) return [];

  try {
    const json = JSON.parse(await data.text());
    return Array.isArray(json) ? (json as DirectMessage[]) : [];
  } catch {
    return [];
  }
}

export async function appendMessage(conversationId: string, message: DirectMessage): Promise<DirectMessage[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const history = await readConversation(conversationId);
  const updated = [...history, message].slice(-MAX_MESSAGES);

  const blob = new Blob([JSON.stringify(updated)], { type: "application/json" });
  await admin.client.storage
    .from(BUCKET)
    .upload(getConversationPath(conversationId), blob, { upsert: true, contentType: "application/json" });

  return updated;
}

export async function listConversationIdsForUser(userId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin.client.storage.from(BUCKET).list("dm", { limit: 1000 });
  if (error || !data) return [];

  return data
    .filter((file) => file.id && file.name.endsWith(".json"))
    .map((file) => file.name.replace(/\.json$/i, ""))
    .filter((id) => id.split("__").includes(userId));
}
