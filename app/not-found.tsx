import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-white/40">
        <Compass size={22} />
      </div>
      <div>
        <h1 className="text-lg font-medium text-white/90">Page introuvable</h1>
        <p className="mt-2 text-sm text-white/45">Ce lien ne mène nulle part, ou plus nulle part.</p>
      </div>
      <Link
        href="/"
        className="flex items-center h-10 px-5 rounded-full bg-white text-black text-sm font-medium hover:opacity-90 transition"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
