export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLauncherWatchdog } = await import("./lib/launcherHeartbeat");
    startLauncherWatchdog();
  }
}
