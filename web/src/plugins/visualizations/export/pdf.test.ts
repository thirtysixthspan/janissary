import { describe, expect, it } from 'vitest';
import { pdfDocument } from './pdf';

function raster(width = 4, height = 2) {
  return {
    width,
    height,
    rgb: new Uint8Array(width * height * 3).fill(120),
  };
}

// The bytes as text, so an assertion can talk about what a reader will look for.
function textOf(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

// Every cross-reference entry names an offset, and that offset has to point at the object it claims.
// This walks the table and checks each one, because an offset that is off by a few bytes produces a
// file that opens in some readers and not others — which is the hardest kind of export bug to see.
function offsetsAtTheirObjects(bytes: Uint8Array): { declared: number[]; actual: number[] } {
  const text = textOf(bytes);
  const table = text.slice(text.indexOf('xref\n'), text.indexOf('trailer'));
  const declared = [...table.matchAll(/^(\d{10}) 00000 n $/gmu)].map((match) => Number(match[1]));
  const actual: number[] = [];
  let cursor = text.indexOf('xref\n');
  for (const offset of declared) {
    const line = text.slice(offset, text.indexOf('\n', offset));
    actual.push(Number(/^(\d+) 0 obj$/u.exec(line)?.[1]));
    cursor = offset;
  }
  expect(cursor).toBeGreaterThan(0);
  return { declared, actual };
}

describe('pdfDocument', () => {
  it('opens with a PDF header and closes with an end-of-file marker', () => {
    const text = textOf(pdfDocument(raster()));
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('declares every object, and every cross-reference offset points at the object it names', () => {
    const bytes = pdfDocument(raster());
    const { declared, actual } = offsetsAtTheirObjects(bytes);
    expect(declared).toHaveLength(5);
    expect(actual).toEqual([1, 2, 3, 4, 5]);
  });

  it('points startxref at the cross-reference table', () => {
    const bytes = pdfDocument(raster());
    const text = textOf(bytes);
    const start = Number(/startxref\n(\d+)/u.exec(text)?.[1]);
    expect(text.slice(start, start + 4)).toBe('xref');
  });

  it('sizes the page in points from the pixel dimensions', () => {
    const text = textOf(pdfDocument(raster(96, 48)));
    expect(text).toContain('/MediaBox [0 0 72 36]');
  });

  it('writes the image as uncompressed RGB when nothing compressed it', () => {
    const text = textOf(pdfDocument(raster()));
    expect(text).toContain('/ColorSpace /DeviceRGB');
    expect(text).toContain('/BitsPerComponent 8');
    expect(text).not.toContain('/Filter /FlateDecode');
    expect(text).toContain(`/Length ${4 * 2 * 3}`);
  });

  it('declares the filter and the compressed length when a compressed body is supplied', () => {
    const bytes = pdfDocument(raster(), new Uint8Array([1, 2, 3]));
    const text = textOf(bytes);
    expect(text).toContain('/Filter /FlateDecode');
    expect(text).toContain('/Length 3');
    // The compressed bytes are the ones written, not the originals: a filter declared over the wrong
    // body is a file no reader can decode.
    expect(bytes).toContain(1);
  });

  it('keeps every offset correct after a body changes size, which is what a hand-counted offset gets wrong', () => {
    const small = offsetsAtTheirObjects(pdfDocument(raster(4, 2))).actual;
    const large = offsetsAtTheirObjects(pdfDocument(raster(40, 20))).actual;
    expect(small).toEqual(large);
  });
});
