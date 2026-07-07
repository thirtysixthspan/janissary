// Build-time processing for the agent sprites: crop the transparent padding away and upscale
// by an integer factor (nearest neighbour, so the pixel art stays sharp). The sources are
// small 8-bit RGBA non-interlaced PNGs; anything else falls back to an untouched copy.
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BYTES_PER_PIXEL = 4;
const ALPHA_THRESHOLD = 8;

function crc32(data: Buffer): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of data) {
    let current = (crc ^ byte) & 0xff;
    for (let bit = 0; bit < 8; bit++) current = current & 1 ? 0xed_b8_83_20 ^ (current >>> 1) : current >>> 1;
    crc = (crc >>> 8) ^ current;
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Undo PNG scanline filtering, returning raw RGBA rows.
function unfilter(data: Buffer, width: number, height: number): Buffer {
  const stride = width * BYTES_PER_PIXEL;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)];
    const row = data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= BYTES_PER_PIXEL ? out[y * stride + x - BYTES_PER_PIXEL] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= BYTES_PER_PIXEL ? out[(y - 1) * stride + x - BYTES_PER_PIXEL] : 0;
      let value = row[x];
      switch (filter) {
      case 1: {
      value += left;
      break;
      }
      case 2: {
      value += up;
      break;
      }
      case 3: {
      value += Math.floor((left + up) / 2);
      break;
      }
      case 4: { {
      value += paeth(left, up, upLeft);
      // No default
      }
      break;
      }
      }
      out[y * stride + x] = value & 0xff;
    }
  }
  return out;
}

function decode(png: Buffer): { width: number; height: number; pixels: Buffer } | null {
  if (!png.subarray(0, 8).equals(SIGNATURE)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) return null;
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += length + 12;
  }
  if (width === 0 || idat.length === 0) return null;
  return { width, height, pixels: unfilter(inflateSync(Buffer.concat(idat)), width, height) };
}

function encode(width: number, height: number, pixels: Buffer): Buffer {
  const stride = width * BYTES_PER_PIXEL;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type: RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function trimAndScaleSprite(png: Buffer, scale: number): Buffer {
  const image = decode(png);
  if (!image) return png;
  const { width, height, pixels } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * BYTES_PER_PIXEL + 3] < ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return png;
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const out = Buffer.alloc(cropWidth * scale * cropHeight * scale * BYTES_PER_PIXEL);
  for (let y = 0; y < cropHeight * scale; y++) {
    for (let x = 0; x < cropWidth * scale; x++) {
      const sourceOffset = ((minY + Math.floor(y / scale)) * width + minX + Math.floor(x / scale)) * BYTES_PER_PIXEL;
      pixels.copy(out, (y * cropWidth * scale + x) * BYTES_PER_PIXEL, sourceOffset, sourceOffset + BYTES_PER_PIXEL);
    }
  }
  return encode(cropWidth * scale, cropHeight * scale, out);
}
