import {
  ensureSupabaseAccountBucketReady,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabaseAdmin";

export type ProfileLink = {
  id: string;
  label: string;
  url: string;
};

type AccountProfileData = {
  avatarUrl: string;
  favoriteSrcs: string[];
  followersCount: number;
  following: string[];
  links: ProfileLink[];
  pinnedTrackSrcs: string[];
  publicBio: string;
  themeHue: number | null;
  updatedAt: number;
  version: number;
};

const EMPTY_PROFILE: AccountProfileData = {
  avatarUrl: "",
  favoriteSrcs: [],
  followersCount: 0,
  following: [],
  links: [],
  pinnedTrackSrcs: [],
  publicBio: "",
  themeHue: null,
  updatedAt: 0,
  version: 1,
};

function getProfilePath(userId: string) {
  return `profiles/${userId}.json`;
}

function normalizeFavoriteSrcs(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const src = item.trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
  }
  return out;
}

function normalizePublicBio(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

function normalizeLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  const out: ProfileLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 80) : "";
    const url = typeof item.url === "string" ? item.url.trim().slice(0, 500) : "";
    if (!id || !label || !url) continue;
    out.push({ id, label, url });
  }
  return out.slice(0, 20);
}

function normalizePinnedTrackSrcs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const src = item.trim();
    if (!src) continue;
    out.push(src);
  }
  return out.slice(0, 6);
}

function normalizeFollowing(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(0, 2000);
}

function normalizeFollowersCount(value: unknown): number {
  if (typeof value !== "number" || !isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizeThemeHue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!isFinite(n)) return null;
  return Math.round(n) % 360;
}

function normalizeProfile(raw: unknown): AccountProfileData {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PROFILE };
  const v = raw as Record<string, unknown>;
  return {
    avatarUrl: typeof v.avatarUrl === "string" ? v.avatarUrl.trim() : "",
    favoriteSrcs: normalizeFavoriteSrcs(v.favoriteSrcs),
    followersCount: normalizeFollowersCount(v.followersCount),
    following: normalizeFollowing(v.following),
    links: normalizeLinks(v.links),
    pinnedTrackSrcs: normalizePinnedTrackSrcs(v.pinnedTrackSrcs),
    publicBio: normalizePublicBio(v.publicBio),
    themeHue: normalizeThemeHue(v.themeHue),
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
    version: typeof v.version === "number" ? v.version : 1,
  };
}

async function readBlobText(data: unknown) {
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) return data.toString("utf-8");
  if (data instanceof Uint8Array) return new TextDecoder().decode(data);
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "text" in data && typeof (data as { text: unknown }).text === "function") {
    const result = await (data as { text: () => unknown }).text();
    return typeof result === "string" ? result : String(result);
  }
  return "";
}

function isMissingObjectError(error: unknown) {
  return error instanceof Error && /not found|404|no such file/i.test(error.message);
}

export async function readAccountProfile(userId: string) {
  if (!isSupabaseConfigured()) return { ...EMPTY_PROFILE };
  const admin = getSupabaseAdmin();
  if (!admin) return { ...EMPTY_PROFILE };

  await ensureSupabaseAccountBucketReady(admin.client, admin.accountBucket);

  const { data, error } = await admin.client.storage
    .from(admin.accountBucket)
    .download(getProfilePath(userId));

  if (error) {
    if (isMissingObjectError(error)) return { ...EMPTY_PROFILE };
    throw error;
  }

  const text = await readBlobText(data);
  if (!text.trim()) return { ...EMPTY_PROFILE };

  try {
    return normalizeProfile(JSON.parse(text));
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

async function writeAccountProfile(userId: string, profile: AccountProfileData) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase n'est pas configure.");
  await ensureSupabaseAccountBucketReady(admin.client, admin.accountBucket);

  const payload = JSON.stringify({
    avatarUrl: typeof profile.avatarUrl === "string" ? profile.avatarUrl.trim() : "",
    favoriteSrcs: normalizeFavoriteSrcs(profile.favoriteSrcs),
    followersCount: normalizeFollowersCount(profile.followersCount),
    following: normalizeFollowing(profile.following),
    links: normalizeLinks(profile.links),
    pinnedTrackSrcs: normalizePinnedTrackSrcs(profile.pinnedTrackSrcs),
    publicBio: normalizePublicBio(profile.publicBio),
    themeHue: normalizeThemeHue(profile.themeHue),
    updatedAt: Date.now(),
    version: 1,
  }, null, 2);

  const { error } = await admin.client.storage
    .from(admin.accountBucket)
    .upload(getProfilePath(userId), payload, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });

  if (error) throw error;
}

export async function saveAccountProfile(
  userId: string,
  patch: {
    avatarUrl?: string;
    favoriteSrcs?: string[];
    followersCount?: number;
    following?: string[];
    links?: ProfileLink[];
    pinnedTrackSrcs?: string[];
    publicBio?: string;
    themeHue?: number | null;
  }
) {
  const current = await readAccountProfile(userId);
  const next: AccountProfileData = {
    avatarUrl: patch.avatarUrl === undefined ? current.avatarUrl : patch.avatarUrl.trim(),
    favoriteSrcs: patch.favoriteSrcs === undefined ? current.favoriteSrcs : normalizeFavoriteSrcs(patch.favoriteSrcs),
    followersCount: patch.followersCount === undefined ? current.followersCount : normalizeFollowersCount(patch.followersCount),
    following: patch.following === undefined ? current.following : normalizeFollowing(patch.following),
    links: patch.links === undefined ? current.links : normalizeLinks(patch.links),
    pinnedTrackSrcs: patch.pinnedTrackSrcs === undefined ? current.pinnedTrackSrcs : normalizePinnedTrackSrcs(patch.pinnedTrackSrcs),
    publicBio: patch.publicBio === undefined ? current.publicBio : normalizePublicBio(patch.publicBio),
    themeHue: patch.themeHue === undefined ? current.themeHue : normalizeThemeHue(patch.themeHue),
    updatedAt: Date.now(),
    version: 1,
  };
  await writeAccountProfile(userId, next);
  return next;
}

export async function saveAccountFavoriteSrcs(userId: string, favoriteSrcs: string[]) {
  await saveAccountProfile(userId, { favoriteSrcs });
}

export async function saveAccountPublicBio(userId: string, publicBio: string) {
  await saveAccountProfile(userId, { publicBio });
}
