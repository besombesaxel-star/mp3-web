export type LibraryBackend = "local" | "r2" | "supabase";

export type LibraryMutationResult = "forbidden" | "not_found" | "ok" | "unsupported";

export type LibraryTrack = {
  title: string;
  artist: string;
  src: string;
  cover: string | null;
  createdAt: number;
  backend: LibraryBackend;
  fileName?: string;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
  ownerId?: string | null;
  credits?: string | null;
};
