import { readAccountProfile, type ProfileLink } from "@/lib/accountData";
import { getBadgesForUser, type BadgeKey } from "@/lib/badges";
import { listTracksForApi } from "@/lib/libraryRepository";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getInitials, slugifyArtistName } from "@/lib/publicLinks";

type SerializedPublicTrack = {
  artist: string;
  cover: string | null;
  createdAt: number;
  ownerDisplayName: string | null;
  ownerId: string | null;
  ownerLabel: string | null;
  src: string;
  title: string;
};

export type PublicUserProfileData = {
  avatarUrl: string;
  badges: BadgeKey[];
  bio: string;
  displayName: string;
  followersCount: number;
  initials: string;
  joinedAt: string | null;
  links: ProfileLink[];
  pinnedTracks: SerializedPublicTrack[];
  themeHue: number | null;
  uploads: SerializedPublicTrack[];
  uploadsCount: number;
  userId: string;
  uniqueArtistsCount: number;
};

export type PublicArtistPageData = {
  artist: string;
  artistSlug: string;
  owners: Array<{ count: number; displayName: string | null; ownerId: string | null; ownerLabel: string | null }>;
  recentTracks: SerializedPublicTrack[];
  trackCount: number;
};

function sanitizeDisplayName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeTrack(track: Awaited<ReturnType<typeof listTracksForApi>>[number]): SerializedPublicTrack {
  const ownerDisplayName = sanitizeDisplayName(track.ownerDisplayName);
  const ownerLabel = ownerDisplayName || (typeof track.ownerEmail === "string" ? track.ownerEmail.trim() : "") || null;

  return {
    artist: track.artist,
    cover: track.cover,
    createdAt: track.createdAt,
    ownerDisplayName: ownerDisplayName || null,
    ownerId: track.ownerId ?? null,
    ownerLabel,
    src: track.src,
    title: track.title,
  };
}

async function readPublicUserBasics(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { displayName: "", joinedAt: null };
  }

  const { data, error } = await admin.client.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return { displayName: "", joinedAt: null };
  }

  const displayName = sanitizeDisplayName(data.user.user_metadata?.display_name);
  return {
    displayName,
    joinedAt: typeof data.user.created_at === "string" ? data.user.created_at : null,
  };
}

export async function getPublicUserProfileData(userId: string): Promise<PublicUserProfileData | null> {
  const [tracks, profile, userBasics] = await Promise.all([
    listTracksForApi(),
    readAccountProfile(userId).catch(() => null),
    readPublicUserBasics(userId),
  ]);

  const uploads = tracks
    .filter((track) => track.ownerId === userId)
    .sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title, "fr"));

  if (uploads.length === 0 && !userBasics.displayName && !profile) {
    return null;
  }

  const displayName =
    userBasics.displayName ||
    sanitizeDisplayName(uploads[0]?.ownerDisplayName) ||
    "Membre mp3";

  const uniqueArtistsCount = new Set(
    uploads.map((track) => track.artist.trim().toLowerCase()).filter(Boolean)
  ).size;

  const pinnedTracks = (profile?.pinnedTrackSrcs ?? [])
    .map((src) => tracks.find((t) => t.src === src))
    .filter((t): t is Awaited<ReturnType<typeof listTracksForApi>>[number] => Boolean(t))
    .map(serializeTrack);

  return {
    avatarUrl: profile?.avatarUrl ?? "",
    badges: getBadgesForUser(userId),
    bio: profile?.publicBio ?? "",
    displayName,
    followersCount: profile?.followersCount ?? 0,
    initials: getInitials(displayName, "MP"),
    joinedAt: userBasics.joinedAt,
    links: profile?.links ?? [],
    pinnedTracks,
    themeHue: profile?.themeHue ?? null,
    uploads: uploads.map(serializeTrack),
    uploadsCount: uploads.length,
    userId,
    uniqueArtistsCount,
  };
}

export async function getPublicArtistPageData(artistSlug: string): Promise<PublicArtistPageData | null> {
  const tracks = await listTracksForApi();
  const artistTracks = tracks
    .filter((track) => slugifyArtistName(track.artist) === artistSlug)
    .sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title, "fr"));

  if (artistTracks.length === 0) {
    return null;
  }

  const ownersMap = new Map<string, { count: number; displayName: string | null; ownerId: string | null; ownerLabel: string | null }>();

  for (const track of artistTracks) {
    const serialized = serializeTrack(track);
    const key = serialized.ownerId ?? `legacy:${serialized.ownerLabel ?? "shared"}`;
    const previous = ownersMap.get(key) ?? {
      count: 0,
      displayName: serialized.ownerDisplayName,
      ownerId: serialized.ownerId,
      ownerLabel: serialized.ownerLabel,
    };
    previous.count += 1;
    ownersMap.set(key, previous);
  }

  return {
    artist: artistTracks[0].artist,
    artistSlug,
    owners: [...ownersMap.values()].sort((a, b) => b.count - a.count || (a.ownerLabel ?? "").localeCompare(b.ownerLabel ?? "", "fr")),
    recentTracks: artistTracks.map((track) => serializeTrack(track)),
    trackCount: artistTracks.length,
  };
}
