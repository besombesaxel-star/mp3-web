import type { AchievementId } from "@/lib/achievements";

export type Cosmetic = {
  achievementId: AchievementId;
  label: string;
  hue: number;
  ringClassName: string;
  swatchClassName: string;
};

// One cosmetic reward per achievement: an exclusive theme hue + a matching avatar ring.
export const COSMETICS: Cosmetic[] = [
  { achievementId: "plays_10", label: "Bronze", hue: 30, ringClassName: "ring-amber-500/80", swatchClassName: "bg-amber-500" },
  { achievementId: "listen_1h", label: "Glacier", hue: 195, ringClassName: "ring-cyan-400/80", swatchClassName: "bg-cyan-400" },
  { achievementId: "first_favorite", label: "Corail", hue: 350, ringClassName: "ring-rose-500/80", swatchClassName: "bg-rose-500" },
  { achievementId: "first_playlist", label: "Neon", hue: 300, ringClassName: "ring-fuchsia-500/80", swatchClassName: "bg-fuchsia-500" },
  { achievementId: "night_listen", label: "Minuit", hue: 245, ringClassName: "ring-indigo-400/80", swatchClassName: "bg-indigo-400" },
];

export function getCosmeticForAchievement(achievementId: AchievementId | null | undefined): Cosmetic | null {
  if (!achievementId) return null;
  return COSMETICS.find((c) => c.achievementId === achievementId) ?? null;
}

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === "string" && COSMETICS.some((c) => c.achievementId === value);
}
