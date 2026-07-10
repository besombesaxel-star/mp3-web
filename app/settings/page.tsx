"use client";

import SettingsContent from "@/app/SettingsContent";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-40">
      <h2 className="text-3xl font-light mb-8 mp3-fade-up">Parametres</h2>
      <SettingsContent />
    </div>
  );
}
