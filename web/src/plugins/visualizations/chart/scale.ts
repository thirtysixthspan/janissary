// The two axes a chart needs, as numbers. Pure, and the only place in the renderer that divides.

export type Box = { left: number; top: number; width: number; height: number };

export type Linear = {
  // `at` maps a value to a pixel offset from the top of the box, and is already inverted: a larger
  // value is a smaller offset, because SVG's y grows downwards.
  at(value: number): number;
  ticks: number[];
  min: number;
  max: number;
};

export type Band = {
  // `at` is the left edge of a band, and `width` how wide it is. Bands are separated by `gap` so a
  // grouped chart's bars are distinguishable from each other and not only from the axis.
  at(band: number): number;
  width: number;
  gap: number;
  count: number;
};

const TICK_TARGET = 5;

// "Nice" tick values are round numbers a reader recognises, and getting them is arithmetic rather than
// taste: the step is a power of ten scaled to the span, and the ticks are whole multiples of it.
function niceStep(span: number, target: number): number {
  // A span of zero has no step to scale, and `log10(0)` is not a number. Any positive step divides the
  // single value exactly, so the one-value case is a step of one rather than a scale of NaN.
  const rough = span <= 0 ? 1 : span / Math.max(target, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    if (rough <= magnitude * multiple) return magnitude * multiple;
  }
  return magnitude * 10;
}

// The domain is widened outward to whole steps so the first and last tick sit on the plot's edges
// rather than inside it, which is what makes an axis read as a scale instead of a set of marks.
export function linear(box: Box, extent: { min: number; max: number }): Linear {
  const step = niceStep(extent.max - extent.min, TICK_TARGET);
  const min = Math.floor(extent.min / step) * step;
  // A domain that rounds to a single step is widened to two, so the division below always has a
  // non-zero span to work with however the extent was produced.
  const top = Math.ceil(extent.max / step) * step;
  const max = top === min ? min + step : top;
  const span = max - min;
  const ticks: number[] = [];
  // The count is bounded by construction rather than trusted, because a pathological extent could
  // otherwise ask for a very large array.
  for (let index = 0; index <= TICK_TARGET * 2 + 2; index += 1) {
    const value = min + (step * index);
    if (value > max + step / 1e6) break;
    ticks.push(Number(value.toFixed(10)));
  }
  return {
    at: (value) => box.top + box.height - ((value - min) / span) * box.height,
    ticks,
    min,
    max,
  };
}

export function band(box: Box, count: number, gapRatio = 0.2): Band {
  const slots = Math.max(count, 1);
  const slot = box.width / slots;
  const gap = slot * Math.min(Math.max(gapRatio, 0), 0.9);
  return {
    at: (index) => box.left + (slot * index) + (gap / 2),
    width: Math.max(slot - gap, 1),
    gap,
    count: slots,
  };
}

// Where one series sits inside its band, so several series share the slot without overlapping.
export function seriesOffset(seriesIndex: number, seriesCount: number, slotWidth: number): { left: number; width: number } {
  const share = slotWidth / Math.max(seriesCount, 1);
  return { left: share * seriesIndex, width: Math.max(share * 0.9, 1) };
}
