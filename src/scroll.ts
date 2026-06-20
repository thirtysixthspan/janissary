export type ScrollAccel = { dir: number; start: number; last: number };

export const initialScrollAccel: ScrollAccel = { dir: 0, start: 0, last: 0 };

export type AccelOptions = {
  // Max gap (ms) between ticks that still counts as continuous scrolling.
  gapMs?: number;
  // The step grows by one every `rampMs` of continuous scrolling.
  rampMs?: number;
  // Upper bound on the step size.
  maxStep?: number;
};

/**
 * Compute the scroll step for a tick in direction `dir` (+1 = back/up, -1 = forward/down)
 * at time `now`, given the previous acceleration state. While the user keeps scrolling in
 * the same direction without pausing, the step accelerates by one line every `rampMs`
 * (default every 2 seconds). Pausing (a gap larger than `gapMs`) or reversing direction
 * resets back to a single line.
 */
export function nextScrollStep(
  state: ScrollAccel,
  dir: number,
  now: number,
  opts: AccelOptions = {},
): { step: number; state: ScrollAccel } {
  const { gapMs = 300, rampMs = 2000, maxStep = 20 } = opts;
  const continuous = state.dir === dir && now - state.last < gapMs;
  const start = continuous ? state.start : now;
  const elapsed = now - start;
  const step = Math.min(1 + Math.floor(elapsed / rampMs), maxStep);
  return { step, state: { dir, start, last: now } };
}
