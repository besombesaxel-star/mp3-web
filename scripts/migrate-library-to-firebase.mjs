import path from "path";
import { promises as fs } from "fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage, getDownloadURL } from "firebase-admin/storage";

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

function normalizePrivateKey(value) {
  return value.replace(/\\n/g, "\n");
}

function readFirebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() ?? "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() ?? "";
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY?.trim() ?? "");
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim() ?? "";
  const tracksCollection = process.env.FIREBASE_TRACKS_COLLECTION?.trim() || "tracks";

  if (!projectId || !clientEmail || !privateKey || !storageBucket) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
    storageBucket,
    tracksCollection,
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

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const config = readFirebaseConfig();
  if (!config) {
    throw new Error(
      "Configuration Firebase manquante. Renseigne FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY et FIREBASE_STORAGE_BUCKET dans .env.local."
    );
  }

  const app = initializeApp({
    credential: cert({
      projectId: config.projectId,
      clientEmail: config.clientEmail,
      privateKey: config.privateKey,
    }),
    storageBucket: config.storageBucket,
  });

  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(config.storageBucket);
  const meta = await readMeta();
  const audioFiles = await listAudioFiles();

  if (audioFiles.length === 0) {
    console.log("Aucun fichier MP3 local trouve dans public/audio.");
    return;
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Migration de ${audioFiles.length} fichier(s) vers Firebase...`);

  for (const audioEntry of audioFiles) {
    const base = audioEntry.file.replace(/\.mp3$/i, "");
    const docRef = db.collection(config.tracksCollection).doc(base);

    try {
      if (!force) {
        const existing = await docRef.get();
        if (existing.exists) {
          skipped += 1;
          console.log(`[skip] ${audioEntry.file}`);
          continue;
        }
      }

      const audioBuffer = await fs.readFile(audioEntry.filePath);
      const audioPath = `audio/${audioEntry.file}`;
      const audioFile = bucket.file(audioPath);

      await audioFile.save(audioBuffer, {
        resumable: false,
        metadata: {
          contentType: "audio/mpeg",
          cacheControl: "public, max-age=31536000, immutable",
        },
      });

      const audioUrl = await getDownloadURL(audioFile);
      const coverEntry = await findCoverForBase(base);

      let coverUrl = null;
      let coverPath = null;

      if (coverEntry) {
        coverPath = `cover/${coverEntry.file}`;
        const coverBuffer = await fs.readFile(coverEntry.filePath);
        const coverFile = bucket.file(coverPath);

        await coverFile.save(coverBuffer, {
          resumable: false,
          metadata: {
            contentType: coverEntry.file.toLowerCase().endsWith(".png")
              ? "image/png"
              : coverEntry.file.toLowerCase().endsWith(".webp")
                ? "image/webp"
                : "image/jpeg",
            cacheControl: "public, max-age=31536000, immutable",
          },
        });

        coverUrl = await getDownloadURL(coverFile);
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

      await docRef.set({
        title,
        artist,
        src: audioUrl,
        cover: coverUrl,
        audioPath,
        coverPath,
        fileName: audioEntry.file,
        createdAt: audioEntry.addedAt,
        updatedAt: Date.now(),
      });

      uploaded += 1;
      console.log(`[ok] ${audioEntry.file}`);
    } catch (error) {
      failed += 1;
      console.error(`[fail] ${audioEntry.file}`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

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
