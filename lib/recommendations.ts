import type { Track } from "@/app/PlayerContext";

type StatsLike = {
  byTrack: Record<string, { title: string; artist?: string; seconds: number; plays: number }>;
  byArtist: Record<string, { seconds: number; plays: number }>;
};

function normalizeArtist(a?: string) {
  const s = (a ?? "").trim();
  return s || "-";
}

/**
 * Content-based recommendations: ranks artists by listening/favorite affinity, then
 * round-robins unplayed, non-favorite tracks across the top artists for variety.
 * No cross-user data involved - purely derived from this listener's own history.
 */
export function computeRecommendations(
  library: Track[],
  favoriteSrcs: Set<string>,
  stats: StatsLike,
  limit = 12
): Track[] {
  const playedSrcs = new Set(Object.keys(stats.byTrack));

  const artistScore = new Map<string, number>();
  for (const [artist, data] of Object.entries(stats.byArtist)) {
    artistScore.set(artist, (artistScore.get(artist) ?? 0) + data.plays);
  }
  for (const track of library) {
    if (!favoriteSrcs.has(track.src)) continue;
    const artist = normalizeArtist(track.artist);
    artistScore.set(artist, (artistScore.get(artist) ?? 0) + 5);
  }

  if (artistScore.size === 0) return [];

  const candidatesByArtist = new Map<string, Track[]>();
  for (const track of library) {
    if (playedSrcs.has(track.src) || favoriteSrcs.has(track.src)) continue;
    const artist = normalizeArtist(track.artist);
    if (!artistScore.has(artist)) continue;
    const list = candidatesByArtist.get(artist) ?? [];
    list.push(track);
    candidatesByArtist.set(artist, list);
  }

  const rankedArtists = [...artistScore.entries()].sort((a, b) => b[1] - a[1]).map(([artist]) => artist);

  const result: Track[] = [];
  const seen = new Set<string>();
  let round = 0;
  while (result.length < limit && round < 20) {
    let addedThisRound = false;
    for (const artist of rankedArtists) {
      if (result.length >= limit) break;
      const pool = candidatesByArtist.get(artist);
      if (!pool || pool.length <= round) continue;
      const track = pool[round];
      if (seen.has(track.src)) continue;
      seen.add(track.src);
      result.push(track);
      addedThisRound = true;
    }
    if (!addedThisRound) break;
    round += 1;
  }

  return result;
}
