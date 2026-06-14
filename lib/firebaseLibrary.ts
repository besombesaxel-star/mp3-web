import crypto from "crypto";
import { getDownloadURL } from "firebase-admin/storage";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { getCoverExtension, safeBaseName } from "@/lib/libraryFiles";
import type { LibraryTrack } from "@/lib/libraryTypes";

type FirebaseTrackDoc = {
  title?: string;
  artist?: string;
  src?: string;
  cover?: string | null;
  audioPath?: string;
  coverPath?: string | null;
  fileName?: string;
  createdAt?: number;
  updatedAt?: number;
};

function toLibraryTrack(data: FirebaseTrackDoc): LibraryTrack | null {
  if (typeof data.src !== "string" || typeof data.title !== "string") {
    return null;
  }

  return {
    title: data.title,
    artist: typeof data.artist === "string" && data.artist.trim() ? data.artist : "Local library",
    src: data.src,
    cover: typeof data.cover === "string" ? data.cover : null,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    backend: "firebase",
    fileName: typeof data.fileName === "string" ? data.fileName : undefined,
  };
}

export function isFirebaseTrackSrc(src: string) {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "firebasestorage.googleapis.com" ||
      url.hostname === "storage.googleapis.com" ||
      url.hostname.endsWith(".storage.googleapis.com")
    );
  } catch {
    return false;
  }
}

export async function listFirebaseTracks(): Promise<LibraryTrack[]> {
  const admin = getFirebaseAdmin();
  if (!admin) return [];

  const snapshot = await admin.db.collection(admin.tracksCollection).orderBy("createdAt", "desc").get();
  return snapshot.docs
    .map((doc) => toLibraryTrack(doc.data() as FirebaseTrackDoc))
    .filter((track): track is LibraryTrack => track !== null);
}

export async function uploadFirebaseTrack(audio: File, cover: File | null) {
  const admin = getFirebaseAdmin();
  if (!admin) {
    throw new Error("Firebase n'est pas configure.");
  }

  const id = crypto.randomBytes(4).toString("hex");
  const base = safeBaseName(audio.name || "track.mp3");
  const finalBase = `${base}-${id}`;
  const createdAt = Date.now();

  const audioFilename = `${finalBase}.mp3`;
  const audioPath = `audio/${audioFilename}`;
  const audioFile = admin.bucket.file(audioPath);
  const audioBuf = Buffer.from(await audio.arrayBuffer());

  await audioFile.save(audioBuf, {
    resumable: false,
    metadata: {
      contentType: audio.type || "audio/mpeg",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  const audioUrl = await getDownloadURL(audioFile);

  let coverUrl: string | null = null;
  let coverPath: string | null = null;

  if (cover instanceof File && cover.size > 0) {
    const coverFilename = `${finalBase}${getCoverExtension(cover.name || "")}`;
    coverPath = `cover/${coverFilename}`;
    const coverFile = admin.bucket.file(coverPath);
    const coverBuf = Buffer.from(await cover.arrayBuffer());

    await coverFile.save(coverBuf, {
      resumable: false,
      metadata: {
        contentType: cover.type || "image/jpeg",
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    coverUrl = await getDownloadURL(coverFile);
  }

  const title = base.replace(/-/g, " ");
  const artist = "Local upload";

  await admin.db.collection(admin.tracksCollection).doc(finalBase).set({
    title,
    artist,
    src: audioUrl,
    cover: coverUrl,
    audioPath,
    coverPath,
    fileName: audioFilename,
    createdAt,
    updatedAt: createdAt,
  });

  return {
    title,
    artist,
    src: audioUrl,
    cover: coverUrl,
    createdAt,
    backend: "firebase" as const,
    fileName: audioFilename,
  };
}

export async function saveFirebaseTrackMeta(src: string, title: string, artist: string) {
  const admin = getFirebaseAdmin();
  if (!admin) return false;

  const snapshot = await admin.db.collection(admin.tracksCollection).where("src", "==", src).limit(1).get();
  if (snapshot.empty) return false;

  const docRef = snapshot.docs[0]?.ref;
  if (!docRef) return false;

  await docRef.update({
    title: title.trim(),
    artist: artist.trim() || "Local",
    updatedAt: Date.now(),
  });

  return true;
}
