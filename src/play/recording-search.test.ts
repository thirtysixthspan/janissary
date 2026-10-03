import { describe, expect, it } from 'vitest';
import { findRecording, recordingStem } from './recording-search.js';

const devbox = 'devbox-2026-07-10T18-30-05-123Z.cast';
const later = 'devbox-2026-07-10T21-04-11-004Z.cast';
const other = 'devbox-2-2026-07-10T18-30-05-123Z.cast';

describe('recordingStem', () => {
  it('reads a filename and a label as the same name', () => {
    expect(recordingStem('devbox')).toBe('devbox');
    expect(recordingStem('devbox.cast')).toBe('devbox');
    expect(recordingStem('/recordings/devbox.CAST')).toBe('devbox');
  });

  it('keeps the directory out of it, so a path names what it names', () => {
    expect(recordingStem('.janissary/recordings/devbox-2026-07-10T18-30-05-123Z.cast'))
      .toBe('devbox-2026-07-10T18-30-05-123Z');
  });

  it('reads an empty name as no name', () => {
    expect(recordingStem(' ')).toBe('');
    expect(recordingStem('.cast')).toBe('');
  });
});

describe('findRecording', () => {
  // The whole point of the fallback: a user knows the session's name and not the stamp the recorder
  // appended to it.
  it('answers a session by its label alone', () => {
    expect(findRecording([devbox], 'devbox')).toBe(devbox);
  });

  it('answers the most recent of several recordings of one session', () => {
    expect(findRecording([devbox, later], 'devbox')).toBe(later);
    expect(findRecording([later, devbox], 'devbox')).toBe(later);
  });

  // Two sessions to one ssh destination are `devbox` and `devbox-2`, so a name that is only a prefix
  // of another recording's is no name at all.
  it('does not let one session answer for another', () => {
    expect(findRecording([other], 'devbox')).toBeUndefined();
    expect(findRecording([other, devbox], 'devbox')).toBe(devbox);
    expect(findRecording([devbox, other], 'devbox-2')).toBe(other);
  });

  it('answers a file of exactly the name asked for, which the recorder did not write', () => {
    expect(findRecording(['session.cast'], 'session')).toBe('session.cast');
  });

  it('prefers a recording of the session over a bare file of the same name', () => {
    expect(findRecording(['devbox.cast', devbox], 'devbox')).toBe(devbox);
  });

  it('matches the name literally rather than as a pattern', () => {
    expect(findRecording(['a+b-2026-07-10T18-30-05-123Z.cast'], 'a+b')).toBe('a+b-2026-07-10T18-30-05-123Z.cast');
    expect(findRecording(['axb-2026-07-10T18-30-05-123Z.cast'], 'a.b')).toBeUndefined();
  });

  it('answers undefined for a name the directory does not carry', () => {
    expect(findRecording([devbox], 'claude')).toBeUndefined();
    expect(findRecording([devbox], '')).toBeUndefined();
    expect(findRecording([], 'devbox')).toBeUndefined();
  });
});