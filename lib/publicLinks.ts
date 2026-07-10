export function normalizePublicText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

export function slugifyArtistName(value: string) {
  const normalized = normalizePublicText(value);
  return normalized.replace(/\s+/g, "-") || "artiste";
}

export function getArtistHref(artist: string) {
  return `/artists/${encodeURIComponent(slugifyArtistName(artist))}`;
}

export function getPublicProfileHref(userId: string) {
  return `/users/${encodeURIComponent(userId)}`;
}

export function getInitials(value: string, fallback = "MP") {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return fallback;
  }

  return words
    .slice(0, 2)
    .map((word) => word.slice(0, 1).toUpperCase())
    .join("");
}

export function hashStringToHue(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 3600;
  }

  return Math.abs(hash) % 360;
}

/** FNV-1a 32-bit hash, returned as an unsigned int. Good enough for storage keys / seeded PRNGs, not for cryptography. */
export function hashString32(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function hashStringToHex(value: string): string {
  return hashString32(value).toString(16).padStart(8, "0");
}
