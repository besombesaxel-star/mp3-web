"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/AuthProvider";
import { usePlayer } from "@/app/PlayerContext";
import { createAuthorizedHeaders } from "@/lib/clientAuth";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 mb-5">
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
          "shrink-0 h-7 w-12 rounded-full transition relative",
          checked ? "bg-white" : "bg-white/15",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-1 h-5 w-5 rounded-full transition-all",
            checked ? "left-6 bg-black" : "left-1 bg-white",
          ].join(" ")}
        />
      </button>
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

export default function SettingsPage() {
  const { accessToken, isAuthenticated } = useAuth();
  const {
    smoothTransitions, toggleSmoothTransitions,
    smartAutoplay, toggleSmartAutoplay,
    focusMode, toggleFocusMode,
    uiSounds, toggleUiSounds,
    hapticsEnabled, toggleHaptics,
    theme, setTheme,
    eqPreset, setEqPreset,
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
    <div className="max-w-2xl mx-auto pb-40">
      <h2 className="text-3xl font-light mb-8">Parametres</h2>

      <SettingsSection title="Lecture">
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
          label="Mode Focus"
          desc="Interface epuree pendant la lecture plein ecran."
          checked={focusMode}
          onChange={toggleFocusMode}
        />
      </SettingsSection>

      <SettingsSection title="Egaliseur">
        <SegmentedRow
          label="Preset"
          value={eqPreset}
          onChange={setEqPreset}
          options={[
            { value: "off", label: "Off" },
            { value: "bass", label: "Basses" },
            { value: "vocal", label: "Voix" },
            { value: "night", label: "Nuit" },
          ]}
        />
      </SettingsSection>

      <SettingsSection title="Ambiance">
        <SegmentedRow
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "midnight", label: "Minuit" },
            { value: "sunset", label: "Coucher de soleil" },
            { value: "ocean", label: "Ocean" },
          ]}
        />
      </SettingsSection>

      <SettingsSection title="Confort">
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

      <SettingsSection title="Notifications">
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
