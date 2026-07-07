"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getSupabaseBrowserAuthClient,
  getUserDisplayName,
  getUserPrimaryLabel,
  isSupabaseBrowserAuthConfigured,
  type Session,
  type User,
} from "@/lib/supabaseAuth";
import {
  getStoredAccount,
  listStoredAccounts,
  removeStoredAccount,
  upsertStoredAccount,
  type StoredAccount,
} from "@/lib/accountSwitcher";

type AuthContextValue = {
  accessToken: string | null;
  accounts: StoredAccount[];
  displayName: string;
  isAuthenticated: boolean;
  isConfigured: boolean;
  loading: boolean;
  primaryLabel: string;
  removeAccount: (userId: string) => void;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ emailConfirmationRequired: boolean }>;
  switchAccount: (userId: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function missingConfigError() {
  return new Error("Supabase Auth n'est pas configure.");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isConfigured = isSupabaseBrowserAuthConfigured();
  const [loading, setLoading] = useState(isConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>(() => listStoredAccounts());

  useEffect(() => {
    const client = getSupabaseBrowserAuthClient();
    if (!client) {
      return;
    }

    let mounted = true;

    client.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (nextSession?.access_token && nextSession.refresh_token && nextSession.user) {
        upsertStoredAccount({
          userId: nextSession.user.id,
          email: nextSession.user.email ?? "",
          displayName: getUserDisplayName(nextSession.user),
          accessToken: nextSession.access_token,
          refreshToken: nextSession.refresh_token,
          updatedAt: Date.now(),
        });
        setAccounts(listStoredAccounts());
      }

      if (_event === "SIGNED_IN" && nextSession?.access_token) {
        void fetch("/api/activity", {
          method: "POST",
          headers: { Authorization: `Bearer ${nextSession.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "sign_in" }),
        }).catch(() => {});
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    async function signIn(email: string, password: string) {
      const client = getSupabaseBrowserAuthClient();
      if (!client) throw missingConfigError();

      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
    }

    async function signUp(email: string, password: string, displayName?: string) {
      const client = getSupabaseBrowserAuthClient();
      if (!client) throw missingConfigError();

      const cleanDisplayName = displayName?.trim() ?? "";
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: cleanDisplayName
          ? {
              data: {
                display_name: cleanDisplayName,
              },
            }
          : undefined,
      });

      if (error) throw error;

      return {
        emailConfirmationRequired: !data.session,
      };
    }

    async function signOut() {
      const client = getSupabaseBrowserAuthClient();
      if (!client) throw missingConfigError();

      const currentUserId = user?.id;
      const { error } = await client.auth.signOut();
      if (error) throw error;

      if (currentUserId) {
        removeStoredAccount(currentUserId);
        setAccounts(listStoredAccounts());
      }
    }

    async function switchAccount(userId: string) {
      const client = getSupabaseBrowserAuthClient();
      if (!client) throw missingConfigError();
      if (userId === user?.id) return;

      const stored = getStoredAccount(userId);
      if (!stored) throw new Error("Compte introuvable, reconnecte-toi.");

      const { data, error } = await client.auth.setSession({
        access_token: stored.accessToken,
        refresh_token: stored.refreshToken,
      });

      if (error || !data.session) {
        removeStoredAccount(userId);
        setAccounts(listStoredAccounts());
        throw new Error("Session expiree pour ce compte, reconnecte-toi.");
      }
    }

    function removeAccount(userId: string) {
      removeStoredAccount(userId);
      setAccounts(listStoredAccounts());
    }

    async function updateDisplayName(displayName: string) {
      const client = getSupabaseBrowserAuthClient();
      if (!client) throw missingConfigError();

      const { error } = await client.auth.updateUser({
        data: {
          display_name: displayName.trim(),
        },
      });

      if (error) throw error;

      const { data } = await client.auth.getUser();
      setUser(data.user ?? null);
      setSession((previous) => (previous ? { ...previous, user: data.user ?? previous.user } : previous));
    }

    async function updatePassword(password: string) {
      const client = getSupabaseBrowserAuthClient();
      if (!client) throw missingConfigError();

      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;

      if (session?.access_token) {
        void fetch("/api/activity", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "password_changed" }),
        }).catch(() => {});
      }
    }

    return {
      accessToken: session?.access_token ?? null,
      accounts,
      displayName: getUserDisplayName(user),
      isAuthenticated: Boolean(user),
      isConfigured,
      loading,
      primaryLabel: getUserPrimaryLabel(user),
      removeAccount,
      session,
      signIn,
      signOut,
      signUp,
      switchAccount,
      updateDisplayName,
      updatePassword,
      user,
    };
  }, [accounts, isConfigured, loading, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
