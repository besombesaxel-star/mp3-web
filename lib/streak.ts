export const DAY_MS = 24 * 60 * 60 * 1000;

export function getDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeStreak(
  playsByDay: Record<string, number>,
  frozenDays: string[] | Set<string> = [],
  now: number = Date.now()
): { current: number; longest: number } {
  const activeDays = new Set(
    Object.entries(playsByDay)
      .filter(([, count]) => count > 0)
      .map(([day]) => day)
  );
  for (const day of frozenDays) activeDays.add(day);

  let current = 0;
  if (activeDays.size > 0) {
    let cursor = now;
    if (!activeDays.has(getDayKey(cursor))) {
      cursor -= DAY_MS;
    }
    while (activeDays.has(getDayKey(cursor))) {
      current += 1;
      cursor -= DAY_MS;
    }
  }

  let longest = 0;
  const sortedDays = [...activeDays].sort();
  let run = 0;
  let prevTime: number | null = null;
  for (const day of sortedDays) {
    const time = new Date(`${day}T00:00:00`).getTime();
    if (prevTime !== null && time - prevTime === DAY_MS) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prevTime = time;
  }

  return { current, longest: Math.max(longest, current) };
}
