import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  catalogPath: string;
  accountBucket: string;
};

function readSupabaseConfig(): SupabaseStorageConfig | null {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "media";
  const catalogPath = process.env.SUPABASE_CATALOG_PATH?.trim() || "catalog/tracks.json";
  const accountBucket = process.env.SUPABASE_ACCOUNT_BUCKET?.trim() || "account-data";

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
    bucket,
    catalogPath,
    accountBucket,
  };
}

export function isSupabaseConfigured() {
  return readSupabaseConfig() !== null;
}

export function getSupabaseAdmin() {
  const config = readSupabaseConfig();
  if (!config) return null;

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

  return {
    client,
    bucket: config.bucket,
    catalogPath: config.catalogPath,
    accountBucket: config.accountBucket,
  };
}

function hasErrorMessage(error: unknown, value: string) {
  return error instanceof Error && error.message.toLowerCase().includes(value.toLowerCase());
}

function isAlreadyExistsError(error: unknown) {
  return hasErrorMessage(error, "already exists") || hasErrorMessage(error, "duplicate");
}

function isMissingBucketError(error: unknown) {
  return (
    hasErrorMessage(error, "not found") ||
    hasErrorMessage(error, "does not exist") ||
    hasErrorMessage(error, "404")
  );
}

type BucketOptions = {
  public: boolean;
  allowedMimeTypes: string[];
};

async function ensureSupabaseBucketWithOptions(
  client: SupabaseClient,
  bucket: string,
  options: BucketOptions
) {
  const { data: existing, error: getError } = await client.storage.getBucket(bucket);
  if (getError && !isMissingBucketError(getError)) {
    throw getError;
  }

  if (!existing) {
    const { error: createError } = await client.storage.createBucket(bucket, options);

    if (createError && !isAlreadyExistsError(createError)) {
      throw createError;
    }
  }

  const { error: updateError } = await client.storage.updateBucket(bucket, {
    public: options.public,
    allowedMimeTypes: options.allowedMimeTypes,
  });

  if (updateError && !isMissingBucketError(updateError)) {
    throw updateError;
  }
}

export async function ensureSupabaseBucketReady(
  client: SupabaseClient,
  bucket: string
) {
  return ensureSupabaseBucketWithOptions(client, bucket, {
    public: true,
    allowedMimeTypes: ["audio/mpeg", "image/jpeg", "image/png", "image/webp", "application/json"],
  });
}

export async function ensureSupabaseAccountBucketReady(
  client: SupabaseClient,
  bucket: string
) {
  return ensureSupabaseBucketWithOptions(client, bucket, {
    public: false,
    allowedMimeTypes: ["application/json"],
  });
}
