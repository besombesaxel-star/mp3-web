import { ImageResponse } from "next/og";
import { getPublicUserProfileData } from "@/lib/publicCatalog";
import { hashStringToHue } from "@/lib/publicLinks";

export const runtime = "nodejs";
export const alt = "Profil .mp3";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const profile = await getPublicUserProfileData(userId, null).catch(() => null);

  const displayName = profile && !profile.isPrivate ? profile.displayName : ".mp3";
  const bio = profile && !profile.isPrivate ? profile.bio : "";
  const hue = profile?.themeHue ?? hashStringToHue(userId);
  const avatarUrl = profile && !profile.isPrivate ? profile.avatarUrl : "";
  const initials = profile && !profile.isPrivate ? profile.initials : "MP";
  const stats = profile && !profile.isPrivate
    ? `${profile.uploadsCount} son${profile.uploadsCount > 1 ? "s" : ""} · ${profile.followersCount} abonné${profile.followersCount > 1 ? "s" : ""}`
    : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: `linear-gradient(135deg, hsl(${hue}, 55%, 22%) 0%, #0b0b0f 65%)`,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              width={180}
              height={180}
              style={{ borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 180,
                height: 180,
                borderRadius: "50%",
                fontSize: 72,
                fontWeight: 600,
                background: `linear-gradient(135deg, hsl(${hue}, 72%, 58%), hsl(${(hue + 50) % 360}, 76%, 50%))`,
              }}
            >
              {initials}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 780 }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
              {displayName}
            </div>
            {bio ? (
              <div style={{ display: "flex", fontSize: 28, color: "rgba(255,255,255,0.65)" }}>
                {bio.slice(0, 90)}
              </div>
            ) : null}
            {stats ? (
              <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.45)" }}>
                {stats}
              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 60,
            right: 80,
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: 2,
            color: "rgba(255,255,255,0.35)",
          }}
        >
          .mp3
        </div>
      </div>
    ),
    { ...size }
  );
}
