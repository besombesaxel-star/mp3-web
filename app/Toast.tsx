"use client";

import { useEffect, useState } from "react";
import { Check, Heart, Music } from "lucide-react";

type ToastItem = {
  id: number;
  message: string;
  icon: "heart" | "check" | "music";
};

let nextId = 0;
let _add: ((item: Omit<ToastItem, "id">) => void) | null = null;

export function toast(message: string, icon: ToastItem["icon"] = "check") {
  _add?.({ message, icon });
}

export default function Toast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    _add = (item) => {
      const id = ++nextId;
      setItems((prev) => [...prev, { ...item, id }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600);
    };
    return () => {
      _add = null;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-24 inset-x-0 flex flex-col items-center gap-2 z-[9999] pointer-events-none">
      {items.map((item) => (
        <div
          key={item.id}
          className="mp3-fade-up bg-black/80 backdrop-blur-md rounded-2xl px-4 py-2.5 flex items-center gap-2.5 ring-1 ring-white/10 text-sm text-white/90 shadow-xl"
        >
          {item.icon === "heart" && (
            <Heart size={13} className="text-red-400 fill-red-400 shrink-0" />
          )}
          {item.icon === "check" && (
            <Check size={13} className="text-green-400 shrink-0" />
          )}
          {item.icon === "music" && (
            <Music size={13} className="text-white/50 shrink-0" />
          )}
          {item.message}
        </div>
      ))}
    </div>
  );
}
