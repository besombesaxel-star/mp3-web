import type { PlayerStats } from "@/app/PlayerContext";

type ChallengeTemplate = {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  compute: (stats: PlayerStats, weekStart: number, weekEnd: number) => number;
};

const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: "discoverer",
    title: "Decouvreur",
    description: "Ecoute 5 morceaux jamais joues avant cette semaine",
    icon: "🧭",
    target: 5,
    compute: (stats, weekStart, weekEnd) => {
      let count = 0;
      for (const firstAt of Object.values(stats.firstPlayedAtByTrack)) {
        if (firstAt >= weekStart && firstAt < weekEnd) count += 1;
      }
      return count;
    },
  },
  {
    id: "loyal",
    title: "Fidele",
    description: "Ecoute 15 morceaux cette semaine",
    icon: "🎧",
    target: 15,
    compute: (stats, weekStart, weekEnd) =>
      stats.recentPlays.filter((p) => p.playedAt >= weekStart && p.playedAt < weekEnd).length,
  },
  {
    id: "night_owl",
    title: "Nocturne",
    description: "3 ecoutes entre minuit et 6h cette semaine",
    icon: "🌙",
    target: 3,
    compute: (stats, weekStart, weekEnd) =>
      stats.recentPlays.filter(
        (p) => p.playedAt >= weekStart && p.playedAt < weekEnd && p.hour >= 0 && p.hour < 6
      ).length,
  },
  {
    id: "explorer",
    title: "Explorateur",
    description: "Ecoute 4 artistes differents cette semaine",
    icon: "🌍",
    target: 4,
    compute: (stats, weekStart, weekEnd) => {
      const artists = new Set<string>();
      for (const p of stats.recentPlays) {
        if (p.playedAt < weekStart || p.playedAt >= weekEnd) continue;
        const artist = stats.byTrack[p.src]?.artist?.trim();
        if (artist) artists.add(artist.toLowerCase());
      }
      return artists.size;
    },
  },
  {
    id: "habit",
    title: "Habitue",
    description: "Ecoute a 4 jours differents cette semaine",
    icon: "📅",
    target: 4,
    compute: (stats, weekStart, weekEnd) => {
      const days = new Set<string>();
      for (const p of stats.recentPlays) {
        if (p.playedAt < weekStart || p.playedAt >= weekEnd) continue;
        days.add(new Date(p.playedAt).toDateString());
      }
      return days.size;
    },
  },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function getWeekBounds(now: number) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const diffToMonday = (d.getDay() + 6) % 7; // days since the most recent Monday
  d.setDate(d.getDate() - diffToMonday);

  const weekStart = d.getTime();
  const weekKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { weekStart, weekEnd: weekStart + WEEK_MS, weekKey };
}

export type WeeklyChallengeState = {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  completed: boolean;
  weekKey: string;
};

export function getCurrentWeeklyChallenge(stats: PlayerStats, now: number = Date.now()): WeeklyChallengeState {
  const { weekStart, weekEnd, weekKey } = getWeekBounds(now);
  const weekNumber = Math.floor(weekStart / WEEK_MS);
  const template = CHALLENGE_TEMPLATES[weekNumber % CHALLENGE_TEMPLATES.length];
  const progress = Math.min(template.target, template.compute(stats, weekStart, weekEnd));

  return {
    id: template.id,
    title: template.title,
    description: template.description,
    icon: template.icon,
    target: template.target,
    progress,
    completed: progress >= template.target,
    weekKey,
  };
}
