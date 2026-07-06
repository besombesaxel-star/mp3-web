const SILENCE_AMPLITUDE = 0.01; // ~ -40dB
const WINDOW_MS = 10;
const MIN_TRIM_SECONDS = 0.15;
const BLOCK_SIZE = 1152;
const TRIM_KBPS = 192;

function floatTo16BitPCM(samples: Float32Array, start: number, len: number): Int16Array {
  const out = new Int16Array(len);
  for (let i = 0; i < len; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[start + i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function findSilenceBounds(buffer: AudioBuffer): { start: number; end: number } | null {
  const windowSize = Math.max(1, Math.round((buffer.sampleRate * WINDOW_MS) / 1000));
  const channels = buffer.numberOfChannels;
  const length = buffer.length;

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c += 1) channelData.push(buffer.getChannelData(c));

  function windowHasSound(windowStart: number): boolean {
    const windowEnd = Math.min(length, windowStart + windowSize);
    for (const data of channelData) {
      for (let i = windowStart; i < windowEnd; i += 1) {
        if (Math.abs(data[i]) > SILENCE_AMPLITUDE) return true;
      }
    }
    return false;
  }

  let start = 0;
  while (start < length && !windowHasSound(start)) start += windowSize;

  if (start >= length) return null; // entirely silent, don't touch it

  let end = length;
  while (end > start && !windowHasSound(end - windowSize)) end -= windowSize;

  return { start: Math.min(start, length), end: Math.max(end, start) };
}

/** Trims leading/trailing silence from an audio file client-side, re-encoding the result as MP3. Returns the original file if trimming fails or isn't worthwhile. */
export async function trimAudioSilence(file: File): Promise<File> {
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

    const bounds = findSilenceBounds(audioBuffer);
    if (!bounds) return file;

    const trimmedLength = bounds.end - bounds.start;
    const trimmedSamples = audioBuffer.length - trimmedLength;
    if (trimmedSamples / audioBuffer.sampleRate < MIN_TRIM_SECONDS) return file;
    if (trimmedLength <= 0 || trimmedLength / audioBuffer.length < 0.05) return file;

    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const channels = Math.min(audioBuffer.numberOfChannels, 2);
    const encoder = new Mp3Encoder(channels, audioBuffer.sampleRate, TRIM_KBPS);

    const left = audioBuffer.getChannelData(0).subarray(bounds.start, bounds.end);
    const right = channels > 1 ? audioBuffer.getChannelData(1).subarray(bounds.start, bounds.end) : null;

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
    if (blob.size <= 0) return file;

    const newName = file.name.replace(/\.[^/.]+$/, "") + ".mp3";
    return new File([blob], newName, { type: "audio/mpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
