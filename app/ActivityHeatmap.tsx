"use client";

import { useMemo } from "react";

type ActivityHeatmapProps = {
  playsByDay: Record<string, number>;
};

type Cell = { date: Date; key: string; count: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_TO_SHOW = 53;
const CELL_STEP_PX = 13; // 10px cell + 3px gap
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sep", "Oct", "Nov", "Dec"];
const LEVEL_COLORS = [
  "rgba(255,255,255,0.05)",
  "rgba(139,92,246,0.35)",
  "rgba(139,92,246,0.55)",
  "rgba(139,92,246,0.78)",
  "rgba(139,92,246,0.98)",
];

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function levelForCount(count: number): number {
  if (count <= 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

export default function ActivityHeatmap({ playsByDay }: ActivityHeatmapProps) {
  const { weeks, monthMarkers, totalActiveDays } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS_TO_SHOW * 7 - 1));
    start.setDate(start.getDate() - start.getDay()); // align to the previous Sunday

    const weeksArr: Array<Array<Cell | null>> = [];
    const markers: Array<{ weekIndex: number; label: string }> = [];
    let cursor = new Date(start);
    let lastMonth = -1;
    let activeDays = 0;

    for (let w = 0; w < WEEKS_TO_SHOW; w += 1) {
      const week: Array<Cell | null> = [];
      for (let d = 0; d < 7; d += 1) {
        if (cursor > today) {
          week.push(null);
        } else {
          const key = toDayKey(cursor);
          const count = playsByDay[key] ?? 0;
          if (count > 0) activeDays += 1;
          week.push({ date: new Date(cursor), key, count });
          if (cursor.getMonth() !== lastMonth && cursor.getDate() <= 7) {
            markers.push({ weekIndex: w, label: MONTH_LABELS[cursor.getMonth()] });
            lastMonth = cursor.getMonth();
          }
        }
        cursor = new Date(cursor.getTime() + DAY_MS);
      }
      weeksArr.push(week);
    }

    return { weeks: weeksArr, monthMarkers: markers, totalActiveDays: activeDays };
  }, [playsByDay]);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-block min-w-full">
        <div className="relative h-4 mb-1">
          {monthMarkers.map((m) => (
            <span
              key={`${m.weekIndex}-${m.label}`}
              className="absolute text-[10px] text-white/30"
              style={{ left: `${m.weekIndex * CELL_STEP_PX}px` }}
            >
              {m.label}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell, di) => (
                <div
                  key={di}
                  title={cell ? `${cell.key} - ${cell.count} ecoute${cell.count > 1 ? "s" : ""}` : undefined}
                  className="h-[10px] w-[10px] rounded-[2px] transition-colors"
                  style={{ background: cell ? LEVEL_COLORS[levelForCount(cell.count)] : "transparent" }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-white/30 mt-3">
        {totalActiveDays} jour{totalActiveDays > 1 ? "s" : ""} actif{totalActiveDays > 1 ? "s" : ""} sur les 12 derniers mois
      </p>
    </div>
  );
}
