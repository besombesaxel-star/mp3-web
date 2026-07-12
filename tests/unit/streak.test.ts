import { describe, expect, it } from "vitest";
import { DAY_MS, computeStreak, getDayKey } from "@/lib/streak";

const NOW = new Date(2024, 0, 10, 12, 0, 0).getTime();
const dayKey = (offsetDays: number) => getDayKey(NOW - offsetDays * DAY_MS);

describe("getDayKey", () => {
  it("formats as YYYY-MM-DD using local date parts", () => {
    expect(getDayKey(new Date(2024, 5, 3, 23, 59).getTime())).toBe("2024-06-03");
  });
});

describe("computeStreak", () => {
  it("returns zero for no plays at all", () => {
    expect(computeStreak({}, [], NOW)).toEqual({ current: 0, longest: 0 });
  });

  it("counts consecutive days ending today as the current streak", () => {
    const playsByDay = {
      [dayKey(0)]: 3,
      [dayKey(1)]: 1,
      [dayKey(2)]: 5,
    };
    expect(computeStreak(playsByDay, [], NOW)).toEqual({ current: 3, longest: 3 });
  });

  it("still counts a streak that ended yesterday (grace day) as current", () => {
    const playsByDay = {
      [dayKey(1)]: 2,
      [dayKey(2)]: 2,
    };
    expect(computeStreak(playsByDay, [], NOW).current).toBe(2);
  });

  it("resets current streak to 0 once the gap is more than one day old", () => {
    const playsByDay = {
      [dayKey(3)]: 4,
      [dayKey(4)]: 4,
    };
    expect(computeStreak(playsByDay, [], NOW).current).toBe(0);
  });

  it("ignores days with a zero play count", () => {
    expect(computeStreak({ [dayKey(0)]: 0 }, [], NOW)).toEqual({ current: 0, longest: 0 });
  });

  it("still grants a grace-day streak when today has zero plays but yesterday doesn't", () => {
    const playsByDay = {
      [dayKey(0)]: 0,
      [dayKey(1)]: 2,
    };
    expect(computeStreak(playsByDay, [], NOW).current).toBe(1);
  });

  it("keeps longest as the best historical run, even after the streak breaks", () => {
    const playsByDay = {
      [dayKey(0)]: 1,
      [dayKey(10)]: 1,
      [dayKey(11)]: 1,
      [dayKey(12)]: 1,
      [dayKey(13)]: 1,
    };
    const result = computeStreak(playsByDay, [], NOW);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(4);
  });

  it("treats a frozen day as active, bridging the streak across it", () => {
    const withoutFreeze = computeStreak(
      { [dayKey(0)]: 1, [dayKey(2)]: 1 },
      [],
      NOW
    );
    expect(withoutFreeze.current).toBe(1);

    const withFreeze = computeStreak(
      { [dayKey(0)]: 1, [dayKey(2)]: 1 },
      [dayKey(1)],
      NOW
    );
    expect(withFreeze.current).toBe(3);
  });
});
