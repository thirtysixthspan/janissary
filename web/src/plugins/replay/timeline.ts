import type { CastEvent } from './cast-stream';

// The timeline's own arithmetic: how long it is, and which of its events a given moment lands on.
// Pure functions over the events, so they can be tested without a clock or a terminal.

// The length of a recording as written: the moment its last event happened. A recording with no events
// has no length, which is 0 rather than an error — the player shows the reason on its own line.
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