"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Image as ImageIcon, Layers, Loader2, UploadCloud, X as XIcon } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { createAuthorizedHeaders } from "@/lib/clientAuth";
import { fetchTracksShared } from "../tracksCache";
import { dispatchTracksUpdated, subscribeTracksUpdated } from "../tracksSync";
import { toast } from "../Toast";
import { getSupabaseBrowserAuthClient } from "@/lib/supabaseAuth";
import { pictureToFile, readId3Tags } from "@/lib/id3";

type SignUploadResponse = {
  ok?: boolean;
  error?: string;
  bucket?: string;
  audio?: { path: string; token: string };
  cover?: { path: string; token: string } | null;
};

type CompleteUploadResponse = {
  ok?: boolean;
  error?: string;
  track?: {
    src?: string;
    title?: string;
    artist?: string;
  };
};

type UploadResponse = {
  ok?: boolean;
  error?: string;
  track?: {
    src?: string;
    title?: string;
    artist?: string;
  };
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

type BatchStatus = "pending" | "uploading" | "done" | "error";

type BatchFile = {
  id: string;
  file: File;
  cover: File | null;
  coverPreview: string;
  title: string;
  artist: string;
  status: BatchStatus;
  error?: string;
  duplicate: boolean;
};

const MAX_BATCH_FILES = 30;
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

async function saveMetaForSrc(src: string, title: string, artist: string, accessToken: string) {
  const cleanTitle = title.trim();
  const cleanArtist = artist.trim();
  if (!cleanTitle && !cleanArtist) return;

  await fetch("/api/meta", {
    method: "POST",
    headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      src,
      title: cleanTitle || "Sans titre",
      artist: cleanArtist || "Local upload",
    }),
  }).catch(() => {});
}

async function uploadTrackFile(
  audio: File,
  cover: File | null,
  title: string,
  artist: string,
  accessToken: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const signRes = await fetch("/api/upload/sign", {
      method: "POST",
      headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ audioName: audio.name, audioSize: audio.size, coverName: cover?.name ?? null }),
    });
    const signJson: SignUploadResponse = await signRes.json().catch(() => ({}));

    if (signRes.ok && signJson.ok && signJson.audio) {
      const supabase = getSupabaseBrowserAuthClient();
      if (!supabase) return { ok: false, error: "Client de stockage indisponible." };

      const { error: uploadError } = await supabase.storage
        .from(signJson.bucket!)
        .uploadToSignedUrl(signJson.audio.path, signJson.audio.token, audio);
      if (uploadError) return { ok: false, error: uploadError.message };

      let coverPath: string | null = null;
      if (cover && signJson.cover) {
        const { error: coverUploadError } = await supabase.storage
          .from(signJson.bucket!)
          .uploadToSignedUrl(signJson.cover.path, signJson.cover.token, cover);
        if (!coverUploadError) coverPath = signJson.cover.path;
      }

      const completeRes = await fetch("/api/upload/complete", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ audioPath: signJson.audio.path, coverPath }),
      });
      const completeJson: CompleteUploadResponse = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok || !completeJson.ok || !completeJson.track?.src) {
        return { ok: false, error: completeJson.error ?? `Finalisation impossible (HTTP ${completeRes.status})` };
      }

      await saveMetaForSrc(completeJson.track.src, title, artist, accessToken);
      return { ok: true };
    }

    if (signRes.status !== 500 && signJson.error) {
      return { ok: false, error: signJson.error };
    }
  } catch {
    // fall through to direct upload
  }

  const formData = new FormData();
  formData.append("audio", audio);
  if (cover) formData.append("cover", cover);
  const uploadRes = await fetch("/api/upload", {
    method: "POST",
    headers: createAuthorizedHeaders(accessToken),
    body: formData,
  });
  const uploadJson: UploadResponse = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !uploadJson.ok || !uploadJson.track?.src) {
    return { ok: false, error: uploadJson.error ?? `Upload impossible (HTTP ${uploadRes.status})` };
  }

  await saveMetaForSrc(uploadJson.track.src, title, artist, accessToken);
  return { ok: true };
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
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchReadingTags, setBatchReadingTags] = useState(false);

  async function handleAudioFiles(files: File[]) {
    const mp3Files = files.filter((f) => f.name.toLowerCase().endsWith(".mp3"));
    if (mp3Files.length === 0) return;

    if (mp3Files.length === 1) {
      setAudio(mp3Files[0]);
      return;
    }

    setBatchReadingTags(true);
    const limited = mp3Files.slice(0, MAX_BATCH_FILES);
    const items = await Promise.all(
      limited.map(async (file): Promise<BatchFile> => {
        if (file.size > MAX_UPLOAD_BYTES) {
          return {
            id: crypto.randomUUID(),
            file,
            cover: null,
            coverPreview: "",
            title: guessTitleFromFile(file.name),
            artist: "",
            status: "error",
            error: "Fichier trop lourd (max 80MB)",
            duplicate: false,
          };
        }

        const tags = await readId3Tags(file);
        const resolvedTitle = tags.title || guessTitleFromFile(file.name);
        const cover = tags.picture ? pictureToFile(tags.picture, guessTitleFromFile(file.name)) : null;

        return {
          id: crypto.randomUUID(),
          file,
          cover,
          coverPreview: cover ? URL.createObjectURL(cover) : "",
          title: resolvedTitle,
          artist: tags.artist || "",
          status: "pending",
          duplicate: existingNames.includes(normalizeText(resolvedTitle)),
        };
      })
    );
    setBatchFiles(items);
    setBatchReadingTags(false);
  }

  function updateBatchField(id: string, field: "title" | "artist", value: string) {
    setBatchFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              [field]: value,
              duplicate: field === "title" ? existingNames.includes(normalizeText(value)) : f.duplicate,
            }
          : f
      )
    );
  }

  function removeBatchFile(id: string) {
    setBatchFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.coverPreview) URL.revokeObjectURL(target.coverPreview);
      return prev.filter((f) => f.id !== id);
    });
  }

  function resetBatch() {
    for (const item of batchFiles) {
      if (item.coverPreview) URL.revokeObjectURL(item.coverPreview);
    }
    setBatchFiles([]);
    setBatchBusy(false);
  }

  async function startBatchUpload() {
    if (!accessToken || batchBusy) return;
    setBatchBusy(true);

    for (const item of batchFiles) {
      if (item.status === "done" || item.status === "error") continue;

      setBatchFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "uploading" } : f)));
      const result = await uploadTrackFile(item.file, item.cover, item.title, item.artist, accessToken);
      setBatchFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: result.ok ? "done" : "error", error: result.error } : f))
      );
    }

    setBatchBusy(false);
    await loadExistingNames();
    dispatchTracksUpdated();
    toast("Import termine", "music");
  }

  function onDropAudio(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    void handleAudioFiles(Array.from(e.dataTransfer.files ?? []));
  }

  function onDropCover(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setCover(file);
  }

  const loadExistingNames = useCallback(async () => {
    try {
      const tracks = await fetchTracksShared(accessToken);
      setExistingNames(tracks.map((track) => normalizeText(track.title)));
    } catch {
      // ignore; keep existing names on failure
    }
  }, [accessToken]);

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
  }, [loadExistingNames]);

  useEffect(() => {
    return subscribeTracksUpdated(() => {
      void loadExistingNames();
    });
  }, [loadExistingNames]);

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

  async function saveMetaAndFinish(trackSrc: string) {
    const cleanTitle = title.trim();
    const cleanArtist = artist.trim();

    if (cleanTitle || cleanArtist) {
      const metaRes = await fetch("/api/meta", {
        method: "POST",
        headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          src: trackSrc,
          title: cleanTitle || guessTitleFromFile(audio?.name ?? "track"),
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
  }

  async function uploadDirectToStorage(): Promise<boolean> {
    if (!audio || !accessToken) return false;

    const signRes = await fetch("/api/upload/sign", {
      method: "POST",
      headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        audioName: audio.name,
        audioSize: audio.size,
        coverName: cover?.name ?? null,
      }),
    });

    const signJson: SignUploadResponse = await signRes.json().catch(() => ({}));
    if (!signRes.ok || !signJson.ok || !signJson.audio) {
      if (signRes.status !== 500 && signJson.error) {
        setMessage(`Erreur: ${signJson.error}`);
        setStep(4);
        return true;
      }
      return false;
    }

    const supabase = getSupabaseBrowserAuthClient();
    if (!supabase) {
      setMessage("Erreur: client de stockage indisponible.");
      setStep(4);
      return true;
    }

    setProgress(0.15);
    const { error: audioUploadError } = await supabase.storage
      .from(signJson.bucket!)
      .uploadToSignedUrl(signJson.audio.path, signJson.audio.token, audio);

    if (audioUploadError) {
      setMessage(`Erreur: ${audioUploadError.message}`);
      setStep(4);
      return true;
    }

    setProgress(0.6);

    let coverPath: string | null = null;
    if (cover && signJson.cover) {
      const { error: coverUploadError } = await supabase.storage
        .from(signJson.bucket!)
        .uploadToSignedUrl(signJson.cover.path, signJson.cover.token, cover);

      if (coverUploadError) {
        setMessage(`Erreur: ${coverUploadError.message}`);
        setStep(4);
        return true;
      }
      coverPath = signJson.cover.path;
    }

    setProgress(0.8);

    const completeRes = await fetch("/api/upload/complete", {
      method: "POST",
      headers: createAuthorizedHeaders(accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ audioPath: signJson.audio.path, coverPath }),
    });

    const completeJson: CompleteUploadResponse = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok || !completeJson.ok || !completeJson.track?.src) {
      setMessage(`Erreur: ${completeJson.error ?? `Finalisation impossible (HTTP ${completeRes.status})`}`);
      setStep(4);
      return true;
    }

    setProgress(1);
    await saveMetaAndFinish(completeJson.track.src);
    return true;
  }

  async function onUpload() {
    if (!audio || busy) return;
    if (!accessToken) {
      setMessage("Connecte-toi depuis l'onglet Compte pour uploader un son.");
      setStep(4);
      return;
    }

    setBusy(true);
    setMessage("");
    setProgress(0);

    try {
      const handled = await uploadDirectToStorage();
      if (handled) return;

      const formData = new FormData();
      formData.append("audio", audio);
      if (cover) formData.append("cover", cover);

      const { status, json } = await uploadWithProgress(formData, setProgress, accessToken);
      if (status < 200 || status >= 300 || !json.ok || !json.track?.src) {
        setMessage(`Erreur: ${json.error ?? `Upload impossible (HTTP ${status})`}`);
        setStep(4);
        return;
      }

      await saveMetaAndFinish(json.track.src);
    } catch (errorValue: unknown) {
      setMessage(`Erreur: ${getErrorMessage(errorValue, "Echec de l'upload")}`);
      setStep(4);
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

        {batchReadingTags ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 flex flex-col items-center gap-3 text-center">
            <Loader2 size={22} className="animate-spin text-white/40" />
            <p className="text-sm text-white/60">Lecture des tags ID3...</p>
          </div>
        ) : batchFiles.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-white/50" />
                <p className="text-sm text-white/80">
                  Import de {batchFiles.length} morceau{batchFiles.length > 1 ? "x" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={resetBatch}
                disabled={batchBusy}
                className="text-xs text-white/40 hover:text-white/70 transition disabled:opacity-50"
              >
                Annuler
              </button>
            </div>

            {batchFiles.some((f) => f.duplicate) ? (
              <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                {batchFiles.filter((f) => f.duplicate).length} doublon(s) potentiel(s) detecte(s) - verifie les titres surlignes.
              </div>
            ) : null}

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {batchFiles.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
                >
                  <div className="relative shrink-0 h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center bg-white/5">
                    {item.coverPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.coverPreview} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    {item.status !== "pending" || !item.coverPreview ? (
                      <div
                        className={[
                          "absolute inset-0 flex items-center justify-center",
                          item.coverPreview ? "bg-black/50" : "",
                        ].join(" ")}
                      >
                        {item.status === "uploading" ? (
                          <Loader2 size={14} className="animate-spin text-white/70" />
                        ) : item.status === "done" ? (
                          <Check size={14} className="text-emerald-400" />
                        ) : item.status === "error" ? (
                          <AlertCircle size={14} className="text-red-400" />
                        ) : (
                          <UploadCloud size={14} className="text-white/30" />
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input
                        value={item.title}
                        onChange={(e) => updateBatchField(item.id, "title", e.target.value)}
                        disabled={item.status !== "pending"}
                        placeholder="Titre"
                        title={item.duplicate ? "Doublon potentiel: un titre similaire existe deja" : undefined}
                        className={[
                          "w-full rounded-lg bg-[#111118] border px-2.5 py-1.5 text-xs text-white/90 outline-none disabled:opacity-60",
                          item.duplicate ? "border-amber-300/40" : "border-white/10",
                        ].join(" ")}
                      />
                      {item.duplicate ? (
                        <AlertCircle size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-300/70" />
                      ) : null}
                    </div>
                    <input
                      value={item.artist}
                      onChange={(e) => updateBatchField(item.id, "artist", e.target.value)}
                      disabled={item.status !== "pending"}
                      placeholder="Artiste"
                      className="w-full rounded-lg bg-[#111118] border border-white/10 px-2.5 py-1.5 text-xs text-white/90 outline-none disabled:opacity-60"
                    />
                  </div>
                  {item.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => removeBatchFile(item.id)}
                      aria-label={`Retirer ${item.file.name}`}
                      className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-white/25 hover:text-white/70 hover:bg-white/8 transition"
                    >
                      <XIcon size={13} />
                    </button>
                  ) : item.status === "error" ? (
                    <span className="shrink-0 text-[10px] text-red-400 max-w-[90px] truncate" title={item.error}>
                      {item.error}
                    </span>
                  ) : (
                    <span className="shrink-0 w-7" />
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void startBatchUpload()}
                disabled={batchBusy || !isAuthenticated || batchFiles.every((f) => f.status !== "pending")}
                className="h-10 px-4 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-50"
              >
                {batchBusy ? "Import en cours..." : `Importer ${batchFiles.filter((f) => f.status === "pending").length} morceau(x)`}
              </button>
            </div>
          </div>
        ) : (
          <>
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
              <label
                htmlFor="audio-input"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDropAudio}
                className={[
                  "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 md:min-h-[180px] text-center transition cursor-pointer",
                  dragActive ? "border-white/40 bg-white/8" : "border-white/15 hover:border-white/25 hover:bg-white/[0.03]",
                ].join(" ")}
              >
                <UploadCloud size={28} className="text-white/40" />
                <p className="text-sm text-white/70">
                  <span className="font-medium text-white/90">Clique pour choisir</span> ou glisse-depose ton MP3 ici
                </p>
                <p className="text-xs text-white/30">Fichier .mp3 uniquement - selection multiple possible</p>
                <input
                  id="audio-input"
                  type="file"
                  accept=".mp3,audio/mpeg"
                  multiple
                  onChange={(e) => void handleAudioFiles(Array.from(e.target.files ?? []))}
                  className="sr-only"
                  disabled={busy || loading || !isAuthenticated}
                />
              </label>

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
              <label
                htmlFor="cover-input"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDropCover}
                className={[
                  "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 md:min-h-[160px] text-center transition cursor-pointer",
                  dragActive ? "border-white/40 bg-white/8" : "border-white/15 hover:border-white/25 hover:bg-white/[0.03]",
                ].join(" ")}
              >
                <ImageIcon size={26} className="text-white/40" />
                <p className="text-sm text-white/70">
                  <span className="font-medium text-white/90">Clique pour choisir</span> ou glisse-depose une image ici
                </p>
                <p className="text-xs text-white/30">Optionnel - JPG, PNG, WebP</p>
                <input
                  id="cover-input"
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setCover(e.target.files?.[0] ?? null)}
                  className="sr-only"
                  disabled={busy || loading || !isAuthenticated}
                />
              </label>

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
          </>
        )}
      </div>
    </div>
  );
}
