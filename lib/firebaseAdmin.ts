import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

type FirebaseEnvConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  storageBucket: string;
};

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function parseServiceAccountJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount> & {
      project_id?: string;
      client_email?: string;
      private_key?: string;
      storageBucket?: string;
    };
    const projectId =
      typeof parsed.projectId === "string"
        ? parsed.projectId.trim()
        : typeof parsed.project_id === "string"
          ? parsed.project_id.trim()
          : "";
    const clientEmail =
      typeof parsed.clientEmail === "string"
        ? parsed.clientEmail.trim()
        : typeof parsed.client_email === "string"
          ? parsed.client_email.trim()
          : "";
    const privateKey =
      typeof parsed.privateKey === "string"
        ? normalizePrivateKey(parsed.privateKey.trim())
        : typeof parsed.private_key === "string"
          ? normalizePrivateKey(parsed.private_key.trim())
          : "";
    const storageBucket =
      typeof parsed.storageBucket === "string" && parsed.storageBucket.trim()
        ? parsed.storageBucket.trim()
        : typeof process.env.FIREBASE_STORAGE_BUCKET === "string"
          ? process.env.FIREBASE_STORAGE_BUCKET.trim()
          : "";

    if (!projectId || !clientEmail || !privateKey || !storageBucket) {
      return null;
    }

    return { projectId, clientEmail, privateKey, storageBucket };
  } catch {
    return null;
  }
}

function readFirebaseEnvConfig(): FirebaseEnvConfig | null {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (serviceAccountJson) {
    return parseServiceAccountJson(serviceAccountJson);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() ?? "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() ?? "";
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY?.trim() ?? "");
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim() ?? "";

  if (!projectId || !clientEmail || !privateKey || !storageBucket) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
    storageBucket,
  };
}

export function isFirebaseConfigured() {
  return readFirebaseEnvConfig() !== null;
}

export function getFirebaseTracksCollectionName() {
  return process.env.FIREBASE_TRACKS_COLLECTION?.trim() || "tracks";
}

export function getFirebaseAdmin() {
  const config = readFirebaseEnvConfig();
  if (!config) return null;

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
      }),
      storageBucket: config.storageBucket,
    });

  return {
    app,
    db: getFirestore(app),
    bucket: getStorage(app).bucket(config.storageBucket),
    tracksCollection: getFirebaseTracksCollectionName(),
    storageBucket: config.storageBucket,
  };
}
