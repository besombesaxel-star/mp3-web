export type AccentRGB = { r: number; g: number; b: number };

export async function extractAccentRGB(imageUrl: string): Promise<AccentRGB | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = imageUrl;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("img load failed"));
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    // petit échantillon (perf)
    const w = 48;
    const h = 48;
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

      if (a < 200) continue; // ignore transparents

      const max = Math.max(rr, gg, bb);
      const min = Math.min(rr, gg, bb);

      if (max < 18) continue;    // ignore trop noirs
      if (min > 240) continue;   // ignore trop blancs

      r += rr; g += gg; b += bb;
      count++;
    }

    if (!count) return null;

    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);

    return { r, g, b };
  } catch {
    return null;
  }
}