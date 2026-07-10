"use client";

import { useState } from "react";
import { Camera, Check, Code, Heart, Link2, ListEnd, ListPlus, MessageCircle, Trash2, X } from "lucide-react";
import { usePlayer, type Track } from "./PlayerContext";
import { vibrate } from "./haptics";
import TrackCommentsModal from "./TrackCommentsModal";
import Portal from "./Portal";
import { generateTrackShareImage, shareOrDownloadImage } from "@/lib/shareCard";

type Props = {
  track: Track | null;
  onClose: () => void;
  removeFromPlaylist?: { playlistName: string; onRemove: () => void };
};

export default function TrackContextMenu({ track, onClose, removeFromPlaylist }: Props) {
  const { addToQueueNext, addToQueueEnd, toggleFavorite, isFavorite, hapticsEnabled } = usePlayer();
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [commentsTrack, setCommentsTrack] = useState<Track | null>(null);
  const [sharing, setSharing] = useState(false);

  function openComments() {
    if (!track) return;
    const target = track;
    if (hapticsEnabled) vibrate(12);
    setCommentsTrack(target);
    onClose();
  }

  async function shareImage() {
    if (!track || sharing) return;
    setSharing(true);
    try {
      const blob = await generateTrackShareImage(track);
      await shareOrDownloadImage(blob, track);
    } catch {
      // ignore: generation/share failures are silent, non-critical UX
    } finally {
      setSharing(false);
      onClose();
    }
  }

  if (!track) {
    return commentsTrack ? (
      <Portal>
        <TrackCommentsModal track={commentsTrack} open onClose={() => setCommentsTrack(null)} />
      </Portal>
    ) : null;
  }

  const liked = isFavorite(track.src);

  function withHaptic(action: () => void) {
    if (hapticsEnabled) vibrate(12);
    action();
    onClose();
  }

  function copyLink() {
    if (!track) return;
    const url = track.src.startsWith("http") ? track.src : `${window.location.origin}${track.src}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        if (hapticsEnabled) vibrate(12);
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
          onClose();
        }, 1200);
      })
      .catch(() => {});
  }

  function copyEmbed() {
    if (!track) return;
    const params = new URLSearchParams({ src: track.src, title: track.title });
    if (track.artist) params.set("artist", track.artist);
    if (track.cover) params.set("cover", track.cover);

    const embedUrl = `${window.location.origin}/embed?${params.toString()}`;
    const snippet = `<iframe src="${embedUrl}" width="380" height="90" frameborder="0" allow="autoplay"></iframe>`;

    navigator.clipboard
      .writeText(snippet)
      .then(() => {
        if (hapticsEnabled) vibrate(12);
        setEmbedCopied(true);
        setTimeout(() => {
          setEmbedCopied(false);
          onClose();
        }, 1200);
      })
      .catch(() => {});
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[120] bg-black/60 mp3-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[121] rounded-t-3xl border-t border-white/10 bg-[#0c0c0e] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] mp3-drawer-in"
        role="dialog"
        aria-modal="true"
        aria-label="Actions sur le morceau"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15" aria-hidden="true" />

        <div className="flex items-center gap-3 px-1 pb-3 border-b border-white/8 mb-2">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/5">
            {track.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={track.cover} alt={track.title} className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white/90 truncate">{track.title}</p>
            <p className="text-xs text-white/45 truncate">{track.artist ?? "-"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full hover:bg-white/8 flex items-center justify-center text-white/50 shrink-0"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <button
          type="button"
          className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 transition text-left text-sm text-white/85"
          onClick={() => withHaptic(() => addToQueueNext(track))}
        >
          <ListPlus size={18} className="opacity-80" />
          Ajouter a la suite
        </button>

        <button
          type="button"
          className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 transition text-left text-sm text-white/85"
          onClick={() => withHaptic(() => addToQueueEnd(track))}
        >
          <ListEnd size={18} className="opacity-80" />
          Ajouter en fin de file
        </button>

        <button
          type="button"
          className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 transition text-left text-sm text-white/85"
          onClick={() => withHaptic(() => toggleFavorite(track))}
        >
          <Heart size={18} className={liked ? "fill-white/85 text-white/85" : "opacity-80"} />
          {liked ? "Retirer des favoris" : "Ajouter aux favoris"}
        </button>

        <button
          type="button"
          className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 transition text-left text-sm text-white/85"
          onClick={openComments}
        >
          <MessageCircle size={18} className="opacity-80" />
          Commentaires
        </button>

        <button
          type="button"
          className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 transition text-left text-sm text-white/85 disabled:opacity-50"
          onClick={() => void shareImage()}
          disabled={sharing}
        >
          <Camera size={18} className="opacity-80" />
          {sharing ? "Generation..." : "Partager en image"}
        </button>

        <button
          type="button"
          className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 transition text-left text-sm text-white/85"
          onClick={copyLink}
        >
          {copied ? <Check size={18} className="text-green-400" /> : <Link2 size={18} className="opacity-80" />}
          {copied ? "Lien copie" : "Copier le lien"}
        </button>

        <button
          type="button"
          className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 transition text-left text-sm text-white/85"
          onClick={copyEmbed}
        >
          {embedCopied ? <Check size={18} className="text-green-400" /> : <Code size={18} className="opacity-80" />}
          {embedCopied ? "Code copie" : "Copier le code d'integration"}
        </button>

        {removeFromPlaylist ? (
          <button
            type="button"
            className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/5 transition text-left text-sm text-red-300"
            onClick={() => withHaptic(() => removeFromPlaylist.onRemove())}
          >
            <Trash2 size={18} className="opacity-80" />
            {`Retirer de « ${removeFromPlaylist.playlistName} »`}
          </button>
        ) : null}
      </div>
    </Portal>
  );
}
