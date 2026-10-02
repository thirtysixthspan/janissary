import { describe, expect, it } from 'vitest';
import type { CastEvent } from './cast-stream';
import { compressIdle, durationOf, eventsUpTo, nextIdleLimit, stepIndex } from './idle-compression';

const output = (time: number, data = 'x'): CastEvent => ({ code: 'o', time, data });

describe('compressIdle', () => {
  // An unattended run is mostly silence: this timeline is one minute of work with a ten-minute pause
  // in the middle of it, which is the shape the rule exists for.
  const timeline = [output(0), output(1), output(601), output(602)];

  it('brings every gap longer than the limit down to it, and leaves shorter ones alone', () => {
    expect(compressIdle(timeline, 2).map((event) => event.time)).toEqual([0, 1, 3, 4]);
  });

  it('reports the compressed length, which is what the seek bar is addressed in', () => {
    expect(durationOf(compressIdle(timeline, 2))).toBe(4);
    // A limit of ten still cannot reach past the last event, which is eleven seconds in.
    expect(durationOf(compressIdle(timeline, 10))).toBe(12);
  });

  it('plays a recording in real time when the limit is off', () => {
    expect(compressIdle(timeline, 'off').map((event) => event.time)).toEqual([0, 1, 601, 602]);
    expect(compressIdle(timeline, 'off')).not.toBe(timeline);
  });

  it('cycles through the limits a control offers, and wraps at the end', () => {
    expect(nextIdleLimit('off')).toBe(1);
    expect(nextIdleLimit(10)).toBe('off');
  });
});

describe('eventsUpTo', () => {
  it('is everything at or before a time, which is what a terminal must be fed to show it', () => {
    const timeline = [output(0), output(1), output(2)];
    expect(eventsUpTo(timeline, 1)).toHaveLength(2);
    expect(eventsUpTo(timeline, 0.5)).toHaveLength(1);
    expect(eventsUpTo(timeline, 9)).toHaveLength(3);
  });
});

describe('stepIndex', () => {
  const timeline = [output(0), output(1), output(2), output(3)];

  it('moves one recorded event at a time, not one second', () => {
    expect(timeline[stepIndex(timeline, 0, 1)].time).toBe(1);
    expect(timeline[stepIndex(timeline, 1, -1)].time).toBe(0);
  });

  it('stays put at either end rather than running off it', () => {
    expect(stepIndex(timeline, 0, -1)).toBe(0);
    expect(stepIndex(timeline, 3, 1)).toBe(3);
  });

  it('answers zero for an empty timeline', () => {
    expect(stepIndex([], 0, 1)).toBe(0);
  });
});
