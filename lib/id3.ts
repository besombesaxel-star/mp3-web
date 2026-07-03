export type Id3Tags = {
  title?: string;
  artist?: string;
};

function readSyncSafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const encodingByte = bytes[0];
  const body = bytes.subarray(1);

  try {
    if (encodingByte === 1 || encodingByte === 2) {
      return new TextDecoder(encodingByte === 2 ? "utf-16be" : "utf-16")
        .decode(body)
        .replace(/\0+$/, "")
        .trim();
    }
    return new TextDecoder(encodingByte === 3 ? "utf-8" : "iso-8859-1")
      .decode(body)
      .replace(/\0+$/, "")
      .trim();
  } catch {
    return "";
  }
}

/**
 * Minimal ID3v2 (2.2/2.3/2.4) reader: extracts the title (TIT2/TT2) and
 * artist (TPE1/TP1) text frames from an MP3 file, without decoding audio.
 * Reads only the ID3 header region of the file, not the whole file.
 */
export async function readId3Tags(file: File): Promise<Id3Tags> {
  try {
    const headerBuf = await file.slice(0, 10).arrayBuffer();
    const header = new Uint8Array(headerBuf);

    if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) {
      return {};
    }

    const majorVersion = header[3];
    const tagSize = readSyncSafeInt(header, 6);
    if (tagSize <= 0 || tagSize > 5 * 1024 * 1024) return {};

    const bodyBuf = await file.slice(10, 10 + tagSize).arrayBuffer();
    const body = new Uint8Array(bodyBuf);

    const tags: Id3Tags = {};
    const frameHeaderSize = majorVersion === 2 ? 6 : 10;
    const titleId = majorVersion === 2 ? "TT2" : "TIT2";
    const artistId = majorVersion === 2 ? "TP1" : "TPE1";

    let offset = 0;
    while (offset + frameHeaderSize <= body.length) {
      let frameId: string;
      let frameSize: number;

      if (majorVersion === 2) {
        frameId = String.fromCharCode(body[offset], body[offset + 1], body[offset + 2]);
        frameSize = (body[offset + 3] << 16) | (body[offset + 4] << 8) | body[offset + 5];
      } else {
        frameId = String.fromCharCode(body[offset], body[offset + 1], body[offset + 2], body[offset + 3]);
        frameSize =
          majorVersion === 4
            ? readSyncSafeInt(body, offset + 4)
            : (body[offset + 4] << 24) | (body[offset + 5] << 16) | (body[offset + 6] << 8) | body[offset + 7];
      }

      if (frameSize <= 0 || !/^[A-Z0-9]+$/.test(frameId)) break;

      const frameStart = offset + frameHeaderSize;
      const frameEnd = frameStart + frameSize;
      if (frameEnd > body.length) break;

      const frameBody = body.subarray(frameStart, frameEnd);

      if (frameId === titleId && !tags.title) {
        const text = decodeText(frameBody);
        if (text) tags.title = text;
      } else if (frameId === artistId && !tags.artist) {
        const text = decodeText(frameBody);
        if (text) tags.artist = text;
      }

      if (tags.title && tags.artist) break;
      offset = frameEnd;
    }

    return tags;
  } catch {
    return {};
  }
}
