import path from "path";
import { promises as fs } from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const rootDir = process.cwd();
const execute = process.argv.includes("--execute");
const force = process.argv.includes("--force");
const mapFilePath = path.join(rootDir, "r2-migration-map.json");

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function loadEnvFile(fileName) {
  const filePath = path.join(rootDir, fileName);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = stripQuotes(trimmed.slice(separatorIndex + 1).trim());
      if (!key || process.env[key]) continue;
      process.env[key] = value;
    }
  } catch {}
}

function readSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "media";
  const catalogPath = process.env.SUPABASE_CATALOG_PATH?.trim() || "catalog/tracks.json";
  const accountBucket = process.env.SUPABASE_ACCOUNT_BUCKET?.trim() || "account-data";

  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, bucket, catalogPath, accountBucket };
}

function readR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() || "media";
  const catalogPath = process.env.R2_CATALOG_PATH?.trim() || "catalog/tracks.json";
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim() ?? "";
  const endpoint = process.env.R2_ENDPOINT?.trim() || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!accountId || !accessKeyId || !secretAccessKey || !publicBaseUrl || !endpoint) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, catalogPath, publicBaseUrl, endpoint };
}

function isMissingError(error) {
  return error instanceof Error && /not found|404|no such file/i.test(error.message);
}

function getContentType(fileName) {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith(".mp3")) return "audio/mpeg";
  if (lowered.endsWith(".flac")) return "audio/flac";
  if (lowered.endsWith(".wav")) return "audio/wav";
  if (lowered.endsWith(".png")) return "image/png";
  if (lowered.endsWith(".webp")) return "image/webp";
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg";
  if (lowered.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function getR2PublicUrl(r2Config, key) {
  const base = r2Config.publicBaseUrl.replace(/\/$/, "");
  const encodedKey = key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${base}/${encodedKey}`;
}

async function r2ObjectExists(s3, r2Config, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: r2Config.bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return false;
    throw error;
  }
}

async function listSupabasePrefix(supabase, bucket, prefix) {
  const all = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const entry of data) {
      if (entry.id) all.push(entry.name);
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return all;
}

async function copyObjectToR2(supabase, supabaseBucket, s3, r2Config, key, { skipIfExists }) {
  if (skipIfExists && (await r2ObjectExists(s3, r2Config, key))) {
    return "skip";
  }

  const { data, error } = await supabase.storage.from(supabaseBucket).download(key);
  if (error) {
    if (isMissingError(error)) return "missing";
    throw error;
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  if (execute) {
    await s3.send(
      new PutObjectCommand({
        Bucket: r2Config.bucket,
        Key: key,
        Body: buffer,
        ContentType: getContentType(key),
        CacheControl: "max-age=31536000",
      })
    );
  }

  return "copied";
}

async function readSupabaseCatalog(supabase, config) {
  const { data, error } = await supabase.storage.from(config.bucket).download(config.catalogPath);
  if (error) {
    if (isMissingError(error)) return { version: 1, updatedAt: 0, tracks: [] };
    throw error;
  }

  const text = await data.text();
  if (!text.trim()) return { version: 1, updatedAt: 0, tracks: [] };

  try {
    const parsed = JSON.parse(text);
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
    };
  } catch {
    return { version: 1, updatedAt: 0, tracks: [] };
  }
}

async function writeR2Catalog(s3, r2Config, tracks) {
  const payload = JSON.stringify({ version: 1, updatedAt: Date.now(), tracks }, null, 2);
  await s3.send(
    new PutObjectCommand({
      Bucket: r2Config.bucket,
      Key: r2Config.catalogPath,
      Body: payload,
      ContentType: "application/json",
      CacheControl: "no-cache",
    })
  );
}

function getSupabaseKeyFromPublicUrl(src, bucket) {
  if (typeof src !== "string") return null;
  try {
    const url = new URL(src);
    const prefix = `/storage/v1/object/public/${bucket}/`;
    const index = url.pathname.indexOf(prefix);
    if (index < 0) return null;
    return decodeURIComponent(url.pathname.slice(index + prefix.length));
  } catch {
    return null;
  }
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const supabaseConfig = readSupabaseConfig();
  if (!supabaseConfig) {
    throw new Error("Configuration Supabase manquante (lecture). Renseigne SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.");
  }

  const r2Config = readR2Config();
  if (!r2Config) {
    throw new Error(
      "Configuration R2 manquante (ecriture). Renseigne R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY et R2_PUBLIC_BASE_URL."
    );
  }

  console.log(execute ? "Mode: EXECUTION reelle." : "Mode: DRY-RUN (aucune ecriture). Utilise --execute pour appliquer.");
  if (force) console.log("Flag --force actif: recopie meme les objets deja presents cote R2.");

  const supabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetch.bind(globalThis) },
  });

  const s3 = new S3Client({
    region: "auto",
    endpoint: r2Config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: r2Config.accessKeyId, secretAccessKey: r2Config.secretAccessKey },
  });

  const catalog = await readSupabaseCatalog(supabase, supabaseConfig);

  const keysFromCatalog = new Set();
  for (const track of catalog.tracks) {
    if (typeof track.audioPath === "string") keysFromCatalog.add(track.audioPath);
    if (typeof track.coverPath === "string") keysFromCatalog.add(track.coverPath);
  }

  const [audioNames, coverNames, avatarNames, bannerNames] = await Promise.all([
    listSupabasePrefix(supabase, supabaseConfig.bucket, "audio").catch(() => []),
    listSupabasePrefix(supabase, supabaseConfig.bucket, "cover").catch(() => []),
    listSupabasePrefix(supabase, supabaseConfig.bucket, "avatars").catch(() => []),
    listSupabasePrefix(supabase, supabaseConfig.bucket, "banners").catch(() => []),
  ]);

  const allKeys = new Set(keysFromCatalog);
  for (const name of audioNames) allKeys.add(`audio/${name}`);
  for (const name of coverNames) allKeys.add(`cover/${name}`);
  for (const name of avatarNames) allKeys.add(`avatars/${name}`);
  for (const name of bannerNames) allKeys.add(`banners/${name}`);

  let copied = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  console.log(`Copie de ${allKeys.size} objet(s) de Supabase (bucket "${supabaseConfig.bucket}") vers R2 (bucket "${r2Config.bucket}")...`);

  for (const key of allKeys) {
    try {
      const result = await copyObjectToR2(supabase, supabaseConfig.bucket, s3, r2Config, key, { skipIfExists: !force });
      if (result === "copied") {
        copied += 1;
        console.log(`[${execute ? "ok" : "dry-run"}] ${key}`);
      } else if (result === "skip") {
        skipped += 1;
        console.log(`[skip] ${key} (deja present sur R2)`);
      } else if (result === "missing") {
        missing += 1;
        console.log(`[missing] ${key} (absent cote Supabase)`);
      }
    } catch (error) {
      failed += 1;
      console.error(`[fail] ${key}`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  const migrationMap = [];
  const newCatalogTracks = [];

  for (const track of catalog.tracks) {
    const audioKey = typeof track.audioPath === "string" ? track.audioPath : getSupabaseKeyFromPublicUrl(track.src, supabaseConfig.bucket);
    const coverKey = typeof track.coverPath === "string" ? track.coverPath : getSupabaseKeyFromPublicUrl(track.cover, supabaseConfig.bucket);

    const newSrc = audioKey ? getR2PublicUrl(r2Config, audioKey) : track.src;
    const newCover = coverKey ? getR2PublicUrl(r2Config, coverKey) : track.cover ?? null;

    migrationMap.push({
      audioPath: audioKey ?? null,
      coverPath: coverKey ?? null,
      oldSrc: track.src,
      newSrc,
      oldCover: track.cover ?? null,
      newCover: coverKey ? newCover : null,
    });

    newCatalogTracks.push({
      ...track,
      src: newSrc,
      cover: coverKey ? newCover : null,
      audioPath: audioKey ?? track.audioPath,
      coverPath: coverKey ?? track.coverPath ?? null,
    });
  }

  await fs.writeFile(mapFilePath, JSON.stringify(migrationMap, null, 2), "utf-8");
  console.log(`\nCarte de migration ecrite: ${mapFilePath} (${migrationMap.length} piste(s)).`);

  if (execute) {
    await writeR2Catalog(s3, r2Config, newCatalogTracks);
    console.log(`Catalogue R2 ecrit: ${r2Config.catalogPath} (${newCatalogTracks.length} piste(s)).`);
  } else {
    console.log("Dry-run: catalogue R2 non ecrit. Relance avec --execute pour appliquer.");
  }

  // Reecrit avatarUrl/bannerUrl dans les profils account-data pour les fichiers migres.
  const profileUpdates = new Map();
  for (const name of avatarNames) {
    const userId = name.replace(/\.[^/.]+$/, "");
    const key = `avatars/${name}`;
    profileUpdates.set(userId, { ...(profileUpdates.get(userId) ?? {}), avatarKey: key });
  }
  for (const name of bannerNames) {
    const userId = name.replace(/\.[^/.]+$/, "");
    const key = `banners/${name}`;
    profileUpdates.set(userId, { ...(profileUpdates.get(userId) ?? {}), bannerKey: key });
  }

  let profilesUpdated = 0;
  let profilesFailed = 0;

  for (const [userId, keys] of profileUpdates) {
    const profilePath = `profiles/${userId}.json`;
    try {
      const { data, error } = await supabase.storage.from(supabaseConfig.accountBucket).download(profilePath);
      if (error) {
        if (isMissingError(error)) continue;
        throw error;
      }

      const text = await data.text();
      const profile = text.trim() ? JSON.parse(text) : {};
      let changed = false;

      if (keys.avatarKey && getSupabaseKeyFromPublicUrl(profile.avatarUrl, supabaseConfig.bucket) === keys.avatarKey) {
        profile.avatarUrl = getR2PublicUrl(r2Config, keys.avatarKey);
        changed = true;
      }
      if (keys.bannerKey && getSupabaseKeyFromPublicUrl(profile.bannerUrl, supabaseConfig.bucket) === keys.bannerKey) {
        profile.bannerUrl = getR2PublicUrl(r2Config, keys.bannerKey);
        changed = true;
      }

      if (changed) {
        console.log(`[${execute ? "ok" : "dry-run"}] profil ${userId} (avatarUrl/bannerUrl -> R2)`);
        if (execute) {
          const { error: uploadError } = await supabase.storage.from(supabaseConfig.accountBucket).upload(
            profilePath,
            JSON.stringify(profile, null, 2),
            { contentType: "application/json", cacheControl: "0", upsert: true }
          );
          if (uploadError) throw uploadError;
        }
        profilesUpdated += 1;
      }
    } catch (error) {
      profilesFailed += 1;
      console.error(`[fail] profil ${userId}`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  console.log("");
  console.log(
    `Termine. Objets copies: ${copied}, ignores (deja presents): ${skipped}, manquants: ${missing}, erreurs: ${failed}.`
  );
  console.log(`Profils avatarUrl/bannerUrl mis a jour: ${profilesUpdated}, erreurs: ${profilesFailed}.`);
  console.log("\nAucun fichier n'a ete supprime cote Supabase. Le nettoyage reste une etape manuelle separee.");
  if (!execute) {
    console.log("Relance avec --execute pour appliquer reellement la copie et la reecriture du catalogue/profils.");
  } else {
    console.log("Etape suivante recommandee: npm run r2:migrate-refs (dry-run puis --execute).");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
