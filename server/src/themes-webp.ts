/**
 * themes-webp.ts — WebP header parsing, extracted from themes.ts (one
 * concern per file). Pure buffer parsing — no fs, no game logic, never
 * throws. Unit-tested directly with synthetic headers.
 */

/**
 * Read WebP dimensions from the file header (no image dependency).
 * Handles VP8 (lossy), VP8L (lossless) and VP8X (extended) containers.
 * Returns null when the file isn't a parseable WebP.
 */
export function probeWebp(buf: Buffer): { w: number; h: number } | null {
  try {
    if (buf.length < 30) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    let off = 12;
    while (off + 8 <= buf.length) {
      const fourcc = buf.toString('ascii', off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      const data = off + 8;
      if (fourcc === 'VP8X' && data + 10 <= buf.length) {
        const w = buf.readUIntLE(data + 4, 3) + 1;
        const h = buf.readUIntLE(data + 7, 3) + 1;
        return { w, h };
      }
      if (fourcc === 'VP8 ' && data + 10 <= buf.length) {
        if (buf[data + 3] !== 0x9d || buf[data + 4] !== 0x01 || buf[data + 5] !== 0x2a) return null;
        return { w: buf.readUInt16LE(data + 6) & 0x3fff, h: buf.readUInt16LE(data + 8) & 0x3fff };
      }
      if (fourcc === 'VP8L' && data + 5 <= buf.length) {
        if ((buf[data] ?? 0) !== 0x2f) return null;
        const b1 = buf[data + 1] ?? 0,
          b2 = buf[data + 2] ?? 0,
          b3 = buf[data + 3] ?? 0,
          b4 = buf[data + 4] ?? 0;
        const w = (b1 | ((b2 & 0x3f) << 8)) + 1;
        const h = (((b2 >> 6) & 0x03) | (b3 << 2) | ((b4 & 0x0f) << 10)) + 1;
        return { w, h };
      }
      off = data + size + (size % 2);
      if (size <= 0 || off <= data) break;
    }
    return null;
  } catch {
    return null;
  }
}

/** Sniff a renamed upload: PNG/JPEG masquerading as .webp still renders in
 *  browsers but wastes bandwidth (discworld-center was a 12MB PNG). Pure. */
export function sniffKind(buf: Buffer): 'webp' | 'png' | 'jpeg' | null {
  try {
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
      return 'webp';
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
    return null;
  } catch {
    return null;
  }
}
