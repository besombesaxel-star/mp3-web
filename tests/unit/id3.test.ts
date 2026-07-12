import { describe, expect, it } from "vitest";
import { readId3Tags } from "@/lib/id3";

function frameV3(id: string, body: number[]): number[] {
  const size = body.length;
  return [
    id.charCodeAt(0), id.charCodeAt(1), id.charCodeAt(2), id.charCodeAt(3),
    (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff,
    0x00, 0x00, // flags
    ...body,
  ];
}

function textFrameBody(text: string): number[] {
  return [0x00, ...Array.from(text, (c) => c.charCodeAt(0))]; // encoding 0 = ISO-8859-1
}

function buildId3v23File(frames: number[][], fileName = "test.mp3"): File {
  const tagBody = frames.flat();
  const tagSize = tagBody.length;
  const header = [
    0x49, 0x44, 0x33, // "ID3"
    0x03, 0x00, // version 2.3.0
    0x00, // flags
    (tagSize >>> 21) & 0x7f, (tagSize >>> 14) & 0x7f, (tagSize >>> 7) & 0x7f, tagSize & 0x7f,
  ];
  const bytes = new Uint8Array([...header, ...tagBody]);
  return new File([bytes], fileName, { type: "audio/mpeg" });
}

describe("readId3Tags", () => {
  it("extracts title and artist from TIT2/TPE1 frames", async () => {
    const file = buildId3v23File([
      frameV3("TIT2", textFrameBody("Test Title")),
      frameV3("TPE1", textFrameBody("Test Artist")),
    ]);

    const tags = await readId3Tags(file);
    expect(tags.title).toBe("Test Title");
    expect(tags.artist).toBe("Test Artist");
    expect(tags.picture).toBeUndefined();
  });

  it("extracts an embedded APIC picture", async () => {
    const pictureBytes = [0xff, 0xd8, 0xff, 0xd9]; // fake jpeg bytes
    const apicBody = [
      0x00, // encoding
      ...Array.from("image/jpeg", (c) => c.charCodeAt(0)), 0x00, // mime type, null-terminated
      0x03, // picture type (front cover)
      0x00, // empty description, null-terminated
      ...pictureBytes,
    ];
    const file = buildId3v23File([frameV3("APIC", apicBody)]);

    const tags = await readId3Tags(file);
    expect(tags.picture?.mimeType).toBe("image/jpeg");
    expect(Array.from(tags.picture?.data ?? [])).toEqual(pictureBytes);
  });

  it("returns an empty object for a file with no ID3 header", async () => {
    const file = new File([new Uint8Array([0, 1, 2, 3])], "no-tags.mp3", { type: "audio/mpeg" });
    expect(await readId3Tags(file)).toEqual({});
  });
});
