import type { Metadata } from "next";
import { getPublicArtistPageData } from "@/lib/publicCatalog";
import ArtistClient from "./ArtistClient";

type Props = {
  params: Promise<{ artistSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { artistSlug } = await params;
  const artist = await getPublicArtistPageData(artistSlug).catch(() => null);

  if (!artist) {
    return {
      title: ".mp3",
      description: "Artiste introuvable.",
      robots: { index: false, follow: false },
    };
  }

  const title = `${artist.artist} · .mp3`;
  const description = `${artist.trackCount} morceau${artist.trackCount > 1 ? "x" : ""} de ${artist.artist} sur .mp3.`;
  const url = `/artists/${encodeURIComponent(artistSlug)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "website", url },
    twitter: { card: "summary", title, description },
  };
}

export default function ArtistPage() {
  return <ArtistClient />;
}
