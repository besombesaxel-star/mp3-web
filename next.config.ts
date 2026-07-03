import type { NextConfig } from "next";

const supabaseHostname = (() => {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) return null;

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // 127.0.0.1: acces direct/tests locaux. *.loca.lt: tunnel public du script share:4g (scripts/share-4g.mjs).
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.loca.lt"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      ...(supabaseHostname
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
