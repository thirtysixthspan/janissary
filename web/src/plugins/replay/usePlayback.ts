import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CastEvent } from './cast-stream';
import { durationOf, stepIndex } from './timeline';
import type { ReplayTerminal } from './useReplayTerminal';

// The transport. Playback advances a position along a recording's timeline and asks the terminal to
// show it; the terminal holds the only thing that can reconstruct a frame — the bytes — so this hook
// never touches terminal state directly, and the tab wires the two together once.
//
// A recording plays at the timing it was recorded at. Its silences are what the session did, and
// compressing them would make a run that waited ten minutes indistinguishable from one that thought
// for ten minutes, which is the one thing the recording is the record of.
export type Playback = {
  position: number;
  duration: number;
  playing: boolean;
  speed: number;
  live: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  step(direction: 1 | -1): void;
  seek(time: number): void;
  cycleSpeed(direction: 1 | -1): void;
};

export const SPEEDS: readonly number[] = [0.5, 1, 1.5, 2, 3, 4];

const TICK_MS = 50;

export function usePlayback(
  events: readonly CastEvent[],
  terminal: ReplayTerminal,
  live: boolean,
): Playback {
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  // The clock reads the position it is advancing, so it cannot close over the one it was installed
  // with; the mirror is refreshed every render and only ever written here.
  const clock = useRef({ position: 0, speed: 1 });
  clock.current.speed = speed;
  const duration = durationOf(events);

  const show = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(duration, time));
    clock.current.position = clamped;
    setPosition(clamped);
    terminal.renderUpTo(events, clamped);
  }, [duration, terminal, events]);

  useEffect(() => { show(Math.min(clock.current.position, duration)); }, [duration, show]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const end = events.length === 0 ? clock.current.position : duration;
      const next = Math.min(end, clock.current.position + clock.current.speed * (TICK_MS / 1000));
      clock.current.position = next;
      setPosition(next);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, events, duration]);

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
    live,
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    step: (direction) => {
      setPlaying(false);
      show(events[stepIndex(events, clock.current.position, direction)]?.time
        ?? clock.current.position);
    },
    seek: (time) => show(time),
    cycleSpeed: (direction) => setSpeed((current) => {
      const next = SPEEDS.indexOf(current) + direction;
      return SPEEDS[(next + SPEEDS.length) % SPEEDS.length];
    }),
  }), [position, duration, playing, speed, live, play, pause, show, events]);
}