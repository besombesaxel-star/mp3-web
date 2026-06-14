import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type AuthenticatedUserResult = {
  error: string | null;
  status: number;
  user: User | null;
};

function isSupabaseServerAuthConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  return Boolean(url && publishableKey && getSupabaseAdmin());
}

function getBearerToken(req: Request) {
  const value = req.headers.get("authorization")?.trim() ?? "";
  if (!value.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return value.slice("bearer ".length).trim();
}

export async function readOptionalAuthenticatedUser(req: Request) {
  if (!isSupabaseServerAuthConfigured()) {
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin.client.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function readAuthenticatedUser(req: Request): Promise<AuthenticatedUserResult> {
  if (!isSupabaseServerAuthConfigured()) {
    return {
      error: "Supabase Auth n'est pas configure sur ce projet.",
      status: 503,
      user: null,
    };
  }

  const token = getBearerToken(req);
  if (!token) {
    return {
      error: "Connexion requise.",
      status: 401,
      user: null,
    };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      error: "Supabase admin indisponible.",
      status: 503,
      user: null,
    };
  }

  const { data, error } = await admin.client.auth.getUser(token);
  if (error || !data.user) {
    return {
      error: "Session invalide ou expiree.",
      status: 401,
      user: null,
    };
  }

  return {
    error: null,
    status: 200,
    user: data.user,
  };
}
