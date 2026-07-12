import { describe, expect, it } from "vitest";
import {
  getInitials,
  hashString32,
  hashStringToHex,
  hashStringToHue,
  normalizePublicText,
  slugifyArtistName,
} from "@/lib/publicLinks";

describe("normalizePublicText", () => {
  it("strips accents and punctuation, lowercases, collapses whitespace", () => {
    expect(normalizePublicText("Été   Câlin! -- 2024")).toBe("ete calin 2024");
  });

  it("returns an empty string for input with no alphanumeric characters", () => {
    expect(normalizePublicText("!!! --- ***")).toBe("");
  });
});

describe("slugifyArtistName", () => {
  it("slugifies with hyphens", () => {
    expect(slugifyArtistName("Daft Punk")).toBe("daft-punk");
  });

  it("falls back to 'artiste' when nothing alphanumeric remains", () => {
    expect(slugifyArtistName("???")).toBe("artiste");
  });
});

describe("getInitials", () => {
  it("takes the first letter of up to two words", () => {
    expect(getInitials("Jean Dupont")).toBe("JD");
    expect(getInitials("Cher")).toBe("C");
    expect(getInitials("Un Deux Trois")).toBe("UD");
  });

  it("returns the fallback for blank input", () => {
    expect(getInitials("   ")).toBe("MP");
    expect(getInitials("", "XX")).toBe("XX");
  });
});

describe("hashStringToHue", () => {
  it("is deterministic and within [0, 360)", () => {
    const a = hashStringToHue("user-123");
    const b = hashStringToHue("user-123");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
  });

  it("differs for different inputs (no trivial collision)", () => {
    expect(hashStringToHue("alice")).not.toBe(hashStringToHue("bob"));
  });
});

describe("hashString32 / hashStringToHex", () => {
  it("is deterministic and always a non-negative 32-bit int", () => {
    const h1 = hashString32("track/path/to/song.mp3");
    const h2 = hashString32("track/path/to/song.mp3");
    expect(h1).toBe(h2);
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThanOrEqual(0xffffffff);
  });

  it("produces an 8-char lowercase hex string", () => {
    const hex = hashStringToHex("some-key");
    expect(hex).toMatch(/^[0-9a-f]{8}$/);
    expect(hex).toBe(hashString32("some-key").toString(16).padStart(8, "0"));
  });
});
