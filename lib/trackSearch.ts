/**
 * Fuzzy title/artist matching shared between the server (GET /api/tracks?q=)
 * and the client (search page's own tabs that still need a full in-memory
 * list, e.g. artist/user aggregation). Keeping one copy means the server
 * and any client-side fallback never drift apart.
 */

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const terms = needle.split(" ").filter(Boolean);
  if (terms.length > 1) return terms.every((t) => fuzzyMatch(haystack, t));
  if (haystack.includes(needle)) return true;
  const words = haystack.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (word.includes(needle)) return true;
    if (needle.length >= 4 && Math.abs(word.length - needle.length) <= 1 && levenshtein(word, needle) <= 1) return true;
  }
  let i = 0;
  let j = 0;
  while (i < haystack.length && j < needle.length) {
    if (haystack[i] === needle[j]) j++;
    i++;
  }
  return j === needle.length;
}

export function trackMatchesQuery(title: string, artist: string, query: string): boolean {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  return fuzzyMatch(`${normalizeSearchText(title)} ${normalizeSearchText(artist)}`, needle);
}
