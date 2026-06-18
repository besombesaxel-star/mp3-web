"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 5_000;

export default function LauncherHeartbeat() {
  useEffect(() => {
    const ping = () => {
      fetch("/api/launcher/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    };

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return null;
}
