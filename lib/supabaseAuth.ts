import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

type SupabaseBrowserAuthConfig = {
  url: string;
  publishableKey: string;
};

let browserClient: SupabaseClient | null = null;

function readSupabaseBrowserAuthConfig(): SupabaseBrowserAuthConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  if (!url || !publishableKey) {
    return null;
  }

  return {
    url,
    publishableKey,
  };
}

export function isSupabaseBrowserAuthConfigured() {
  return readSupabaseBrowserAuthConfig() !== null;
}

export function getSupabaseBrowserAuthClient() {
  if (typeof window === "undefined") {
    return null;
  }

  const config = readSupabaseBrowserAuthConfig();
  if (!config) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}

export function getUserDisplayName(user: User | null) {
  const value = user?.user_metadata?.display_name;
  return typeof value === "string" ? value.trim() : "";
}

export function getUserPrimaryLabel(user: User | null) {
  const displayName = getUserDisplayName(user);
  if (displayName) return displayName;
  return user?.email?.trim() ?? "";
}

export type { Session, User };
