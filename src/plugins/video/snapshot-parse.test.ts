import { describe, expect, it } from 'vitest';
import {
  isSnapshotArgument, parseSnapshotArgument, parseTimestamp, SNAPSHOT_USAGE,
} from './snapshot-parse.js';

describe('parseTimestamp', () => {
  it('reads plain seconds, with or without a fraction', () => {
    expect(parseTimestamp('12')).toBe(12);
    expect(parseTimestamp('12.5')).toBe(12.5);
    expect(parseTimestamp('0')).toBe(0);
  });

  it('reads minutes and hours as clock fields', () => {
    expect(parseTimestamp('1:05')).toBe(65);
    expect(parseTimestamp('1:02:03.25')).toBe(3723.25);
    expect(parseTimestamp('90:00')).toBe(5400);
  });

  it('refuses anything that is not a clock time', () => {
    for (const text of ['', 'abc', '1:60', '1:00:75', '1:2:3:4', '1.5:00', '12.', '.5', '-3', '1.2.3']) {
      expect(parseTimestamp(text)).toBeUndefined();
    }
  });
});

describe('isSnapshotArgument', () => {
  it('recognises the subcommand word in any case', () => {
    expect(isSnapshotArgument('snapshot clip.mp4 at 3 out.png')).toBe(true);
    expect(isSnapshotArgument('  SNAPSHOT')).toBe(true);
  });

  it('leaves ordinary paths to the opener', () => {
    expect(isSnapshotArgument('clip.mp4')).toBe(false);
    expect(isSnapshotArgument('snapshots/*.mp4')).toBe(false);
  });
});

describe('parseSnapshotArgument', () => {
  it('splits the video, the time, and the destination', () => {
    expect(parseSnapshotArgument('snapshot clip.mp4 at 1:05 frames/one.png')).toEqual({
      video: 'clip.mp4', time: '1:05', seconds: 65, destination: 'frames/one.png',
    });
  });

  it('keeps spaces inside either path', () => {
    expect(parseSnapshotArgument('snapshot my clip.mp4 at 2 my frame.jpg')).toEqual({
      video: 'my clip.mp4', time: '2', seconds: 2, destination: 'my frame.jpg',
    });
  });

  it('skips an `at` that is part of the video name', () => {
    expect(parseSnapshotArgument('snapshot look at this.mp4 at 3.5 out.png')).toEqual({
      video: 'look at this.mp4', time: '3.5', seconds: 3.5, destination: 'out.png',
    });
  });

  it('answers the usage when a part is missing or the time is invalid', () => {
    for (const argument of [
      'snapshot',
      'snapshot clip.mp4',
      'snapshot clip.mp4 at 3',
      'snapshot clip.mp4 3 out.png',
      'snapshot clip.mp4 at soon out.png',
      'snapshot at 3 out.png',
    ]) {
      expect(parseSnapshotArgument(argument)).toEqual({ error: SNAPSHOT_USAGE });
    }
  });
});
