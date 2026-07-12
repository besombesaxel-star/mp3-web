import type { MetadataRoute } from "next";
import { readAccountProfile } from "@/lib/accountData";
import { listTracksForApi } from "@/lib/libraryRepository";
import { slugifyArtistName } from "@/lib/publicLinks";
import { getSiteUrl } from "@/lib/siteUrl";

const MAX_ENTRIES = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const tracks = await listTracksForApi().catch(() => []);

  const ownerIds = [...new Set(tracks.map((t) => t.ownerId).filter((id): id is string => Boolean(id)))];
  const artistSlugs = [...new Set(tracks.map((t) => slugifyArtistName(t.artist)))];

  const profileEntries = await Promise.all(
    ownerIds.slice(0, MAX_ENTRIES).map(async (userId) => {
      const profile = await readAccountProfile(userId).catch(() => null);
      if (profile?.isPrivate) return null;
      return {
        url: `${baseUrl}/users/${encodeURIComponent(userId)}`,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      };
    })
  );

  const artistEntries = artistSlugs.slice(0, MAX_ENTRIES).map((slug) => ({
    url: `${baseUrl}/artists/${encodeURIComponent(slug)}`,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  return [
    ...profileEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    ...artistEntries,
  ];
}
