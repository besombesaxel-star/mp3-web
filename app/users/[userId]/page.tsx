import type { Metadata } from "next";
import { getPublicUserProfileData } from "@/lib/publicCatalog";
import ProfileClient from "./ProfileClient";

type Props = {
  params: Promise<{ userId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const profile = await getPublicUserProfileData(userId, null).catch(() => null);

  if (!profile || profile.isPrivate) {
    return {
      title: ".mp3",
      description: "Profil introuvable.",
      robots: { index: false, follow: false },
    };
  }

  const title = `${profile.displayName} · .mp3`;
  const description = profile.bio
    ? profile.bio.slice(0, 160)
    : `Découvre les sons de ${profile.displayName} sur .mp3.`;
  const url = `/users/${encodeURIComponent(userId)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "profile",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function UserProfilePage() {
  return <ProfileClient />;
}
