import path from "path";
import { promises as fs } from "fs";
import { createClient } from "@supabase/supabase-js";

const rootDir = process.cwd();
const force = process.argv.includes("--force");

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

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
    bucket,
    catalogPath,
  };
}

function defaultTitleFromBase(base) {
  return base.replace(/-\w{8}$/i, "").replace(/-/g, " ");
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readMeta() {
  const metaPath = path.join(rootDir, "data", "meta.json");
  try {
    const raw = await fs.readFile(metaPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function listAudioFiles() {
  const candidates = [path.join(rootDir, "public", "audio"), path.join(rootDir, "public", "Audio")];

  for (const dir of candidates) {
    if (!(await pathExists(dir))) continue;

    const names = (await fs.readdir(dir)).filter((file) => file.toLowerCase().endsWith(".mp3"));
    const entries = await Promise.all(
      names.map(async (file) => {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        return {
          file,
          filePath,
          addedAt: stats.mtimeMs,
        };
      })
    );

    entries.sort((a, b) => b.addedAt - a.addedAt || a.file.localeCompare(b.file, "fr"));
    return entries;
  }

  return [];
}

async function findCoverForBase(base) {
  const coverDirs = [
    path.join(rootDir, "public", "cover"),
    path.join(rootDir, "public", "covers"),
    path.join(rootDir, "public", "Cover"),
    path.join(rootDir, "public", "Covers"),
  ];

  const extensions = [".jpg", ".jpeg", ".png", ".webp"];
  for (const dir of coverDirs) {
    if (!(await pathExists(dir))) continue;

    for (const ext of extensions) {
      const file = `${base}${ext}`;
      const filePath = path.join(dir, file);
      if (await pathExists(filePath)) {
        return { file, filePath };
      }
    }
  }

  return null;
}

function getMetaForFile(meta, file) {
  return meta[`/audio/${file}`] ?? meta[`/Audio/${file}`] ?? null;
}

function hasErrorMessage(error, value) {
  return error instanceof Error && error.message.toLowerCase().includes(value.toLowerCase());
}

function isAlreadyExistsError(error) {
  return hasErrorMessage(error, "already exists") || hasErrorMessage(error, "duplicate");
}

function isMissingError(error) {
  return hasErrorMessage(error, "not found") || hasErrorMessage(error, "404") || hasErrorMessage(error, "does not exist");
}

async function ensureBucketReady(client, bucket) {
  const { data: existing, error: getError } = await client.storage.getBucket(bucket);
  if (getError && !isMissingError(getError)) {
    throw getError;
  }

  if (!existing) {
    const { error: createError } = await client.storage.createBucket(bucket, {
      public: true,
      allowedMimeTypes: ["audio/mpeg", "image/jpeg", "image/png", "image/webp", "application/json"],
    });

    if (createError && !isAlreadyExistsError(createError)) {
      throw createError;
    }
  }

  const { error: updateError } = await client.storage.updateBucket(bucket, {
    public: true,
    allowedMimeTypes: ["audio/mpeg", "image/jpeg", "image/png", "image/webp", "application/json"],
  });

  if (updateError && !isMissingError(updateError)) {
    throw updateError;
  }
}

function getPublicUrl(client, bucket, filePath) {
  const data = client.storage.from(bucket).getPublicUrl(filePath).data;
  if (data && typeof data === "object") {
    if ("publicUrl" in data && typeof data.publicUrl === "string") return data.publicUrl;
    if ("publicURL" in data && typeof data.publicURL === "string") return data.publicURL;
  }
  return "";
}

async function readCatalog(client, bucket, catalogPath) {
  const { data, error } = await client.storage.from(bucket).download(catalogPath);
  if (error) {
    if (isMissingError(error)) {
      return { version: 1, updatedAt: 0, tracks: [] };
    }
    throw error;
  }

  const text = await data.text();
  if (!text.trim()) {
    return { version: 1, updatedAt: 0, tracks: [] };
  }

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

async function writeCatalog(client, bucket, catalogPath, catalog) {
  const payload = JSON.stringify(
    {
      version: 1,
      updatedAt: Date.now(),
      tracks: catalog.tracks,
    },
    null,
    2
  );

  const { error } = await client.storage.from(bucket).upload(catalogPath, payload, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: true,
  });

  if (error) throw error;
}

function dedupeTracks(tracks) {
  const seen = new Set();
  const result = [];

  for (const track of tracks) {
    const key = (track.fileName || track.src || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(track);
  }

  result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(a.title || "").localeCompare(String(b.title || ""), "fr"));
  return result;
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const config = readSupabaseConfig();
  if (!config) {
    throw new Error(
      "Configuration Supabase manquante. Renseigne SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local."
    );
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: fetch.bind(globalThis),
    },
  });

  await ensureBucketReady(client, config.bucket);

  const meta = await readMeta();
  const audioFiles = await listAudioFiles();
  const catalog = await readCatalog(client, config.bucket, config.catalogPath);

  if (audioFiles.length === 0) {
    console.log("Aucun fichier MP3 local trouve dans public/audio.");
    return;
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Migration de ${audioFiles.length} fichier(s) vers Supabase...`);

  for (const audioEntry of audioFiles) {
    const base = audioEntry.file.replace(/\.mp3$/i, "");
    const audioPath = `audio/${audioEntry.file}`;

    try {
      const existingTrack = catalog.tracks.find((track) => track.fileName === audioEntry.file || track.audioPath === audioPath);
      if (existingTrack && !force) {
        skipped += 1;
        console.log(`[skip] ${audioEntry.file}`);
        continue;
      }

      const audioBuffer = await fs.readFile(audioEntry.filePath);
      const { error: audioUploadError } = await client.storage.from(config.bucket).upload(audioPath, audioBuffer, {
        contentType: "audio/mpeg",
        cacheControl: "31536000",
        upsert: force,
      });

      if (audioUploadError && !isAlreadyExistsError(audioUploadError)) {
        throw audioUploadError;
      }

      const audioUrl = getPublicUrl(client, config.bucket, audioPath);
      const coverEntry = await findCoverForBase(base);

      let coverUrl = null;
      let coverPath = null;

      if (coverEntry) {
        coverPath = `cover/${coverEntry.file}`;
        const coverBuffer = await fs.readFile(coverEntry.filePath);
        const { error: coverUploadError } = await client.storage.from(config.bucket).upload(coverPath, coverBuffer, {
          contentType: coverEntry.file.toLowerCase().endsWith(".png")
            ? "image/png"
            : coverEntry.file.toLowerCase().endsWith(".webp")
              ? "image/webp"
              : "image/jpeg",
          cacheControl: "31536000",
          upsert: force,
        });

        if (coverUploadError && !isAlreadyExistsError(coverUploadError)) {
          throw coverUploadError;
        }

        coverUrl = getPublicUrl(client, config.bucket, coverPath);
      }

      const metaEntry = getMetaForFile(meta, audioEntry.file);
      const title =
        typeof metaEntry?.title === "string" && metaEntry.title.trim()
          ? metaEntry.title.trim()
          : defaultTitleFromBase(base);
      const artist =
        typeof metaEntry?.artist === "string" && metaEntry.artist.trim()
          ? metaEntry.artist.trim()
          : "Local library";

      const track = {
        title,
        artist,
        src: audioUrl,
        cover: coverUrl,
        createdAt: audioEntry.addedAt,
        updatedAt: Date.now(),
        fileName: audioEntry.file,
        audioPath,
        coverPath,
      };

      const remaining = catalog.tracks.filter((item) => item.fileName !== audioEntry.file && item.audioPath !== audioPath);
      catalog.tracks = dedupeTracks([track, ...remaining]);

      uploaded += 1;
      console.log(`[ok] ${audioEntry.file}`);
    } catch (error) {
      failed += 1;
      console.error(`[fail] ${audioEntry.file}`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  await writeCatalog(client, config.bucket, config.catalogPath, catalog);

  console.log("");
  console.log(`Termine. Uploades: ${uploaded}, ignores: ${skipped}, erreurs: ${failed}.`);
  if (!force) {
    console.log("Relance avec --force si tu veux re-uploader les fichiers deja presents.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
