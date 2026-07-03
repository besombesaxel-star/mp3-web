const TARGET_KBPS = 128;
const SUGGEST_THRESHOLD_BYTES = 6 * 1024 * 1024;
const BLOCK_SIZE = 1152;

export function shouldSuggestCompression(file: File): boolean {
  return file.size > SUGGEST_THRESHOLD_BYTES;
}

function floatTo16BitPCM(samples: Float32Array, start: number, len: number): Int16Array {
  const out = new Int16Array(len);
  for (let i = 0; i < len; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[start + i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Re-encodes an audio file to a lower-bitrate MP3 client-side. Returns the original file if decoding/encoding fails or doesn't shrink it. */
export async function compressAudioFile(file: File, targetKbps: number = TARGET_KBPS): Promise<File> {
  try {
    const AudioContextCtor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return file;

    const arrayBuffer = await file.arrayBuffer();
    const ctx = new AudioContextCtor();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    } finally {
      void ctx.close();
    }

    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const channels = Math.min(audioBuffer.numberOfChannels, 2);
    const encoder = new Mp3Encoder(channels, audioBuffer.sampleRate, targetKbps);

    const left = audioBuffer.getChannelData(0);
    const right = channels > 1 ? audioBuffer.getChannelData(1) : null;

    const chunks: Uint8Array[] = [];
    for (let i = 0; i < left.length; i += BLOCK_SIZE) {
      const len = Math.min(BLOCK_SIZE, left.length - i);
      const leftChunk = floatTo16BitPCM(left, i, len);
      const rightChunk = right ? floatTo16BitPCM(right, i, len) : undefined;
      const encoded = encoder.encodeBuffer(leftChunk, rightChunk);
      if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
    }
    const tail = encoder.flush();
    if (tail.length > 0) chunks.push(new Uint8Array(tail));

    const blob = new Blob(chunks.map((chunk) => new Uint8Array(chunk)), { type: "audio/mpeg" });
    if (blob.size <= 0 || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^/.]+$/, "") + ".mp3";
    return new File([blob], newName, { type: "audio/mpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
