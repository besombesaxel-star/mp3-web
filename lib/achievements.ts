export type AchievementId =
  | "plays_10"
  | "listen_1h"
  | "first_favorite"
  | "first_playlist"
  | "night_listen";

export type AchievementDef = {
  id: AchievementId;
  title: string;
  desc: string;
  icon: string; // emoji
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "plays_10", title: "10 morceaux joués", desc: "Tu commences à charbonner.", icon: "🏆" },
  { id: "listen_1h", title: "1h d’écoute", desc: "Mode immersion activé.", icon: "⏱️" },
  { id: "first_favorite", title: "Premier favori", desc: "Un premier ♥, ça compte.", icon: "❤️" },
  { id: "first_playlist", title: "Première playlist", desc: "Tu organises ton son.", icon: "🔀" },
  { id: "night_listen", title: "Écoute de nuit", desc: "Il est tard… mais c’est bon.", icon: "🌙" },
];
