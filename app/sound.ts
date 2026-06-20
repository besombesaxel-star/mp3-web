let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  audioContext = new Ctor();
  return audioContext;
}

// Browsers keep a freshly created AudioContext "suspended" until it's resumed
// from a direct user gesture. Call this synchronously inside a click handler
// (e.g. when the user turns interface sounds on) so later calls - even from
// async code like a fetch callback - actually produce audible sound.
export function unlockAudio() {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
}

function playTone(frequency: number, startDelayMs: number, durationMs: number, volume: number) {
  const ctx = getContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }

  try {
    const startAt = ctx.currentTime + startDelayMs / 1000;
    const stopAt = startAt + durationMs / 1000;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(stopAt + 0.02);
  } catch {
    /* ignore */
  }
}

export function playPopSound() {
  playTone(720, 0, 90, 0.12);
}

export function playChimeSound() {
  playTone(880, 0, 140, 0.11);
  playTone(1320, 90, 180, 0.1);
}
