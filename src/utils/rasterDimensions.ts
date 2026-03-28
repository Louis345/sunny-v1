import fs from "fs";

/**
 * Read width/height from PNG or JPEG file headers (no sharp/deps).
 * Returns null if unknown format or read fails.
 */
export function readRasterDimensionsFromFile(
  filePath: string,
): { width: number; height: number } | null {
  try {
    const buf = fs.readFileSync(filePath);
    return readRasterDimensionsFromBuffer(buf);
  } catch {
    return null;
  }
}

export function readRasterDimensionsFromBuffer(
  buf: Buffer,
): { width: number; height: number } | null {
  if (buf.length >= 24) {
    // PNG: IHDR at offset 16
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width > 0 && height > 0 && width < 65536 && height < 65536) {
        return { width, height };
      }
    }
  }
  // JPEG: scan for SOF0 / SOF2 (baseline / progressive)
  let i = 0;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    if (i + 4 >= buf.length) break;
    const segLen = buf.readUInt16BE(i + 2);
    if (segLen < 2 || i + 2 + segLen > buf.length) break;
    if (
      (marker === 0xc0 || marker === 0xc2) &&
      segLen >= 9
    ) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      if (width > 0 && height > 0) return { width, height };
    }
    i += 2 + segLen;
  }
  return null;
}
