import { Suspense } from "react";
import EmbedPlayer from "./EmbedPlayer";

export default function EmbedPage() {
  return (
    <Suspense fallback={null}>
      <EmbedPlayer />
    </Suspense>
  );
}
