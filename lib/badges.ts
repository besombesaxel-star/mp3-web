export type BadgeKey = "admin" | "co-founder";

export const BADGE_LABELS: Record<BadgeKey, string> = {
  admin: "Admin",
  "co-founder": "Co-Founder",
};

const USER_BADGES: Record<string, BadgeKey[]> = {
  "b793a3a7-45f8-4711-90b9-a1f0ac5fb8b9": ["admin"],
  "3de5eafa-673f-4f05-b925-a84cf31c1ecb": ["co-founder"],
};

export function getBadgesForUser(userId: string): BadgeKey[] {
  return USER_BADGES[userId] ?? [];
}
