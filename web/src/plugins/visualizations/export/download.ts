import { pdfDocument } from './pdf';

// Everything in this module is a browser API, deliberately kept apart from the writer beside it: the
// writer is a pure function over pixel samples and is tested as one, while everything that has to
// happen in a real document — serializing the SVG, drawing it, deflating, and handing the file to the
// browser — is the part that cannot be.

// The theme's custom properties are what the chart is drawn in, and an SVG serialized on its own knows
// nothing about them. Resolving them here against the element's own computed style is what makes an
// exported chart look like the one on screen rather than like a black rectangle.
//
// The list is the stylesheet's, and the stylesheet is held to it: a chart that paints a property not
// named here exports as whatever the browser defaults to for it, which is the failure this pair exists
// to prevent. `visualizations-style.test.ts` asserts the two agree, so a colour added to one and not
// the other fails rather than exporting wrongly.
const CHART_PROPERTIES = [
  '--bg', '--bg-soft', '--fg', '--muted', '--faint', '--border', '--accent', '--running', '--success',
  '--error',
];

// The list is published so a test can hold the stylesheet to it. A getter rather than the constant
// itself, so a caller cannot reach in and change what the export resolves.
export function chartProperties(): readonly string[] {
  return CHART_PROPERTIES;
}

function withResolvedColours(svg: SVGSVGElement): string {
  const style = getComputedStyle(svg);
  const declarations = CHART_PROPERTIES
    .map((name) => `${name}: ${style.getPropertyValue(name).trim()}`)
    .filter((entry) => !entry.endsWith(':'))
    .join('; ');
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('style', declarations);
  return new XMLSerializer().serializeToString(clone);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => { resolve(image); });
    image.addEventListener('error', () => { reject(new Error('the chart could not be rasterized')); });
    image.src = url;
  });
}

function canvasFor(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function pixelsOf(svg: SVGSVGElement, scale: number): Promise<{
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
}> {
  const width = Math.round((svg.viewBox.baseVal.width || svg.width.baseVal.value) * scale);
  const height = Math.round((svg.viewBox.baseVal.height || svg.height.baseVal.value) * scale);
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withResolvedColours(svg))}`;
  const image = await loadImage(source);
  const canvas = canvasFor(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('this browser cannot rasterize a canvas');
  // The chart is transparent by default and most surfaces behind it are not, so the page colour is laid
  // down first. An exported chart with a transparent background is one that looks broken in a viewer.
  context.fillStyle = getComputedStyle(svg).backgroundColor || '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return { context, width, height };
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function fileName(title: string, extension: string): string {
  const stem = title.trim().replaceAll(/[^\w -]+/gu, '').replaceAll(/\s+/gu, '-').toLowerCase();
  return `${stem === '' ? 'visualization' : stem}.${extension}`;
}

export async function exportPng(svg: SVGSVGElement, title: string, scale = 2): Promise<void> {
  const { context } = await pixelsOf(svg, scale);
  const blob = await new Promise<Blob | null>((resolve) => {
    context.canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('this browser could not encode a PNG');
  saveBlob(blob, fileName(title, 'png'));
}

// The deflate is the platform's, and it is optional: a browser without `CompressionStream` gets a valid
// PDF whose image is simply larger, which is a far better outcome than an export that fails.
async function deflate(data: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream === 'undefined') return undefined;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The vector form of what is on screen, with the theme properties resolved into literal values, because an
// SVG carrying `var(--accent)` renders as black in anything that is not this tab. Vega's view offers the
// same three shapes of export - svg, canvas, image URL - and the reason a vector one is worth having is
// that it survives being scaled into a document and being edited afterwards.
export function exportSvg(svg: SVGSVGElement, title: string): void {
  saveBlob(new Blob([withResolvedColours(svg)], { type: 'image/svg+xml' }), fileName(title, 'svg'));
}

// The rows behind the chart, as a file. The table under the card is the same data in HTML; this is the one
// that can be opened, diffed and pasted somewhere, and it is the export a reader who cannot see the
// picture most needs.
export function exportCsv(rows: string, title: string): void {
  saveBlob(new Blob([rows], { type: 'text/csv' }), fileName(title, 'csv'));
}

export async function exportPdf(svg: SVGSVGElement, title: string, scale = 2): Promise<void> {
  const { context, width, height } = await pixelsOf(svg, scale);
  const image = context.getImageData(0, 0, width, height);
  const rgb = new Uint8Array((width * height) * 3);
  for (let index = 0; index < width * height; index += 1) {
    const at = index * 4;
    const to = index * 3;
    rgb[to] = image.data[at] ?? 0;
    rgb[to + 1] = image.data[at + 1] ?? 0;
    rgb[to + 2] = image.data[at + 2] ?? 0;
  }
  const bytes = pdfDocument({ width, height, rgb }, await deflate(rgb));
  saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), fileName(title, 'pdf'));
}
