export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
};

const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const decodeUtf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

const dosTimeDate = (date: Date): { time: number; date: number } => {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { time: dosTime & 0xffff, date: dosDate & 0xffff };
};

const makeU16 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, value & 0xffff, true);
  return bytes;
};

const makeU32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value >>> 0, true);
  return bytes;
};

export const createZip = (entries: ZipEntry[]): Uint8Array => {
  const now = dosTimeDate(new Date());
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const filename = encodeUtf8(entry.name);
    const fileData = entry.data;
    const fileCrc = crc32(fileData);

    const localHeader = concatBytes([
      makeU32(0x04034b50),
      makeU16(20),
      makeU16(0),
      makeU16(0),
      makeU16(now.time),
      makeU16(now.date),
      makeU32(fileCrc),
      makeU32(fileData.length),
      makeU32(fileData.length),
      makeU16(filename.length),
      makeU16(0),
      filename,
    ]);
    localParts.push(localHeader, fileData);

    const centralHeader = concatBytes([
      makeU32(0x02014b50),
      makeU16(20),
      makeU16(20),
      makeU16(0),
      makeU16(0),
      makeU16(now.time),
      makeU16(now.date),
      makeU32(fileCrc),
      makeU32(fileData.length),
      makeU32(fileData.length),
      makeU16(filename.length),
      makeU16(0),
      makeU16(0),
      makeU16(0),
      makeU16(0),
      makeU32(0),
      makeU32(offset),
      filename,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + fileData.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const localData = concatBytes(localParts);
  const eocd = concatBytes([
    makeU32(0x06054b50),
    makeU16(0),
    makeU16(0),
    makeU16(entries.length),
    makeU16(entries.length),
    makeU32(centralDirectory.length),
    makeU32(localData.length),
    makeU16(0),
  ]);

  return concatBytes([localData, centralDirectory, eocd]);
};

export const extractStoredZipEntries = (zipBytes: Uint8Array): ZipEntry[] => {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const out: ZipEntry[] = [];
  let offset = 0;

  while (offset + 4 <= view.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;

    const compressionMethod = view.getUint16(offset + 8, true);
    if (compressionMethod !== 0) {
      throw new Error('未対応のZIP圧縮形式です（storeのみ対応）');
    }

    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > view.byteLength) throw new Error('ZIPファイルが破損しています');

    const nameBytes = zipBytes.slice(offset + 30, offset + 30 + fileNameLength);
    const fileName = decodeUtf8(nameBytes);
    const fileData = zipBytes.slice(dataStart, dataEnd);
    out.push({ name: fileName, data: fileData });

    offset = dataEnd;
  }

  return out;
};

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += BASE64_CHARS[(n >> 18) & 63];
    out += BASE64_CHARS[(n >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_CHARS[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64_CHARS[n & 63] : '=';
  }
  return out;
};

export const base64ToBytes = (base64: string): Uint8Array => {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n0 = BASE64_CHARS.indexOf(clean[i]);
    const n1 = BASE64_CHARS.indexOf(clean[i + 1]);
    const n2 = clean[i + 2] === '=' ? -1 : BASE64_CHARS.indexOf(clean[i + 2]);
    const n3 = clean[i + 3] === '=' ? -1 : BASE64_CHARS.indexOf(clean[i + 3]);
    const val = (n0 << 18) | (n1 << 12) | ((Math.max(n2, 0) & 63) << 6) | (Math.max(n3, 0) & 63);
    bytes.push((val >> 16) & 0xff);
    if (n2 >= 0) bytes.push((val >> 8) & 0xff);
    if (n3 >= 0) bytes.push(val & 0xff);
  }
  return new Uint8Array(bytes);
};

export const textToBytes = (text: string): Uint8Array => encodeUtf8(text);
export const bytesToText = (bytes: Uint8Array): string => decodeUtf8(bytes);
