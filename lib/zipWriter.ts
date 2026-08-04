import { crc32 } from "zlib";

/**
 * Minimal ZIP writer, STORE method only (no DEFLATE). Audio/cover files are
 * already compressed formats, so re-compressing them would burn CPU for
 * ~0 size benefit - not worth pulling in a general-purpose zip dependency
 * for that. Streams entries as they're written so the HTTP response can
 * start flushing before the whole archive is assembled.
 */

type CentralRecord = {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
  dosTime: number;
  dosDate: number;
};

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosYear = Math.max(0, date.getFullYear() - 1980);
  const dateVal = ((dosYear & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, date: dateVal };
}

export class ZipWriter {
  private controller: ReadableStreamDefaultController<Uint8Array>;
  private offset = 0;
  private records: CentralRecord[] = [];

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  private push(buf: Buffer) {
    this.controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    this.offset += buf.length;
  }

  addFile(name: string, data: Buffer, date: Date = new Date()) {
    const nameBuf = Buffer.from(name.replace(/\\/g, "/"), "utf8");
    const crc = crc32(data) >>> 0;
    const { time, date: dosDate } = dosDateTime(date);
    const localOffset = this.offset;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(0, 8); // method: STORE
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); // compressed size
    header.writeUInt32LE(data.length, 22); // uncompressed size
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28); // extra field length

    this.push(header);
    this.push(nameBuf);
    this.push(data);

    this.records.push({ name: nameBuf, crc, size: data.length, offset: localOffset, dosTime: time, dosDate });
  }

  finish() {
    const centralStart = this.offset;

    for (const rec of this.records) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4); // version made by
      header.writeUInt16LE(20, 6); // version needed
      header.writeUInt16LE(0, 8); // flags
      header.writeUInt16LE(0, 10); // method: STORE
      header.writeUInt16LE(rec.dosTime, 12);
      header.writeUInt16LE(rec.dosDate, 14);
      header.writeUInt32LE(rec.crc, 16);
      header.writeUInt32LE(rec.size, 20); // compressed size
      header.writeUInt32LE(rec.size, 24); // uncompressed size
      header.writeUInt16LE(rec.name.length, 28);
      header.writeUInt16LE(0, 30); // extra field length
      header.writeUInt16LE(0, 32); // comment length
      header.writeUInt16LE(0, 34); // disk number start
      header.writeUInt16LE(0, 36); // internal attributes
      header.writeUInt32LE(0, 38); // external attributes
      header.writeUInt32LE(rec.offset, 42);

      this.push(header);
      this.push(rec.name);
    }

    const centralSize = this.offset - centralStart;

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4); // disk number
    end.writeUInt16LE(0, 6); // disk with central dir
    end.writeUInt16LE(this.records.length, 8);
    end.writeUInt16LE(this.records.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralStart, 16);
    end.writeUInt16LE(0, 20); // comment length

    this.push(end);
  }
}
