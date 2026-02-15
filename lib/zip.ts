export interface ZipFileInput {
  name: string;
  content: string;
}

const textEncoder = new TextEncoder();

const crc32Table = (() => {
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
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = crc32Table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const u16 = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff];
const u32 = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
];

const DOS_TIME = 0;
const DOS_DATE = 0;

export const createZipFromTextFiles = (files: ZipFileInput[]): Uint8Array => {
  const localParts: number[] = [];
  const centralParts: number[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = textEncoder.encode(file.name);
    const contentBytes = textEncoder.encode(file.content);
    const checksum = crc32(contentBytes);
    const size = contentBytes.length;

    const localHeader = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(checksum),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
    ];
    localParts.push(...localHeader, ...Array.from(nameBytes), ...Array.from(contentBytes));

    const centralHeader = [
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(checksum),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
    ];
    centralParts.push(...centralHeader, ...Array.from(nameBytes));

    offset += localHeader.length + nameBytes.length + size;
  });

  const centralOffset = localParts.length;
  const centralSize = centralParts.length;
  const endRecord = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(centralSize),
    ...u32(centralOffset),
    ...u16(0),
  ];

  return Uint8Array.from([...localParts, ...centralParts, ...endRecord]);
};

export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : undefined;
    const b3 = i < bytes.length ? bytes[i++] : undefined;

    output += chars[b1 >> 2];
    output += chars[((b1 & 0x03) << 4) | ((b2 ?? 0) >> 4)];
    output += b2 === undefined ? '=' : chars[((b2 & 0x0f) << 2) | ((b3 ?? 0) >> 6)];
    output += b3 === undefined ? '=' : chars[b3 & 0x3f];
  }
  return output;
};
