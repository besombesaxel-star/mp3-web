import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then blocks", () => {
    const key = "test:basic";
    expect(checkRateLimit(key, 3, 1000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 1000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 1000).allowed).toBe(true);

    const blocked = checkRateLimit(key, 3, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    expect(checkRateLimit("test:a", 1, 1000).allowed).toBe(true);
    expect(checkRateLimit("test:a", 1, 1000).allowed).toBe(false);
    expect(checkRateLimit("test:b", 1, 1000).allowed).toBe(true);
  });

  it("resets the window once it elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const key = "test:window";
    expect(checkRateLimit(key, 1, 1000).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 1000).allowed).toBe(false);

    vi.setSystemTime(1001);
    expect(checkRateLimit(key, 1, 1000).allowed).toBe(true);
  });
});
