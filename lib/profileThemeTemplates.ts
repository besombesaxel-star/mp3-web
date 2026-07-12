export type ProfileThemeTemplate = {
  id: string;
  label: string;
  hue: number | null;
  bannerBlur: number;
  bannerDim: number;
  showParticles: boolean;
};

export const PROFILE_THEME_TEMPLATES: ProfileThemeTemplate[] = [
  { id: "neon", label: "Néon", hue: 280, bannerBlur: 4, bannerDim: 55, showParticles: true },
  { id: "minimal", label: "Minimal", hue: null, bannerBlur: 0, bannerDim: 65, showParticles: false },
  { id: "sunset", label: "Coucher de soleil", hue: 24, bannerBlur: 3, bannerDim: 45, showParticles: false },
  { id: "night", label: "Nuit", hue: 220, bannerBlur: 6, bannerDim: 70, showParticles: true },
  { id: "pastel", label: "Pastel", hue: 330, bannerBlur: 5, bannerDim: 35, showParticles: false },
  { id: "emerald", label: "Émeraude", hue: 155, bannerBlur: 2, bannerDim: 50, showParticles: true },
];
