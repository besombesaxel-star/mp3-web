export type AchievementId =
  | "plays_10"
  | "listen_1h"
  | "first_favorite"
  | "first_playlist"
  | "night_listen"
  | "comments_10"
  | "first_shared_playlist"
  | "streak_7";

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
  { id: "comments_10", title: "10 commentaires postés", desc: "Tu fais vivre la communauté.", icon: "💬" },
  { id: "first_shared_playlist", title: "Première playlist collaborative", desc: "À plusieurs, c’est mieux.", icon: "🤝" },
  { id: "streak_7", title: "7 jours d’affilée", desc: "Une semaine sans interruption.", icon: "🔥" },
];
