import { describe, expect, it } from "vitest";
import {
  getAudioContentType,
  getAudioExtension,
  isAcceptedAudioFileName,
  safeBaseName,
  stripAudioExtension,
} from "@/lib/libraryFiles";

describe("safeBaseName", () => {
  it("strips extension, accents and punctuation, and slugifies with hyphens", () => {
    expect(safeBaseName("Été Câlin (Live).mp3")).toBe("ete-calin-live");
  });

  it("falls back to 'track' when nothing usable remains", () => {
    expect(safeBaseName("???.mp3")).toBe("track");
  });
});

describe("isAcceptedAudioFileName", () => {
  it("accepts known audio extensions case-insensitively", () => {
    expect(isAcceptedAudioFileName("song.MP3")).toBe(true);
    expect(isAcceptedAudioFileName("song.flac")).toBe(true);
    expect(isAcceptedAudioFileName("song.wav")).toBe(true);
  });

  it("rejects other extensions", () => {
    expect(isAcceptedAudioFileName("song.ogg")).toBe(false);
    expect(isAcceptedAudioFileName("")).toBe(false);
  });
});

describe("getAudioExtension", () => {
  it("prefers the file name extension over the MIME type", () => {
    expect(getAudioExtension("song.flac", "audio/mpeg")).toBe(".flac");
  });

  it("falls back to the MIME type when the name has no known extension", () => {
    expect(getAudioExtension("song", "audio/wav")).toBe(".wav");
    expect(getAudioExtension("song", "audio/flac")).toBe(".flac");
  });

  it("defaults to .mp3 when nothing matches", () => {
    expect(getAudioExtension("song", "")).toBe(".mp3");
  });
});

describe("stripAudioExtension", () => {
  it("removes a trailing known audio extension", () => {
    expect(stripAudioExtension("song.WAV")).toBe("song");
    expect(stripAudioExtension("song.mp3")).toBe("song");
  });

  it("leaves unrelated names untouched", () => {
    expect(stripAudioExtension("song.txt")).toBe("song.txt");
  });
});

describe("getAudioContentType", () => {
  it("maps extensions to MIME types, defaulting to mpeg", () => {
    expect(getAudioContentType(".flac")).toBe("audio/flac");
    expect(getAudioContentType(".wav")).toBe("audio/wav");
    expect(getAudioContentType(".mp3")).toBe("audio/mpeg");
    expect(getAudioContentType(".ogg")).toBe("audio/mpeg");
  });
});
