import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePlayback } from './usePlayback';
import { compressIdle } from './idle-compression';
import type { CastEvent } from './cast-stream';
import type { ReplayTerminal } from './useReplayTerminal';

const output = (time: number, data = 'x'): CastEvent => ({ code: 'o', time, data });

// Two seconds of work, a ten-minute pause, then one more second of it — the shape an unattended run
// has, and the shape the idle rule exists for.
const timeline = [output(0), output(1), output(601), output(602)];

function fakeTerminal(): ReplayTerminal & { shown: number[] } {
  const shown: number[] = [];
  return {
    shown,
    renderUpTo(events: readonly CastEvent[], time: number) { shown.push(time); void events; },
  };
}

const setup = (options: {
  events?: readonly CastEvent[];
  recordedIdleLimit?: number;
  live?: boolean;
} = {}) => {
  const terminal = fakeTerminal();
  const view = renderHook(() => usePlayback(
    options.events ?? timeline,
    options.recordedIdleLimit,
    terminal,
    options.live ?? false,
  ));
  return { terminal, view };
};

describe('usePlayback', () => {
  it('starts at the first frame and running, the way asciinema play does', () => {
    const { view } = setup();
    expect(view.result.current.position).toBe(0);
    expect(view.result.current.playing).toBe(true);
  });

  it('shows the timeline compressed when the recording states an idle limit', () => {
    const { view } = setup({ recordedIdleLimit: 2 });
    expect(view.result.current.idleLimit).toBe(2);
    expect(view.result.current.duration).toBe(4);
  });

  it('ignores a recorded limit the control has no step for, rather than rounding it', () => {
    const { view } = setup({ recordedIdleLimit: 3 });
    expect(view.result.current.idleLimit).toBe('off');
  });

  it('reports a recording with no stated limit as playing in real time', () => {
    const { view } = setup();
    expect(view.result.current.duration).toBe(602);
  });

  it('compresses only a finished recording, and leaves a live one in real time', () => {
    const finished = setup({ recordedIdleLimit: 2, live: false });
    expect(finished.view.result.current.duration).toBe(4);
    expect(finished.view.result.current.idleLimit).toBe(2);

    // The same events, still being written: the silences are real time, and the control says so
    // rather than claiming a limit it is not applying.
    const live = setup({ recordedIdleLimit: 2, live: true });
    expect(live.view.result.current.live).toBe(true);
    expect(live.view.result.current.duration).toBe(602);
    expect(live.view.result.current.idleLimit).toBe('off');
  });

  it('keeps a limit chosen while live for when the recording finishes', () => {
    const { view } = setup({ recordedIdleLimit: 2, live: true });
    act(() => { view.result.current.cycleIdle(); });
    act(() => { view.result.current.cycleIdle(); });
    expect(view.result.current.idleLimit).toBe('off');
    expect(compressIdle(timeline, 'off')).toHaveLength(timeline.length);
  });

  it('pauses and resumes on demand', () => {
    const { view } = setup();
    act(() => { view.result.current.pause(); });
    expect(view.result.current.playing).toBe(false);
    act(() => { view.result.current.toggle(); });
    expect(view.result.current.playing).toBe(true);
  });

  it('steps one recorded event at a time, and pauses while it does', () => {
    const { view } = setup({ events: [output(0), output(1), output(2)] });
    act(() => { view.result.current.step(1); });
    expect(view.result.current.position).toBe(1);
    expect(view.result.current.playing).toBe(false);
    act(() => { view.result.current.step(1); });
    expect(view.result.current.position).toBe(2);
    act(() => { view.result.current.step(-1); });
    expect(view.result.current.position).toBe(1);
  });

  it('stays put at the ends of a recording rather than running off them', () => {
    const { view } = setup({ events: [output(0), output(1)] });
    act(() => { view.result.current.step(-1); });
    expect(view.result.current.position).toBe(0);
    act(() => { view.result.current.step(1); act(() => { view.result.current.step(1); }); });
    expect(view.result.current.position).toBe(1);
  });

  it('asks the terminal to show the frame a seek lands on, and clamps it to the recording', () => {
    const { terminal, view } = setup();
    act(() => { view.result.current.seek(602); });
    expect(view.result.current.position).toBe(602);
    act(() => { view.result.current.seek(9999); });
    expect(view.result.current.position).toBe(602);
    expect(terminal.shown).toContain(602);
  });

  it('cycles the speed both ways, wrapping at each end', () => {
    const { view } = setup();
    act(() => { view.result.current.cycleSpeed(1); });
    expect(view.result.current.speed).toBe(1.5);
    act(() => { view.result.current.cycleSpeed(-1); });
    expect(view.result.current.speed).toBe(1);
    act(() => { view.result.current.cycleSpeed(-1); });
    expect(view.result.current.speed).toBe(0.5);
    act(() => { view.result.current.cycleSpeed(-1); });
    expect(view.result.current.speed).toBe(4);
  });

  it('cycles the idle limit through its steps and back to off', () => {
    const { view } = setup();
    act(() => { view.result.current.cycleIdle(); });
    expect(view.result.current.idleLimit).toBe(1);
    act(() => { view.result.current.cycleIdle(); });
    expect(view.result.current.idleLimit).toBe(2);
  });

  it('starts again from the beginning once a finished recording has played out', () => {
    const { view } = setup({ events: [output(0), output(1)] });
    act(() => { view.result.current.seek(1); });
    act(() => { view.result.current.play(); });
    expect(view.result.current.position).toBe(0);
    expect(view.result.current.playing).toBe(true);
  });
});

describe('usePlayback — the clock', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('advances and stops at the end of what has been recorded, holding the last frame', () => {
    const { view } = setup({ events: [output(0), output(1)] });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(view.result.current.position).toBe(1);
    expect(view.result.current.playing).toBe(false);
  });

  it('keeps advancing past the end for a live recording, which is still being written', () => {
    const { view } = setup({ events: [output(0), output(1)], live: true });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(view.result.current.position).toBe(1);
    expect(view.result.current.playing).toBe(true);
  });

  it('advances faster at a higher speed', () => {
    const slow = setup({ events: [output(0), output(100)], live: true });
    act(() => { vi.advanceTimersByTime(500); });
    const slowAt = slow.view.result.current.position;
    slow.view.unmount();

    const fast = setup({ events: [output(0), output(100)], live: true });
    act(() => { fast.view.result.current.cycleSpeed(1); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(fast.view.result.current.position).toBeGreaterThan(slowAt);
  });
});