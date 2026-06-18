const isEnabled = process.env.MP3_WEB_AUTO_SHUTDOWN === "1";
const idleTimeoutMs = 20_000;
const checkIntervalMs = 5_000;

type LauncherHeartbeatState = {
  lastSeen: number;
  watchdogStarted: boolean;
};

// instrumentation.ts and the API route live in separate Next.js server bundles,
// so a plain module-level variable would give each its own copy. globalThis is
// the only state guaranteed to be shared across bundles within the same process.
const globalState = globalThis as typeof globalThis & {
  __mp3WebLauncherHeartbeat?: LauncherHeartbeatState;
};

function getState(): LauncherHeartbeatState {
  if (!globalState.__mp3WebLauncherHeartbeat) {
    globalState.__mp3WebLauncherHeartbeat = {
      lastSeen: Date.now(),
      watchdogStarted: false,
    };
  }
  return globalState.__mp3WebLauncherHeartbeat;
}

export function recordHeartbeat() {
  getState().lastSeen = Date.now();
}

export function startLauncherWatchdog() {
  if (!isEnabled) return;

  const state = getState();
  if (state.watchdogStarted) return;
  state.watchdogStarted = true;

  const timer = setInterval(() => {
    if (Date.now() - state.lastSeen > idleTimeoutMs) {
      clearInterval(timer);
      process.exit(0);
    }
  }, checkIntervalMs);

  timer.unref();
}
