export type Id3Picture = {
  mimeType: string;
  data: Uint8Array;
};

export type Id3Tags = {
  title?: string;
  artist?: string;
  picture?: Id3Picture;
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

function findNullTerminator(bytes: Uint8Array, start: number): number {
  for (let i = start; i < bytes.length; i++) {
    if (bytes[i] === 0x00) return i;
  }
  return bytes.length;
}

function parsePictureFrame(frameBody: Uint8Array, isV2: boolean): Id3Picture | null {
  if (frameBody.length < 4) return null;
  const encodingByte = frameBody[0];
  let offset = 1;
  let mimeType: string;

  if (isV2) {
    // ID3v2.2 "PIC" frame: 3-char format code instead of a MIME string.
    if (frameBody.length < 5) return null;
    const fmt = String.fromCharCode(frameBody[1], frameBody[2], frameBody[3]).toUpperCase();
    mimeType = fmt === "PNG" ? "image/png" : "image/jpeg";
    offset = 4;
  } else {
    const mimeEnd = findNullTerminator(frameBody, offset);
    const decoded = new TextDecoder("iso-8859-1").decode(frameBody.subarray(offset, mimeEnd)).trim();
    mimeType = decoded || "image/jpeg";
    offset = mimeEnd + 1;
  }

  // picture type byte
  offset += 1;
  if (offset >= frameBody.length) return null;

  // description string, null-terminated per the encoding byte
  if (encodingByte === 1 || encodingByte === 2) {
    let descEnd = offset;
    while (descEnd + 1 < frameBody.length && !(frameBody[descEnd] === 0 && frameBody[descEnd + 1] === 0)) {
      descEnd += 2;
    }
    offset = descEnd + 2;
  } else {
    offset = findNullTerminator(frameBody, offset) + 1;
  }

  if (offset >= frameBody.length) return null;
  const data = frameBody.subarray(offset);
  if (data.length === 0) return null;

  return { mimeType, data };
}

/**
 * Minimal ID3v2 (2.2/2.3/2.4) reader: extracts the title (TIT2/TT2), artist
 * (TPE1/TP1) and embedded cover (APIC/PIC) from an MP3 file, without
 * decoding audio. Reads only the ID3 header region of the file.
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
    const pictureId = majorVersion === 2 ? "PIC" : "APIC";

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
      } else if (frameId === pictureId && !tags.picture) {
        const picture = parsePictureFrame(frameBody, majorVersion === 2);
        if (picture) tags.picture = picture;
      }

      if (tags.title && tags.artist && tags.picture) break;
      offset = frameEnd;
    }

    return tags;
  } catch {
    return {};
  }
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

export function pictureToFile(picture: Id3Picture, baseName: string): File {
  const ext = extensionForMimeType(picture.mimeType);
  return new File([picture.data as BlobPart], `${baseName}-cover.${ext}`, { type: picture.mimeType });
}
