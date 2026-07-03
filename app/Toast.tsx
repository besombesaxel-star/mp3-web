"use client";

import { useEffect, useRef, useState } from "react";
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

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    dragStartRef.current = e.touches[0].clientX;
    setIsDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (dragStartRef.current === null) return;
    setDragX(e.touches[0].clientX - dragStartRef.current);
  }

  function onTouchEnd() {
    if (Math.abs(dragX) > 80) {
      onDismiss(item.id);
    } else {
      setDragX(0);
    }
    dragStartRef.current = null;
    setIsDragging(false);
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={() => onDismiss(item.id)}
      style={{
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        opacity: dragX ? Math.max(0.2, 1 - Math.abs(dragX) / 200) : undefined,
        transition: isDragging ? "none" : "transform 200ms ease, opacity 200ms ease",
      }}
      className="mp3-fade-up pointer-events-auto cursor-pointer bg-black/80 backdrop-blur-md rounded-2xl px-4 py-2.5 flex items-center gap-2.5 ring-1 ring-white/10 text-sm text-white/90 shadow-xl"
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
  );
}

export default function Toast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  function dismiss(id: number) {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    _add = (item) => {
      const id = ++nextId;
      setItems((prev) => [...prev, { ...item, id }]);
      setTimeout(() => dismiss(id), 2600);
    };
    return () => {
      _add = null;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-24 inset-x-0 flex flex-col items-center gap-2 z-[9999] pointer-events-none">
      {items.map((item) => (
        <ToastRow key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>
  );
}
