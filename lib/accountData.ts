import {
  ensureSupabaseAccountBucketReady,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabaseAdmin";

type AccountProfileData = {
  favoriteSrcs: string[];
  publicBio: string;
  updatedAt: number;
  version: number;
};

const EMPTY_PROFILE: AccountProfileData = {
  favoriteSrcs: [],
  publicBio: "",
  updatedAt: 0,
  version: 1,
};

function getProfilePath(userId: string) {
  return `profiles/${userId}.json`;
}

function normalizeFavoriteSrcs(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const favoriteSrcs: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const src = item.trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    favoriteSrcs.push(src);
  }

  return favoriteSrcs;
}

function normalizePublicBio(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function normalizeProfile(raw: unknown): AccountProfileData {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_PROFILE, favoriteSrcs: [] };
  }

  const value = raw as { favoriteSrcs?: unknown; publicBio?: unknown; updatedAt?: unknown; version?: unknown };
  return {
    favoriteSrcs: normalizeFavoriteSrcs(value.favoriteSrcs),
    publicBio: normalizePublicBio(value.publicBio),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    version: typeof value.version === "number" ? value.version : 1,
  };
}

async function readBlobText(data: unknown) {
  if (data instanceof Blob) {
    return data.text();
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return data.toString("utf-8");
  }

  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }

  if (typeof data === "string") {
    return data;
  }

  if (data && typeof data === "object" && "text" in data && typeof data.text === "function") {
    const result = await data.text();
    return typeof result === "string" ? result : String(result);
  }

  return "";
}

function isMissingObjectError(error: unknown) {
  return error instanceof Error && /not found|404|no such file/i.test(error.message);
}

export async function readAccountProfile(userId: string) {
  if (!isSupabaseConfigured()) {
    return { ...EMPTY_PROFILE, favoriteSrcs: [] };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ...EMPTY_PROFILE, favoriteSrcs: [] };
  }

  await ensureSupabaseAccountBucketReady(admin.client, admin.accountBucket);

  const profilePath = getProfilePath(userId);
  const { data, error } = await admin.client.storage.from(admin.accountBucket).download(profilePath);
  if (error) {
    if (isMissingObjectError(error)) {
      return { ...EMPTY_PROFILE, favoriteSrcs: [] };
    }
    throw error;
  }

  const text = await readBlobText(data);
  if (!text.trim()) {
    return { ...EMPTY_PROFILE, favoriteSrcs: [] };
  }

  try {
    return normalizeProfile(JSON.parse(text));
  } catch {
    return { ...EMPTY_PROFILE, favoriteSrcs: [] };
  }
}

async function writeAccountProfile(userId: string, profile: AccountProfileData) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase n'est pas configure.");
  }

  await ensureSupabaseAccountBucketReady(admin.client, admin.accountBucket);

  const payload = JSON.stringify(
    {
      favoriteSrcs: normalizeFavoriteSrcs(profile.favoriteSrcs),
      publicBio: normalizePublicBio(profile.publicBio),
      updatedAt: Date.now(),
      version: 1,
    },
    null,
    2
  );

  const profilePath = getProfilePath(userId);
  const { error } = await admin.client.storage.from(admin.accountBucket).upload(profilePath, payload, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: true,
  });

  if (error) {
    throw error;
  }
}

export async function saveAccountProfile(
  userId: string,
  patch: {
    favoriteSrcs?: string[];
    publicBio?: string;
  }
) {
  const current = await readAccountProfile(userId);
  const next: AccountProfileData = {
    favoriteSrcs:
      patch.favoriteSrcs === undefined ? current.favoriteSrcs : normalizeFavoriteSrcs(patch.favoriteSrcs),
    publicBio: patch.publicBio === undefined ? current.publicBio : normalizePublicBio(patch.publicBio),
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
