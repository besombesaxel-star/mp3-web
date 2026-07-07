export type StoredAccount = {
  userId: string;
  email: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  updatedAt: number;
};

const STORAGE_KEY = "mp3:accounts:v1";
const MAX_ACCOUNTS = 5;

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.userId === "string" &&
    typeof v.email === "string" &&
    typeof v.displayName === "string" &&
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string" &&
    typeof v.updatedAt === "number"
  );
}

function readAll(): StoredAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredAccount);
  } catch {
    return [];
  }
}

function writeAll(accounts: StoredAccount[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {}
}

export function listStoredAccounts(): StoredAccount[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getStoredAccount(userId: string): StoredAccount | null {
  return readAll().find((a) => a.userId === userId) ?? null;
}

export function upsertStoredAccount(account: StoredAccount) {
  const accounts = readAll().filter((a) => a.userId !== account.userId);
  accounts.push(account);
  accounts.sort((a, b) => b.updatedAt - a.updatedAt);
  writeAll(accounts.slice(0, MAX_ACCOUNTS));
}

export function removeStoredAccount(userId: string) {
  writeAll(readAll().filter((a) => a.userId !== userId));
}
