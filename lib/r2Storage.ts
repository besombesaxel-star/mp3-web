import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  catalogPath: string;
  publicBaseUrl: string;
  endpoint: string;
};

function readR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() || "media";
  const catalogPath = process.env.R2_CATALOG_PATH?.trim() || "catalog/tracks.json";
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim() ?? "";
  const endpoint = process.env.R2_ENDPOINT?.trim() || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!accountId || !accessKeyId || !secretAccessKey || !publicBaseUrl || !endpoint) {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, catalogPath, publicBaseUrl, endpoint };
}

export function isR2Configured() {
  return readR2Config() !== null;
}

export type R2Admin = {
  client: S3Client;
  bucket: string;
  catalogPath: string;
  publicBaseUrl: string;
};

export function getR2Admin(): R2Admin | null {
  const config = readR2Config();
  if (!config) return null;

  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    client,
    bucket: config.bucket,
    catalogPath: config.catalogPath,
    publicBaseUrl: config.publicBaseUrl,
  };
}

export function isMissingR2ObjectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === "NoSuchKey" || value.$metadata?.httpStatusCode === 404;
}

export function getR2PublicUrl(admin: R2Admin, key: string) {
  const base = admin.publicBaseUrl.replace(/\/$/, "");
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${encodedKey}`;
}

export function getR2KeyFromPublicUrl(admin: R2Admin, src: string): string | null {
  const base = admin.publicBaseUrl.replace(/\/$/, "");
  if (!src.startsWith(`${base}/`)) return null;
  const encodedKey = src.slice(base.length + 1);
  try {
    return decodeURIComponent(encodedKey);
  } catch {
    return encodedKey;
  }
}

export async function putR2Object(
  admin: R2Admin,
  key: string,
  body: Buffer | string,
  contentType: string,
  opts?: { cacheControl?: string }
) {
  await admin.client.send(
    new PutObjectCommand({
      Bucket: admin.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: opts?.cacheControl,
    })
  );
}

export async function getR2Object(admin: R2Admin, key: string): Promise<Buffer | null> {
  try {
    const result = await admin.client.send(new GetObjectCommand({ Bucket: admin.bucket, Key: key }));
    const body = result.Body;
    if (!body) return null;
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (error) {
    if (isMissingR2ObjectError(error)) return null;
    throw error;
  }
}

export async function deleteR2Objects(admin: R2Admin, keys: string[]) {
  if (keys.length === 0) return;
  await admin.client.send(
    new DeleteObjectsCommand({
      Bucket: admin.bucket,
      Delete: { Objects: keys.map((key) => ({ Key: key })) },
    })
  );
}

export type R2ObjectEntry = {
  name: string;
  metadata: { size: number };
  createdAt: number;
};

export async function listR2Objects(admin: R2Admin, prefix: string): Promise<R2ObjectEntry[]> {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const entries: R2ObjectEntry[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await admin.client.send(
      new ListObjectsV2Command({
        Bucket: admin.bucket,
        Prefix: normalizedPrefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of result.Contents ?? []) {
      if (!object.Key || object.Key === normalizedPrefix) continue;
      entries.push({
        name: object.Key.slice(normalizedPrefix.length),
        metadata: { size: object.Size ?? 0 },
        createdAt: object.LastModified ? object.LastModified.getTime() : 0,
      });
    }

    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return entries;
}

export async function createR2PresignedPutUrl(
  admin: R2Admin,
  key: string,
  contentType: string,
  expiresInSeconds = 900
) {
  const command = new PutObjectCommand({ Bucket: admin.bucket, Key: key, ContentType: contentType });
  return getSignedUrl(admin.client, command, { expiresIn: expiresInSeconds });
}
