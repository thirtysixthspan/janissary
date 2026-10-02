import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CastEvent } from './cast-stream';
import {
  compressIdle, durationOf, nextIdleLimit, stepIndex, type IdleLimit,
} from './idle-compression';
import type { ReplayTerminal } from './useReplayTerminal';

// The transport. Playback advances a position along a timeline and asks the terminal to show it; the
// terminal holds the only thing that can reconstruct a frame — the bytes — so this hook never touches
// terminal state directly, and the tab wires the two together once.
//
// Three rules live here rather than in the tab, because each is a rule and not markup: the clock, the
// compressed timeline, and what reaching the end of it means.
export type Playback = {
  position: number;
  duration: number;
  playing: boolean;
  speed: number;
  idleLimit: IdleLimit;
  live: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  step(direction: 1 | -1): void;
  seek(time: number): void;
  cycleIdle(): void;
  cycleSpeed(direction: 1 | -1): void;
};

export const SPEEDS: readonly number[] = [0.5, 1, 1.5, 2, 3, 4];

const TICK_MS = 50;

// The recorded limits a control can name, so a recording whose limit is none of them is reported as
// having none rather than silently rounded to the nearest.
const SELECTABLE = new Set([1, 2, 5, 10]);

export function usePlayback(
  events: readonly CastEvent[],
  recordedIdleLimit: number | undefined,
  terminal: ReplayTerminal,
  live: boolean,
): Playback {
  const [idleLimit, setIdleLimit] = useState<IdleLimit>('off');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  // The clock reads the position it is advancing, so it cannot close over the one it was installed
  // with; the mirror is refreshed every render and only ever written here.
  const clock = useRef({ position: 0, speed: 1 });
  clock.current.speed = speed;
  // A live recording plays in real time however long its silences are; a finished one is compressed,
  // which is what makes an hour of recorded silence watchable. The stored limit is the user's choice
  // and is kept through the live period rather than discarded, so the limit the recording stated
  // applies the moment the session is over without anything being set again.
  const applied: IdleLimit = live ? 'off' : idleLimit;
  const timeline = useMemo(() => compressIdle(events, applied), [events, applied]);
  const duration = durationOf(timeline);

  // The recorded limit is the default as soon as the recording states one, and it stays the default
  // however the control is cycled afterwards: a viewing choice, not a preference to keep.
  useEffect(() => {
    setIdleLimit(recordedIdleLimit !== undefined && SELECTABLE.has(recordedIdleLimit)
      ? recordedIdleLimit as IdleLimit
      : 'off');
  }, [recordedIdleLimit]);

  const show = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(duration, time));
    clock.current.position = clamped;
    setPosition(clamped);
    terminal.renderUpTo(timeline, clamped);
  }, [duration, terminal, timeline]);

  // Compression moves every timestamp after the first gap, so a position carried over from the
  // uncompressed timeline would mean something else on screen.
  useEffect(() => { show(Math.min(clock.current.position, duration)); }, [duration, timeline, show]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const end = timeline.length === 0 ? clock.current.position : duration;
      const next = Math.min(end, clock.current.position + clock.current.speed * (TICK_MS / 1000));
      clock.current.position = next;
      setPosition(next);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, timeline, duration]);

  // The end of a finished recording is the end of the replay; the end of a live one is where the
  // session currently is, so the clock holds there and the timeline extends underneath it.
  useEffect(() => {
    if (!live && duration > 0 && position >= duration) setPlaying(false);
  }, [position, duration, live]);

  const pause = useCallback(() => setPlaying(false), []);
  const play = useCallback(() => {
    // From the start again once the last frame of a finished recording is up, rather than sitting at
    // the end looking stuck.
    if (!live && duration > 0 && position >= duration) show(0);
    setPlaying(true);
  }, [live, duration, position, show]);

  return useMemo<Playback>(() => ({
    position,
    duration,
    playing,
    speed,
    idleLimit: applied,
    live,
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    step: (direction) => {
      setPlaying(false);
      show(timeline[stepIndex(timeline, clock.current.position, direction)]?.time
        ?? clock.current.position);
    },
    seek: (time) => show(time),
    cycleIdle: () => setIdleLimit((current) => nextIdleLimit(current)),
    cycleSpeed: (direction) => setSpeed((current) => {
      const next = SPEEDS.indexOf(current) + direction;
      return SPEEDS[(next + SPEEDS.length) % SPEEDS.length];
    }),
  }), [position, duration, playing, speed, applied, live, play, pause, show, timeline]);
}
