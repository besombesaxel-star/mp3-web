"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { dispatchTracksUpdated, subscribeTracksUpdated } from "../tracksSync";
import { toast } from "../Toast";

type UploadResponse = {
  ok?: boolean;
  error?: string;
  track?: {
    src?: string;
    title?: string;
    artist?: string;
  };
};

type TracksResponse = {
  tracks?: Array<{ title: string; src: string }>;
};

type MetaResponse = {
  ok?: boolean;
  error?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function guessTitleFromFile(name: string) {
  return name
    .replace(/\.[^/.]+$/, "")
    .replace(/-\w{8}$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function uploadWithProgress(formData: FormData, onProgress: (ratio: number) => void, accessToken: string | null) {
  return new Promise<{ status: number; json: UploadResponse }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const ratio = event.total > 0 ? event.loaded / event.total : 0;
      onProgress(Math.max(0, Math.min(1, ratio)));
    };

    xhr.onerror = () => reject(new Error("Erreur reseau"));
    xhr.onabort = () => reject(new Error("Upload annule"));
    xhr.onload = () => {
      let json: UploadResponse = {};
      try {
        json = JSON.parse(xhr.responseText) as UploadResponse;
      } catch {
        json = {};
      }
      resolve({ status: xhr.status, json });
    };

    xhr.send(formData);
  });
}

export default function UploadPage() {
  const { accessToken, isAuthenticated, loading } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("Local upload");
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [existingNames, setExistingNames] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

  function onDropAudio(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setAudio(file);
  }

  function onDropCover(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setCover(file);
  }

  async function loadExistingNames() {
    const res = await fetch("/api/tracks", { cache: "no-store" });
    if (!res.ok) return;

    const json: TracksResponse = await res.json();
    const names = (json.tracks ?? []).map((track) => normalizeText(track.title));
    setExistingNames(names);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!mounted) return;
        await loadExistingNames();
      } catch {
        // ignore duplicate-check fetch errors
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return subscribeTracksUpdated(() => {
      void loadExistingNames();
    });
  }, []);

  useEffect(() => {
    if (!audio) {
      setTitle("");
      return;
    }
    setTitle((prev) => (prev.trim() ? prev : guessTitleFromFile(audio.name)));
  }, [audio]);

  useEffect(() => {
    if (!cover) {
      setCoverPreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(cover);
    setCoverPreview(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [cover]);

  const duplicateDetected = useMemo(() => {
    if (!title.trim()) return false;
    const normalized = normalizeText(title);
    return existingNames.includes(normalized);
  }, [title, existingNames]);

  async function onUpload() {
    if (!audio || busy) return;
    if (!accessToken) {
      setMessage("Connecte-toi depuis l'onglet Compte pour uploader un son.");
      return;
    }

    setBusy(true);
    setMessage("");
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("audio", audio);
      if (cover) formData.append("cover", cover);

      const { status, json } = await uploadWithProgress(formData, setProgress, accessToken);
      if (status < 200 || status >= 300 || !json.ok || !json.track?.src) {
        setMessage(`Erreur: ${json.error ?? `Upload impossible (HTTP ${status})`}`);
        return;
      }

      const cleanTitle = title.trim();
      const cleanArtist = artist.trim();
      if (cleanTitle || cleanArtist) {
        const metaRes = await fetch("/api/meta", {
          method: "POST",
          headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({
            src: json.track.src,
            title: cleanTitle || guessTitleFromFile(audio.name),
            artist: cleanArtist || "Local upload",
          }),
        });

        let metaJson: MetaResponse = {};
        try {
          metaJson = (await metaRes.json()) as MetaResponse;
        } catch {
          metaJson = {};
        }

        if (!metaRes.ok || !metaJson.ok) {
          await loadExistingNames();
          dispatchTracksUpdated();
          setMessage(`Upload OK, mais meta non sauvegardee: ${metaJson.error ?? `HTTP ${metaRes.status}`}`);
          setStep(4);
          return;
        }
      }

      await loadExistingNames();
      dispatchTracksUpdated();
      setMessage("Upload termine. Ton son est disponible dans la bibliotheque.");
      toast("Son ajouté à la bibliothèque", "music");
      setStep(4);
    } catch (errorValue: unknown) {
      setMessage(`Erreur: ${getErrorMessage(errorValue, "Echec de l'upload")}`);
    } finally {
      setBusy(false);
    }
  }

  function resetWizard() {
    setStep(1);
    setAudio(null);
    setCover(null);
    setProgress(0);
    setMessage("");
    setTitle("");
    setArtist("Local upload");
    void loadExistingNames();
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl text-white/90 mb-2">Upload</h1>
        <p className="text-sm text-white/50 mb-6">
          Wizard: fichier - cover - metadata - confirmation
        </p>

        {!loading && !isAuthenticated ? (
          <div className="mb-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Connecte-toi dans <Link href="/account" className="underline underline-offset-4">Compte</Link> pour uploader un son.
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-4 gap-2">
          {[
            { id: 1, label: "Fichier" },
            { id: 2, label: "Cover" },
            { id: 3, label: "Infos" },
            { id: 4, label: "Finish" },
          ].map((item) => (
            <div
              key={item.id}
              className={[
                "rounded-xl border px-3 py-2 text-xs text-center transition",
                step >= item.id ? "border-white/20 bg-white/10 text-white/90" : "border-white/10 bg-white/5 text-white/40",
              ].join(" ")}
            >
              {item.label}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-5">
          {step === 1 ? (
            <div>
              <label htmlFor="audio-input" className="block text-sm text-white/70 mb-2">
                1) Selectionne ton MP3
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDropAudio}
                className={[
                  "rounded-2xl border-2 border-dashed p-4 transition",
                  dragActive ? "border-white/40 bg-white/8" : "border-white/15",
                ].join(" ")}
              >
                <input
                  id="audio-input"
                  type="file"
                  accept=".mp3,audio/mpeg"
                  onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-white/70"
                  disabled={busy || loading || !isAuthenticated}
                />
                <p className="mt-2 text-xs text-white/30">ou glisse-depose le fichier ici</p>
              </div>

              {audio ? (
                <div className="mt-2 text-xs text-white/50">
                  Selectionne: <span className="text-white/80">{audio.name}</span> ({Math.round(audio.size / 1024)} KB)
                </div>
              ) : (
                <div className="mt-2 text-xs text-white/40">Aucun fichier selectionne.</div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!audio || loading || !isAuthenticated}
                  className="h-10 px-4 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-50"
                >
                  Continuer
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <label htmlFor="cover-input" className="block text-sm text-white/70 mb-2">
                2) Ajoute une cover (optionnel)
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDropCover}
                className={[
                  "rounded-2xl border-2 border-dashed p-4 transition",
                  dragActive ? "border-white/40 bg-white/8" : "border-white/15",
                ].join(" ")}
              >
                <input
                  id="cover-input"
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setCover(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-white/70"
                  disabled={busy || loading || !isAuthenticated}
                />
                <p className="mt-2 text-xs text-white/30">ou glisse-depose l&apos;image ici</p>
              </div>

              <div className="mt-4 flex items-start gap-4">
                <div className="h-28 w-28 rounded-2xl overflow-hidden border border-white/10 bg-[#111118] shrink-0">
                  {coverPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPreview} alt="Preview cover" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-white/35">No cover</div>
                  )}
                </div>

                <div className="text-xs text-white/50">
                  {cover ? (
                    <p>
                      Fichier image: <span className="text-white/75">{cover.name}</span>
                    </p>
                  ) : (
                    <p>Aucune cover selectionnee.</p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="h-10 px-4 rounded-xl bg-white/10 text-white/85 text-sm hover:bg-white/15 transition"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="h-10 px-4 rounded-xl bg-white text-black text-sm font-semibold"
                >
                  Continuer
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <p className="text-sm text-white/70 mb-3">3) Verifie les metadata</p>

              <div className="space-y-3">
                <div>
                  <label htmlFor="meta-title" className="block text-xs text-white/45 mb-1">
                    Titre
                  </label>
                  <input
                    id="meta-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl bg-[#111118] border border-white/10 px-3 py-2 text-base sm:text-sm text-white/90 outline-none"
                    placeholder="Titre..."
                  />
                </div>

                <div>
                  <label htmlFor="meta-artist" className="block text-xs text-white/45 mb-1">
                    Artiste
                  </label>
                  <input
                    id="meta-artist"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    className="w-full rounded-xl bg-[#111118] border border-white/10 px-3 py-2 text-base sm:text-sm text-white/90 outline-none"
                    placeholder="Artiste..."
                  />
                </div>
              </div>

              {duplicateDetected ? (
                <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                  Doublon potentiel detecte: un titre similaire existe deja.
                </div>
              ) : null}

              {busy ? (
                <div className="mt-4">
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-white transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <p className="text-xs text-white/55 mt-2">{Math.round(progress * 100)}%</p>
                </div>
              ) : null}

              <div className="mt-5 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={busy}
                  className="h-10 px-4 rounded-xl bg-white/10 text-white/85 text-sm hover:bg-white/15 transition disabled:opacity-50"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={onUpload}
                  disabled={!audio || busy || loading || !isAuthenticated}
                  className="h-10 px-4 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? "Upload..." : "Lancer l'upload"}
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <p className="text-sm text-white/80">4) Confirmation</p>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80" aria-live="polite">
                {message || "Termine."}
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="h-10 px-4 rounded-xl bg-white/10 text-white/85 text-sm hover:bg-white/15 transition"
                >
                  Revenir
                </button>
                <button
                  type="button"
                  onClick={resetWizard}
                  className="h-10 px-4 rounded-xl bg-white text-black text-sm font-semibold"
                >
                  Nouvel upload
                </button>
              </div>
            </div>
          ) : null}

          <div className="text-xs text-white/40">
            Sauvegarde: cloud si configure, sinon local dans <code className="text-white/70">public/audio</code> et{" "}
            <code className="text-white/70">public/cover</code>. L&apos;upload reel utilise un <b>POST</b> protege par compte.
          </div>
        </div>
      </div>
    </div>
  );
}
