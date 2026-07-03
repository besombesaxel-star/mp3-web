// ID admin historique, conserve comme valeur par defaut si ADMIN_USER_IDS n'est pas defini.
const DEFAULT_ADMIN_USER_ID = "b793a3a7-45f8-4711-90b9-a1f0ac5fb8b9";

function readAdminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS?.trim();
  if (!raw) {
    return new Set([DEFAULT_ADMIN_USER_ID]);
  }

  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return new Set(ids.length > 0 ? ids : [DEFAULT_ADMIN_USER_ID]);
}

const ADMIN_USER_IDS = readAdminUserIds();

export function isAdminUser(userId: string | null | undefined): boolean {
  return Boolean(userId) && ADMIN_USER_IDS.has(userId as string);
}
