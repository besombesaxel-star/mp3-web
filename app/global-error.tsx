"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown by the root layout itself (AuthProvider/PlayerProvider
 * init, etc.) - the one case app/error.tsx can't cover, since it lives inside
 * that same layout. Must render its own <html>/<body> and stay dependency-free
 * (inline styles only) since it's the last-resort fallback.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          background: "#0B0B0F",
          color: "rgba(255,255,255,0.9)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 360, padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>.mp3 a rencontré un problème</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>
            Quelque chose d&apos;inattendu s&apos;est produit. Réessaie dans un instant.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 16 }}>
              Référence : {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              height: 40,
              padding: "0 20px",
              borderRadius: 9999,
              background: "white",
              color: "black",
              fontSize: 14,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
