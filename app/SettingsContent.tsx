"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { usePlayer, type ColorTheme, type EqGains } from "@/app/PlayerContext";
import { createAuthorizedHeaders } from "@/lib/clientAuth";

const EQ_BAND_LABELS = ["90 Hz", "250 Hz", "1 kHz", "3.5 kHz", "9 kHz"];

const COLOR_THEME_OPTIONS: { value: ColorTheme; label: string; swatch: string }[] = [
  { value: "steel", label: "Acier", swatch: "#96acd1" },
  { value: "emerald", label: "Emeraude", swatch: "#6fc79f" },
  { value: "amber", label: "Ambre", swatch: "#e0b370" },
  { value: "rose", label: "Rose", swatch: "#e096b0" },
  { value: "violet", label: "Violet", swatch: "#ac96e0" },
];

function EqGainsEditor({ gains, onChange }: { gains: EqGains; onChange: (gains: EqGains) => void }) {
  function updateBand(index: number, value: number) {
    const next = [...gains] as EqGains;
    next[index] = value;
    onChange(next);
  }

  return (
    <div className="mt-4 space-y-3 mp3-fade-up">
      {EQ_BAND_LABELS.map((label, i) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-xs text-white/40 w-14 shrink-0">{label}</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={gains[i]}
            onChange={(e) => updateBand(i, Number(e.target.value))}
            className="flex-1 mp3-ov-volume-slider"
            aria-label={`Gain ${label}`}
          />
          <span className="text-xs text-white/50 w-8 text-right tabular-nums">
            {gains[i] > 0 ? `+${gains[i]}` : gains[i]}
          </span>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([0, 0, 0, 0, 0])}
        className="text-xs text-white/35 hover:text-white/60 transition"
      >
        Reinitialiser
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

function SettingsSection({
  title, children, delay = 0,
}: { title: string; children: React.ReactNode; delay?: number }) {
  return (
    <section
      className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 mb-5 mp3-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-xs uppercase tracking-[0.22em] text-white/25 mb-4">{title}</p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: {
  label: string; desc?: string; checked: boolean; onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-white/85">{label}</p>
        {desc && <p className="text-xs text-white/35 mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={onChange}
        aria-pressed={checked}
        className={[
          "shrink-0 h-8 w-14 rounded-full transition relative",
          checked ? "bg-white" : "bg-white/15",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-1 h-6 w-6 rounded-full transition-all",
            checked ? "left-7 bg-black" : "left-1 bg-white",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function ThemeSwatchRow({
  value, onChange, hue, onHueChange,
}: {
  value: ColorTheme; onChange: (value: ColorTheme) => void;
  hue: number; onHueChange: (value: number) => void;
}) {
  const isCustom = value === "custom";

  return (
    <div>
      <p className="text-sm text-white/85 mb-2">Couleur du theme</p>
      <div className="flex items-center gap-2.5 flex-wrap">
        {COLOR_THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.label}
            aria-pressed={value === opt.value}
            className={[
              "relative h-9 w-9 rounded-full transition ring-offset-2 ring-offset-[#0b0b0f]",
              value === opt.value ? "ring-2 ring-white/80 scale-110" : "hover:scale-105 opacity-70 hover:opacity-100",
            ].join(" ")}
            style={{ background: opt.swatch }}
          >
            {value === opt.value && (
              <Check size={14} className="absolute inset-0 m-auto text-black drop-shadow" />
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onChange("custom")}
          title="Personnalise"
          aria-pressed={isCustom}
          className={[
            "relative h-9 w-9 rounded-full transition ring-offset-2 ring-offset-[#0b0b0f]",
            isCustom ? "ring-2 ring-white/80 scale-110" : "hover:scale-105 opacity-70 hover:opacity-100",
          ].join(" ")}
          style={{
            background:
              "conic-gradient(from 0deg, hsl(0,65%,60%), hsl(60,65%,60%), hsl(120,65%,60%), hsl(180,65%,60%), hsl(240,65%,60%), hsl(300,65%,60%), hsl(360,65%,60%))",
          }}
        >
          {isCustom && <Check size={14} className="absolute inset-0 m-auto text-black drop-shadow" />}
        </button>
      </div>

      {isCustom && (
        <div className="mt-3 space-y-2 mp3-fade-up">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-white/25">Roue des couleurs</p>
            <div className="flex items-center gap-2">
              <div
                className="h-3.5 w-3.5 rounded-full ring-1 ring-white/15"
                style={{ background: `hsl(${hue}, 65%, 55%)` }}
              />
              <span className="text-[11px] text-white/25 tabular-nums w-8">{hue}°</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            value={hue}
            onChange={(e) => onHueChange(Number(e.target.value))}
            style={{
              background:
                "linear-gradient(to right, hsl(0,60%,55%), hsl(30,60%,55%), hsl(60,60%,55%), hsl(90,60%,55%), hsl(120,60%,55%), hsl(150,60%,55%), hsl(180,60%,55%), hsl(210,60%,55%), hsl(240,60%,55%), hsl(270,60%,55%), hsl(300,60%,55%), hsl(330,60%,55%), hsl(360,60%,55%))",
            }}
            className="w-full h-2.5 rounded-full cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer"
          />
        </div>
      )}
    </div>
  );
}

function SegmentedRow<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="text-sm text-white/85 mb-2">{label}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={[
              "h-9 px-3.5 rounded-full text-sm transition",
              value === opt.value
                ? "bg-white text-black font-medium"
                : "bg-white/8 text-white/60 hover:bg-white/12",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsContent() {
  const { accessToken, isAuthenticated } = useAuth();
  const {
    smoothTransitions, toggleSmoothTransitions,
    smartAutoplay, toggleSmartAutoplay,
    focusMode, toggleFocusMode,
    loudnessNorm, toggleLoudnessNorm,
    uiSounds, toggleUiSounds,
    hapticsEnabled, toggleHaptics,
    fontSize, setFontSize,
    highContrast, toggleHighContrast,
    colorTheme, setColorTheme,
    customThemeHue, setCustomThemeHue,
    eqPreset, setEqPreset,
    customEqGains, setCustomEqGains,
  } = usePlayer();

  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushSupported(true);

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => {});
  }, []);

  async function enablePush() {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey || !accessToken || pushBusy) return;

    setPushBusy(true);
    setPushError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushError("Permission refusee par le navigateur.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      setPushEnabled(true);
    } catch {
      setPushError("Impossible d'activer les notifications push.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    if (!accessToken || pushBusy) return;

    setPushBusy(true);
    setPushError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({ endpoint }),
        });
      }

      setPushEnabled(false);
    } catch {
      setPushError("Impossible de desactiver les notifications push.");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div>
      <SettingsSection title="Lecture" delay={0}>
        <ToggleRow
          label="Transitions douces"
          desc="Fondu audio entre les morceaux."
          checked={smoothTransitions}
          onChange={toggleSmoothTransitions}
        />
        <ToggleRow
          label="Lecture intelligente"
          desc="Continue automatiquement avec des morceaux choisis selon tes gouts quand la file se termine."
          checked={smartAutoplay}
          onChange={toggleSmartAutoplay}
        />
        <ToggleRow
          label="Normalisation du volume"
          desc="Lisse les ecarts de volume entre morceaux pour eviter les sauts brusques."
          checked={loudnessNorm}
          onChange={toggleLoudnessNorm}
        />
        <ToggleRow
          label="Mode Focus"
          desc="Interface epuree pendant la lecture plein ecran."
          checked={focusMode}
          onChange={toggleFocusMode}
        />
      </SettingsSection>

      <SettingsSection title="Egaliseur" delay={60}>
        <SegmentedRow
          label="Preset"
          value={eqPreset}
          onChange={setEqPreset}
          options={[
            { value: "off", label: "Off" },
            { value: "bass", label: "Basses" },
            { value: "vocal", label: "Voix" },
            { value: "night", label: "Nuit" },
            { value: "custom", label: "Perso" },
          ]}
        />
        {eqPreset === "custom" ? (
          <EqGainsEditor gains={customEqGains} onChange={setCustomEqGains} />
        ) : null}
      </SettingsSection>

      <SettingsSection title="Apparence" delay={120}>
        <ThemeSwatchRow value={colorTheme} onChange={setColorTheme} hue={customThemeHue} onHueChange={setCustomThemeHue} />
      </SettingsSection>

      <SettingsSection title="Accessibilite" delay={150}>
        <SegmentedRow
          label="Taille du texte"
          value={fontSize}
          onChange={setFontSize}
          options={[
            { value: "sm", label: "Petit" },
            { value: "md", label: "Normal" },
            { value: "lg", label: "Grand" },
            { value: "xl", label: "Tres grand" },
          ]}
        />
        <ToggleRow
          label="Contraste renforce"
          desc="Eclaircit les textes et bordures les plus discrets."
          checked={highContrast}
          onChange={toggleHighContrast}
        />
      </SettingsSection>

      <SettingsSection title="Confort" delay={180}>
        <ToggleRow
          label="Sons d'interface"
          desc="Petits sons doux sur les favoris, succes et messages."
          checked={uiSounds}
          onChange={toggleUiSounds}
        />
        <ToggleRow
          label="Vibrations"
          desc="Retour haptique leger sur mobile (favoris, succes)."
          checked={hapticsEnabled}
          onChange={toggleHaptics}
        />
      </SettingsSection>

      <SettingsSection title="Notifications" delay={240}>
        {!isAuthenticated ? (
          <p className="text-sm text-white/45">Connecte-toi pour gerer les notifications push.</p>
        ) : !pushSupported ? (
          <p className="text-sm text-white/45">Notifications push non supportees par ce navigateur.</p>
        ) : (
          <ToggleRow
            label="Notifications push"
            desc="Recois une notification meme quand l'app est fermee (follow, upload, reaction, mention)."
            checked={pushEnabled}
            onChange={() => void (pushEnabled ? disablePush() : enablePush())}
          />
        )}
        {pushBusy && <p className="text-xs text-white/35">Mise a jour...</p>}
        {pushError && <p className="text-xs text-red-400/80">{pushError}</p>}
      </SettingsSection>
    </div>
  );
}
