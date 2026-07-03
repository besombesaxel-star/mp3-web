"use client";

import { useEffect, useRef, useState } from "react";

const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 512;
const MAX_ZOOM = 3;

type Props = {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
};

export default function AvatarCropper({ file, onCancel, onCropped }: Props) {
  const [imageUrl, setImageUrl] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  const baseScale =
    naturalSize.width > 0
      ? Math.max(VIEWPORT_SIZE / naturalSize.width, VIEWPORT_SIZE / naturalSize.height)
      : 1;
  const scale = baseScale * zoom;
  const displayWidth = naturalSize.width * scale;
  const displayHeight = naturalSize.height * scale;
  const maxOffsetX = Math.max(0, (displayWidth - VIEWPORT_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - VIEWPORT_SIZE) / 2);

  function clampOffset(x: number, y: number) {
    return {
      x: Math.min(maxOffsetX, Math.max(-maxOffsetX, x)),
      y: Math.min(maxOffsetY, Math.max(-maxOffsetY, y)),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, offsetX: offset.x, offsetY: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.offsetX + dx, dragRef.current.offsetY + dy));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onZoomChange(value: number) {
    setZoom(value);
    setOffset((prev) => clampOffset(prev.x, prev.y));
  }

  async function handleValidate() {
    if (naturalSize.width === 0) return;
    setExporting(true);
    try {
      const img = new window.Image();
      img.src = imageUrl;
      if (!img.complete) {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Erreur de chargement"));
        });
      }

      const imageTopLeftX = (VIEWPORT_SIZE - displayWidth) / 2 + offset.x;
      const imageTopLeftY = (VIEWPORT_SIZE - displayHeight) / 2 + offset.y;
      const sx = -imageTopLeftX / scale;
      const sy = -imageTopLeftY / scale;
      const sSize = VIEWPORT_SIZE / scale;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      canvas.toBlob(
        (blob) => {
          setExporting(false);
          if (blob) onCropped(blob);
        },
        "image/jpeg",
        0.92
      );
    } catch {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 mp3-backdrop-in">
      <div className="w-full max-w-sm rounded-3xl bg-[#15151C] border border-white/10 p-5 mp3-scale-in">
        <p className="text-sm text-white/85 mb-4">Recadrer la photo de profil</p>

        <div
          className="relative mx-auto overflow-hidden rounded-full border border-white/10 bg-black cursor-grab touch-none select-none"
          style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              onLoad={handleImageLoad}
              className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
              style={{
                width: displayWidth || undefined,
                height: displayHeight || undefined,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
        </div>

        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="w-full mt-5"
          aria-label="Zoom"
        />

        <div className="flex items-center gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-10 rounded-full bg-white/8 text-white/70 text-sm hover:bg-white/12 transition"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleValidate()}
            disabled={exporting || naturalSize.width === 0}
            className="flex-1 h-10 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {exporting ? "..." : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}
