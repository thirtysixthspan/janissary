// Raster and vector fixtures for a run that has to open real image files, with no dependency and
// nothing downloaded: the repository ships exactly one image (`fixtures/sample.png`, 480×300) and a
// spec that promises orientation-dependent fitting, crop, rotate, and flip needs files that differ in
// shape and in content.
//
// Every raster here is a PNG written by hand — signature, IHDR, a zlib-deflated IDAT of filter-0
// scanlines, IEND — because a file a browser will decode is all an image tab needs and a spec that
// promises "every save is a PNG" is checked by decoding bytes, not by trusting an extension. Pixels
// are four solid quadrants in fixed colours, so a rotation, a flip, and a crop are told apart by which
// colour lands in which corner: the same thing `canvasSignature` reads back off a live canvas.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Int32Array.from({ length: 256 }, (_, seed) => {
  let value = seed;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
  return value;
});

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Top-left red, top-right green, bottom-left blue, bottom-right yellow.
export const QUADRANTS = [[220, 40, 40], [40, 200, 60], [50, 90, 230], [240, 230, 60]];

export function quadrantAt(x, y, width, height) {
  return QUADRANTS[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)];
}

export function png(width, height, pixel = quadrantAt) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = pixel(x, y, width, height);
      const at = y * stride + 1 + x * 3;
      raw[at] = red;
      raw[at + 1] = green;
      raw[at + 2] = blue;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const VECTOR = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150">'
  + '<rect width="150" height="150" fill="#2b6cb0"/><rect x="150" width="150" height="150" fill="#d69e2e"/>'
  + '<text x="10" y="140" font-family="sans-serif" font-size="20" fill="white">vector</text></svg>\n';

// What a run gets: a landscape, a portrait and a square raster to fit against, a tiny one for
// anything measured in device pixels, and an SVG for the formats a save is said to flatten. The
// directory is created if it is not there, so a caller can point this at a fresh scratch root.
export const FIXTURES = {
  'landscape.png': () => png(480, 240),
  'portrait.png': () => png(240, 480),
  'square.png': () => png(200, 200),
  'tiny.png': () => png(8, 8, () => [10, 10, 10]),
  'vector.svg': () => VECTOR,
};

export function writeFixtures(directory) {
  mkdirSync(directory, { recursive: true });
  for (const [name, build] of Object.entries(FIXTURES)) {
    writeFileSync(path.join(directory, name), build());
  }
  return Object.keys(FIXTURES);
}
