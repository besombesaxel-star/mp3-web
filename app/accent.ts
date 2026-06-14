export type AccentRGB = { r: number; g: number; b: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hashString(str: string) {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToRgb(h: number, s: number, l: number): AccentRGB {
  // h: 0..360, s/l: 0..1
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;

  if (hh >= 0 && hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const m = l - c / 2;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** Accent stable sans cover (basé sur le texte) */
export function accentFromText(text: string): AccentRGB {
  const h = hashString(text || "mp3") % 360;
  // saturation/luminosité “joli” (pas trop flashy)
  return hslToRgb(h, 0.72, 0.58);
}

/** Accent depuis cover (canvas) */
export async function accentFromCover(coverUrl: string): Promise<AccentRGB | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.src = coverUrl;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("load failed"));
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const w = 48, h = 48;
    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    let r = 0, g = 0, b = 0, count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const rr = data[i];
      const gg = data[i + 1];
      const bb = data[i + 2];
      const a = data[i + 3];

      if (a < 200) continue;

      const max = Math.max(rr, gg, bb);
      const min = Math.min(rr, gg, bb);
      if (max < 18) continue;   // trop noir
      if (min > 240) continue;  // trop blanc

      r += rr; g += gg; b += bb;
      count++;
    }

    if (!count) return null;

    r = clamp(Math.round(r / count), 0, 255);
    g = clamp(Math.round(g / count), 0, 255);
    b = clamp(Math.round(b / count), 0, 255);

    return { r, g, b };
  } catch {
    return null;
  }
}
