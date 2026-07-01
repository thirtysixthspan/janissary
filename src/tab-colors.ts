export const dotColors = [
  '#5b9cff', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff8a5c', '#a66cff', '#ff6f91', '#00d2d3', '#f368e0',
  '#ff9f43', '#54a0ff', '#5f27cd', '#01a3a4', '#ee5a24',
];

const COLOR_MIN_DIST = 110;

function hexToRgb(hex?: string): [number, number, number] | undefined {
  if (!hex) return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const rmean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

function nearestUsedDistance(color: string, used: [number, number, number][]): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;
  if (used.length === 0) return Infinity;
  return Math.min(...used.map((u) => colorDistance(rgb, u)));
}

export function distinctColor(used: Iterable<string>, preferred?: string): string {
  const usedRgb = [...used].map((c) => hexToRgb(c)).filter((c): c is [number, number, number] => c !== undefined);
  if (preferred && nearestUsedDistance(preferred, usedRgb) >= COLOR_MIN_DIST) return preferred;
  let best = dotColors[0];
  let bestDist = -1;
  for (const c of dotColors) {
    const d = nearestUsedDistance(c, usedRgb);
    if (d > bestDist) { bestDist = d; best = c; }
  }
  return best;
}
