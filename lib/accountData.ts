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

export type AccountPlaylist = {
  id: string;
  name: string;
  trackSrcs: string[];
};

export type EqPreset = "off" | "bass" | "vocal" | "night" | "custom";

const EQ_PRESETS: EqPreset[] = ["off", "bass", "vocal", "night", "custom"];

export type EqGains = [number, number, number, number, number];

type AccountProfileData = {
  avatarUrl: string;
  customEqGains: EqGains | null;
  eqPreset: EqPreset | null;
  favoriteSrcs: string[];
  followersCount: number;
  following: string[];
  links: ProfileLink[];
  pinnedTrackSrcs: string[];
  playlists: AccountPlaylist[];
  publicBio: string;
  themeHue: number | null;
  updatedAt: number;
  version: number;
};

const EMPTY_PROFILE: AccountProfileData = {
  avatarUrl: "",
  customEqGains: null,
  eqPreset: null,
  favoriteSrcs: [],
  followersCount: 0,
  following: [],
  links: [],
  pinnedTrackSrcs: [],
  playlists: [],
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

function normalizePlaylists(value: unknown): AccountPlaylist[] {
  if (!Array.isArray(value)) return [];
  const out: AccountPlaylist[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const id = typeof v.id === "string" ? v.id.trim() : "";
    const name = typeof v.name === "string" ? v.name.trim().slice(0, 80) : "";
    if (!id || !name) continue;

    const trackSrcsRaw = Array.isArray(v.trackSrcs) ? v.trackSrcs : [];
    const trackSrcs = trackSrcsRaw
      .filter((src): src is string => typeof src === "string" && src.trim().length > 0)
      .slice(0, 1000);

    out.push({ id, name, trackSrcs });
    if (out.length >= 200) break;
  }

  return out;
}

function normalizeEqPreset(value: unknown): EqPreset | null {
  return typeof value === "string" && EQ_PRESETS.includes(value as EqPreset) ? (value as EqPreset) : null;
}

function normalizeCustomEqGains(value: unknown): EqGains | null {
  if (!Array.isArray(value) || value.length !== 5) return null;
  const gains = value.map((v) => (typeof v === "number" && isFinite(v) ? Math.max(-12, Math.min(12, v)) : 0));
  return gains as EqGains;
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
    customEqGains: normalizeCustomEqGains(v.customEqGains),
    eqPreset: normalizeEqPreset(v.eqPreset),
    favoriteSrcs: normalizeFavoriteSrcs(v.favoriteSrcs),
    followersCount: normalizeFollowersCount(v.followersCount),
    following: normalizeFollowing(v.following),
    links: normalizeLinks(v.links),
    pinnedTrackSrcs: normalizePinnedTrackSrcs(v.pinnedTrackSrcs),
    playlists: normalizePlaylists(v.playlists),
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
    customEqGains: normalizeCustomEqGains(profile.customEqGains),
    eqPreset: normalizeEqPreset(profile.eqPreset),
    favoriteSrcs: normalizeFavoriteSrcs(profile.favoriteSrcs),
    followersCount: normalizeFollowersCount(profile.followersCount),
    following: normalizeFollowing(profile.following),
    links: normalizeLinks(profile.links),
    pinnedTrackSrcs: normalizePinnedTrackSrcs(profile.pinnedTrackSrcs),
    playlists: normalizePlaylists(profile.playlists),
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
    customEqGains?: EqGains | null;
    eqPreset?: EqPreset | null;
    favoriteSrcs?: string[];
    followersCount?: number;
    following?: string[];
    links?: ProfileLink[];
    pinnedTrackSrcs?: string[];
    playlists?: AccountPlaylist[];
    publicBio?: string;
    themeHue?: number | null;
  }
) {
  const current = await readAccountProfile(userId);
  const next: AccountProfileData = {
    avatarUrl: patch.avatarUrl === undefined ? current.avatarUrl : patch.avatarUrl.trim(),
    customEqGains: patch.customEqGains === undefined ? current.customEqGains : normalizeCustomEqGains(patch.customEqGains),
    eqPreset: patch.eqPreset === undefined ? current.eqPreset : normalizeEqPreset(patch.eqPreset),
    favoriteSrcs: patch.favoriteSrcs === undefined ? current.favoriteSrcs : normalizeFavoriteSrcs(patch.favoriteSrcs),
    followersCount: patch.followersCount === undefined ? current.followersCount : normalizeFollowersCount(patch.followersCount),
    following: patch.following === undefined ? current.following : normalizeFollowing(patch.following),
    links: patch.links === undefined ? current.links : normalizeLinks(patch.links),
    pinnedTrackSrcs: patch.pinnedTrackSrcs === undefined ? current.pinnedTrackSrcs : normalizePinnedTrackSrcs(patch.pinnedTrackSrcs),
    playlists: patch.playlists === undefined ? current.playlists : normalizePlaylists(patch.playlists),
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
