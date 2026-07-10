import { hashString32 } from "@/lib/publicLinks";

type ShareableTrack = {
  title: string;
  artist?: string;
  cover?: string;
  src: string;
};

const SIZE = 1080;
const WAVE_BARS = 64;

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

export async function generateTrackShareImage(track: ShareableTrack): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non supporte");

  const cover = track.cover ? await loadImage(track.cover) : null;

  if (cover) {
    ctx.save();
    ctx.filter = "blur(30px) brightness(0.45)";
    const scale = Math.max(SIZE / cover.width, SIZE / cover.height) * 1.15;
    const w = cover.width * scale;
    const h = cover.height * scale;
    ctx.drawImage(cover, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
    ctx.restore();
  } else {
    const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    bg.addColorStop(0, "#1a0b2e");
    bg.addColorStop(1, "#0a0612");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const artSize = 620;
  const artX = (SIZE - artSize) / 2;
  const artY = 140;
  const radius = 28;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  ctx.beginPath();
  ctx.moveTo(artX + radius, artY);
  ctx.arcTo(artX + artSize, artY, artX + artSize, artY + artSize, radius);
  ctx.arcTo(artX + artSize, artY + artSize, artX, artY + artSize, radius);
  ctx.arcTo(artX, artY + artSize, artX, artY, radius);
  ctx.arcTo(artX, artY, artX + artSize, artY, radius);
  ctx.closePath();
  ctx.clip();

  if (cover) {
    const scale = Math.max(artSize / cover.width, artSize / cover.height);
    const w = cover.width * scale;
    const h = cover.height * scale;
    ctx.drawImage(cover, artX + (artSize - w) / 2, artY + (artSize - h) / 2, w, h);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(artX, artY, artSize, artSize);
  }
  ctx.restore();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 46px sans-serif";
  ctx.fillText(truncateToWidth(ctx, track.title, SIZE - 160), SIZE / 2, artY + artSize + 90);

  if (track.artist) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "400 32px sans-serif";
    ctx.fillText(truncateToWidth(ctx, track.artist, SIZE - 160), SIZE / 2, artY + artSize + 140);
  }

  const rand = seededRandom(hashString32(track.src));
  const waveY = artY + artSize + 190;
  const waveWidth = artSize;
  const waveX = (SIZE - waveWidth) / 2;
  const barGap = 5;
  const barWidth = waveWidth / WAVE_BARS - barGap;
  const maxBarHeight = 50;

  ctx.textAlign = "left";
  for (let i = 0; i < WAVE_BARS; i += 1) {
    const h = Math.max(6, rand() * maxBarHeight);
    const x = waveX + i * (barWidth + barGap);
    const y = waveY + (maxBarHeight - h) / 2;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    const r = Math.min(barWidth / 2, 3);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + barWidth, y, x + barWidth, y + h, r);
    ctx.arcTo(x + barWidth, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + barWidth, y, r);
    ctx.closePath();
    ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "600 28px sans-serif";
  ctx.fillText(".mp3", SIZE / 2, SIZE - 45);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Generation de l'image impossible"));
    }, "image/png");
  });
}

export async function shareOrDownloadImage(blob: Blob, track: { title: string }): Promise<void> {
  const fileName = `${track.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "son"}.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: track.title });
      return;
    } catch {
      // fall through to download on cancel/failure
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
