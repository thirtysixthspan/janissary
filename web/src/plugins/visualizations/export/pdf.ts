// A minimal PDF writer: one page carrying one raster image, which is all an exported chart needs.
//
// It is a pure function over pixel samples, with no browser API anywhere in it, so its correctness is
// testable by reading the bytes it produces. The property that decides whether a reader opens the file
// is that every cross-reference offset points at the object it names, and that is asserted directly
// rather than inferred from a file happening to open.

export type Raster = { width: number; height: number; rgb: Uint8Array };

const encoder = new TextEncoder();

// Byte offsets into a PDF file are byte offsets, never character offsets, so every length here is
// measured in encoded bytes rather than in the string that produced it.
function chunk(text: string): Uint8Array {
  return encoder.encode(text);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function object(number: number, parts: readonly Uint8Array[]): Uint8Array {
  return concat([chunk(`${number} 0 obj\n`), ...parts, chunk('\nendobj\n')]);
}

function dictionary(entries: readonly (readonly [string, string | number])[]): string {
  return `<< ${entries.map(([key, value]) => `${key} ${value}`).join(' ')} >>`;
}

function stream(content: string): Uint8Array {
  const body = chunk(content);
  return concat([
    chunk(`${dictionary([['/Length', body.length]])}\nstream\n`),
    body,
    chunk('endstream'),
  ]);
}

function imageObject(raster: Raster, compressed?: Uint8Array): Uint8Array {
  // The filter is present exactly when a compressed body was supplied. A writer that claimed a filter
  // it did not apply would produce a file no reader can decode, so the two are decided in one place.
  // The compression itself happens in the caller, which is the only side with a platform to do it on.
  const body = compressed ?? raster.rgb;
  const header = [
    '<< /Type /XObject /Subtype /Image',
    `/Width ${raster.width} /Height ${raster.height}`,
    '/ColorSpace /DeviceRGB /BitsPerComponent 8',
    ...(compressed ? ['/Filter /FlateDecode'] : []),
    `/Length ${body.length} >>`,
  ].join('\n');
  return object(4, [chunk(`${header}\nstream\n`), body, chunk('\n')]);
}

function crossReference(offsets: readonly number[]): Uint8Array {
  const lines = ['xref\n', '0 1\n', '0000000000 65535 f \n', `${offsets.length} 1\n`];
  for (const offset of offsets) lines.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  return chunk(lines.join(''));
}

// A PDF's default user unit is 1/72 inch, so a 96-pixel-per-inch raster becomes a page in points. That
// is what makes an exported chart print at the size it was drawn rather than at some arbitrary scale.
export function pdfDocument(raster: Raster, compressed?: Uint8Array): Uint8Array {
  const wide = Math.round((raster.width / 96) * 72);
  const high = Math.round((raster.height / 96) * 72);
  const objects = [
    object(1, [chunk(dictionary([['/Type', '/Catalog'], ['/Pages', '2 0 R']]))]),
    object(2, [chunk(dictionary([['/Type', '/Pages'], ['/Kids', '[3 0 R]'], ['/Count', 1]]))]),
    object(3, [chunk(dictionary([
      ['/Type', '/Page'],
      ['/Parent', '2 0 R'],
      ['/MediaBox', `[0 0 ${wide} ${high}]`],
      ['/Resources', dictionary([['/XObject', '<< /Im0 4 0 R >>']])],
      ['/Contents', '5 0 R'],
    ]))]),
    imageObject(raster, compressed),
    object(5, [stream(`q\n${wide} 0 0 ${high} 0 0 cm\n/Im0 Do\nQ\n`)]),
  ];

  // Offsets are computed over the bytes actually written, in order, which is the only way they can be
  // right: a hand-counted offset is wrong the moment any object grows.
  const header = chunk('%PDF-1.4\n%\u{E2}\u{E3}\u{CF}\u{D3}\n');
  const parts: Uint8Array[] = [header];
  const offsets: number[] = [];
  let position = header.length;
  for (const body of objects) {
    offsets.push(position);
    parts.push(body);
    position += body.length;
  }
  const trailer = chunk(`trailer\n${dictionary([
    ['/Size', objects.length + 1],
    ['/Root', '1 0 R'],
  ])}\nstartxref\n${position}\n%%EOF\n`);
  return concat([...parts, crossReference(offsets), trailer]);
}
