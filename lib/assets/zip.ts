type ZipEntry = {
  name: string;
  bytes: Uint8Array;
};

function makeCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value =
        (value & 1) !== 0
          ? 0xedb88320 ^ (value >>> 1)
          : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc =
      CRC32_TABLE[(crc ^ byte) & 0xff] ^
      (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts: Uint8Array[]) {
  const size = parts.reduce(
    (total, part) => total + part.byteLength,
    0,
  );
  const output = new Uint8Array(size);

  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function safeZipName(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

export function createStoredZip(entries: ZipEntry[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];

  let offset = 0;

  for (const sourceEntry of entries) {
    const name = safeZipName(sourceEntry.name);
    if (!name) continue;

    const nameBytes = encoder.encode(name);
    const bytes = sourceEntry.bytes;
    const crc = crc32(bytes);

    const localHeader = concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(crc),
      uint32(bytes.byteLength),
      uint32(bytes.byteLength),
      uint16(nameBytes.byteLength),
      uint16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, bytes);

    const centralHeader = concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(crc),
      uint32(bytes.byteLength),
      uint32(bytes.byteLength),
      uint16(nameBytes.byteLength),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBytes,
    ]);

    centralParts.push(centralHeader);

    offset +=
      localHeader.byteLength + bytes.byteLength;
  }

  const centralDirectory = concat(centralParts);
  const localData = concat(localParts);
  const entryCount = centralParts.length;

  const end = concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entryCount),
    uint16(entryCount),
    uint32(centralDirectory.byteLength),
    uint32(localData.byteLength),
    uint16(0),
  ]);

  return concat([localData, centralDirectory, end]);
}
