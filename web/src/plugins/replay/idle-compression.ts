import type { CastEvent } from './cast-stream';

// The idle-time rule, as a pure function over a timeline so it can be tested without a clock or a
// terminal. An unattended harness run is mostly silence — a build that takes ten minutes writes
// nothing for ten minutes — and a player that plays every gap in real time makes such a recording
// unwatchable, which is why asciinema's own answer is to compress a gap to a limit rather than to
// speed everything up.
//
// Applied to the whole timeline at once, before playback, so the seek bar and the frame step both
// address the same compressed time the terminal is showing. `off` returns the timeline unchanged
// rather than a copy of it remapped to itself.
export type IdleLimit = 'off' | 1 | 2 | 5 | 10;

export const IDLE_LIMITS: readonly IdleLimit[] = ['off', 1, 2, 5, 10];

export function nextIdleLimit(current: IdleLimit): IdleLimit {
  const index = IDLE_LIMITS.indexOf(current);
  return IDLE_LIMITS[(index + 1) % IDLE_LIMITS.length];
}

export function compressIdle(events: readonly CastEvent[], limit: IdleLimit): CastEvent[] {
  if (limit === 'off') return [...events];
  // Each gap is shortened to the limit measured against the timeline *as written* and laid onto the
  // timeline as compressed. Both originals are needed: measuring a gap against an already-compressed
  // neighbour would shorten a one-second gap that followed a ten-minute one, and measuring it against
  // the written neighbour alone would leave the whole timeline sliding later instead of compressing.
  const compressed: CastEvent[] = [];
  let at = 0;
  let written = 0;
  for (const [index, event] of events.entries()) {
    const time = index === 0 ? event.time : at + Math.min(event.time - written, limit);
    compressed.push(time === event.time ? event : { ...event, time });
    at = time;
    written = event.time;
  }
  return compressed;
}

export function durationOf(events: readonly CastEvent[]): number {
  return events.length === 0 ? 0 : events.at(-1)!.time;
}

// The events a terminal has to be fed to show the timeline at `time`, from the start. A backward
// seek resets and replays: a terminal is a state machine, so there is no way to arrive at an earlier
// frame other than having run the bytes before it.
export function eventsUpTo(events: readonly CastEvent[], time: number): CastEvent[] {
  return events.filter((event) => event.time <= time);
}

// The event a step from `time` lands on. A step moves one recorded event, not one second, because an
// event is what the recording actually captured — and it steps *from the frame on screen*, so going
// back from a position sitting exactly on an event lands on the one before it rather than where it
// already is. Both ends clamp: there is nothing before the first event or after the last.
export function stepIndex(events: readonly CastEvent[], time: number, direction: 1 | -1): number {
  if (events.length === 0) return 0;
  const last = events.length - 1;
  if (direction === 1) {
    const next = events.findIndex((event) => event.time > time);
    return next === -1 ? last : next;
  }
  for (let index = last; index >= 0; index--) {
    if (events[index].time < time) return index;
  }
  return 0;
}
