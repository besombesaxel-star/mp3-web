import path from "path";
import { promises as fs } from "fs";
import { createClient } from "@supabase/supabase-js";

const rootDir = process.cwd();
const execute = process.argv.includes("--execute");
const mapFilePath = path.join(rootDir, "r2-migration-map.json");

const HASHED_FOLDERS = ["track-plays", "track-comments", "track-lyrics"];
const MAX_LIST_DEPTH = 4;

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
  const accountBucket = process.env.SUPABASE_ACCOUNT_BUCKET?.trim() || "account-data";

  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, accountBucket };
}

function isMissingError(error) {
  return error instanceof Error && /not found|404|no such file/i.test(error.message);
}

/** FNV-1a 32-bit hash, matches lib/publicLinks.ts hashString32/hashStringToHex. */
function hashString32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hashStringToHex(value) {
  return hashString32(value).toString(16).padStart(8, "0");
}

async function listFilesRecursive(supabase, bucket, prefix, depth = 0) {
  if (depth > MAX_LIST_DEPTH) return [];

  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error || !data) return [];

  const files = [];
  for (const entry of data) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) {
      files.push(entryPath);
    } else {
      const nested = await listFilesRecursive(supabase, bucket, entryPath, depth + 1);
      files.push(...nested);
    }
  }
  return files;
}

function replaceStringsDeep(value, replacements) {
  if (typeof value === "string") {
    return replacements.has(value) ? { changed: true, value: replacements.get(value) } : { changed: false, value };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = replaceStringsDeep(item, replacements);
      if (result.changed) changed = true;
      return result.value;
    });
    return { changed, value: changed ? next : value };
  }

  if (value && typeof value === "object") {
    let changed = false;
    const next = {};
    for (const [key, val] of Object.entries(value)) {
      const result = replaceStringsDeep(val, replacements);
      if (result.changed) changed = true;
      next[key] = result.value;
    }
    return { changed, value: changed ? next : value };
  }

  return { changed: false, value };
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const config = readSupabaseConfig();
  if (!config) {
    throw new Error("Configuration Supabase manquante. Renseigne SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.");
  }

  let migrationMap;
  try {
    const raw = await fs.readFile(mapFilePath, "utf-8");
    migrationMap = JSON.parse(raw);
  } catch {
    throw new Error(
      `Fichier ${mapFilePath} introuvable. Lance d'abord "npm run r2:migrate" (au moins en dry-run) pour le generer.`
    );
  }

  console.log(execute ? "Mode: EXECUTION reelle." : "Mode: DRY-RUN (aucune ecriture). Utilise --execute pour appliquer.");

  const replacements = new Map();
  const hashPairs = [];
  for (const entry of migrationMap) {
    if (entry.oldSrc && entry.newSrc && entry.oldSrc !== entry.newSrc) {
      replacements.set(entry.oldSrc, entry.newSrc);
      hashPairs.push({ oldHash: hashStringToHex(entry.oldSrc), newHash: hashStringToHex(entry.newSrc) });
    }
    if (entry.oldCover && entry.newCover && entry.oldCover !== entry.newCover) {
      replacements.set(entry.oldCover, entry.newCover);
    }
  }

  if (replacements.size === 0) {
    console.log("Aucune URL a remplacer (carte de migration vide ou deja a jour). Rien a faire.");
    return;
  }

  console.log(`${replacements.size} URL(s) a remplacer dans les references account-data.`);

  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetch.bind(globalThis) },
  });

  console.log("Listage recursif du bucket account-data...");
  const allFiles = await listFilesRecursive(supabase, config.accountBucket, "");
  console.log(`${allFiles.length} fichier(s) trouve(s).`);

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const filePath of allFiles) {
    try {
      const { data, error } = await supabase.storage.from(config.accountBucket).download(filePath);
      if (error) {
        if (isMissingError(error)) continue;
        throw error;
      }

      const text = await data.text();
      if (!text.trim()) continue;

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }

      const result = replaceStringsDeep(parsed, replacements);
      if (!result.changed) {
        unchanged += 1;
        continue;
      }

      console.log(`[${execute ? "ok" : "dry-run"}] ${filePath}`);
      if (execute) {
        const { error: uploadError } = await supabase.storage.from(config.accountBucket).upload(
          filePath,
          JSON.stringify(result.value, null, 2),
          { contentType: "application/json", cacheControl: "0", upsert: true }
        );
        if (uploadError) throw uploadError;
      }
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`[fail] ${filePath}`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`\nReferences plates: ${updated} fichier(s) mis a jour, ${unchanged} inchange(s), ${failed} erreur(s).`);

  let hashCopied = 0;
  let hashSkipped = 0;
  let hashFailed = 0;

  console.log(`\nCopie des fichiers a cle hashee (${HASHED_FOLDERS.join(", ")}) vers les nouveaux hash...`);

  for (const { oldHash, newHash } of hashPairs) {
    if (oldHash === newHash) continue;

    for (const folder of HASHED_FOLDERS) {
      const oldPath = `${folder}/${oldHash}.json`;
      const newPath = `${folder}/${newHash}.json`;

      try {
        const { data, error } = await supabase.storage.from(config.accountBucket).download(oldPath);
        if (error) {
          if (isMissingError(error)) {
            hashSkipped += 1;
            continue;
          }
          throw error;
        }

        console.log(`[${execute ? "ok" : "dry-run"}] ${oldPath} -> ${newPath}`);
        if (execute) {
          const text = await data.text();
          const { error: uploadError } = await supabase.storage
            .from(config.accountBucket)
            .upload(newPath, text, { contentType: "application/json", cacheControl: "0", upsert: true });
          if (uploadError) throw uploadError;
        }
        hashCopied += 1;
      } catch (error) {
        hashFailed += 1;
        console.error(`[fail] ${oldPath} -> ${newPath}`);
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
  }

  console.log(`Fichiers a cle hashee: ${hashCopied} copie(s), ${hashSkipped} absent(s), ${hashFailed} erreur(s).`);
  console.log("\nAucun fichier source n'a ete supprime. Le nettoyage reste une etape manuelle separee.");
  if (!execute) {
    console.log("Relance avec --execute pour appliquer reellement ces changements.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
