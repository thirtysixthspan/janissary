import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectResumeLimit,
  resumeInstant,
  supportsHarnessAutoResume,
  autoResumeHarnessNames,
  describeAutoResumeHarnesses,
  HarnessAutoResumer,
  RESUME_MARGIN_MS,
  RESUME_PROMPT,
  RESUME_ENTRY_ID,
} from './auto-resume.js';
import type { ScreenCapture } from './screen.js';

const BANNER = `■ You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 1:20 PM.`;

// The banner as codex actually paints it: it wraps mid-sentence across two rows.
const WRAPPED = ['■ You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to', 'purchase more credits or try again at 1:20 PM.'].join('\n');

const screen = (text: string): ScreenCapture => ({ text, capturedAt: 1_700_000_000_000 });

describe('detectResumeLimit', () => {
  it('reads a clock-time reset', () => {
    expect(detectResumeLimit(BANNER, 'codex')).toEqual({ kind: 'at', time: { hour: 13, minute: 20 } });
  });

  it('reads the same banner wrapped across two rows', () => {
    expect(detectResumeLimit(WRAPPED, 'codex')).toEqual({ kind: 'at', time: { hour: 13, minute: 20 } });
  });

  it('matches a straight apostrophe as well as a typographic one', () => {
    const straight = BANNER.replace('You’ve', "You've");
    expect(detectResumeLimit(straight, 'codex')).toEqual({ kind: 'at', time: { hour: 13, minute: 20 } });
  });

  it('reads a 24-hour clock and an hour-only time', () => {
    expect(detectResumeLimit(limit('at 13:20'), 'codex')).toEqual({ kind: 'at', time: { hour: 13, minute: 20 } });
    expect(detectResumeLimit(limit('at 2pm'), 'codex')).toEqual({ kind: 'at', time: { hour: 14, minute: 0 } });
  });

  it('reads a dated reset, ignoring the year', () => {
    expect(detectResumeLimit(limit('at Jul 8th, 2026 10:59 AM'), 'codex')).toEqual({
      kind: 'on', month: 6, day: 8, time: { hour: 10, minute: 59 },
    });
    expect(detectResumeLimit(limit('at Jul 8 at 10:59am'), 'codex')).toEqual({
      kind: 'on', month: 6, day: 8, time: { hour: 10, minute: 59 },
    });
  });

  it('reads a relative reset, summing its tokens', () => {
    expect(detectResumeLimit(limit('in 4 hours 23 minutes'), 'codex')).toEqual({
      kind: 'in', ms: 4 * 3_600_000 + 23 * 60_000,
    });
    expect(detectResumeLimit(limit('in 90m'), 'codex')).toEqual({ kind: 'in', ms: 90 * 60_000 });
  });

  it('refuses a duration past the 24-hour ceiling', () => {
    expect(detectResumeLimit(limit('in 4 days 23 hours'), 'codex')).toBeUndefined();
    expect(detectResumeLimit(limit('in 49 hours'), 'codex')).toBeUndefined();
  });

  it('refuses a date with no time, and a clause it cannot read', () => {
    expect(detectResumeLimit(limit('at Jul 8th'), 'codex')).toBeUndefined();
    expect(detectResumeLimit(limit('at tomorrow'), 'codex')).toBeUndefined();
  });

  it('refuses the limit wording with no reset clause', () => {
    expect(detectResumeLimit('You’ve hit your usage limit. Try again later.', 'codex')).toBeUndefined();
  });

  it('refuses a limit message the harness has scrolled past', () => {
    const scrolled = [WRAPPED, 'Anything else?', '> working on the next step'].join('\n');
    expect(detectResumeLimit(scrolled, 'codex')).toBeUndefined();
  });

  it('refuses a harness with no detector', () => {
    expect(detectResumeLimit(BANNER, 'claude')).toBeUndefined();
    expect(supportsHarnessAutoResume('claude')).toBe(false);
    expect(supportsHarnessAutoResume('codex')).toBe(true);
    expect(autoResumeHarnessNames()).toEqual(['codex']);
    expect(describeAutoResumeHarnesses()).toBe('codex');
  });
});

describe('resumeInstant', () => {
  const now = new Date('2026-10-03T12:00:00');

  it('adds the margin to a clock time later today', () => {
    expect(resumeInstant({ kind: 'at', time: { hour: 13, minute: 20 } }, now))
      .toBe(new Date('2026-10-03T13:21:00').getTime());
  });

  it('resumes a minute out when the stated clock time has already gone', () => {
    const instant = resumeInstant({ kind: 'at', time: { hour: 7, minute: 36 } }, new Date('2026-10-03T07:36:15'));
    expect(instant).toBe(new Date('2026-10-03T07:36:15').getTime() + RESUME_MARGIN_MS);
  });

  it('resumes a minute out rather than parking until tomorrow', () => {
    const instant = resumeInstant({ kind: 'at', time: { hour: 0, minute: 5 } }, new Date('2026-10-03T23:59:00'));
    expect(instant).toBe(new Date('2026-10-03T23:59:00').getTime() + RESUME_MARGIN_MS);
  });

  it('takes a dated reset on its own date', () => {
    expect(resumeInstant({ kind: 'on', month: 9, day: 8, time: { hour: 10, minute: 59 } }, now))
      .toBe(new Date('2026-10-08T11:00:00').getTime());
  });

  it('resumes at once for a dated reset already past, rather than next year', () => {
    expect(resumeInstant({ kind: 'on', month: 6, day: 8, time: { hour: 10, minute: 59 } }, now))
      .toBe(now.getTime() + RESUME_MARGIN_MS);
  });

  it('adds the margin to a duration from now', () => {
    expect(resumeInstant({ kind: 'in', ms: 3_600_000 }, now)).toBe(now.getTime() + 3_600_000 + RESUME_MARGIN_MS);
  });
});

// A limit banner whose reset is `clause` — the part after `try again`.
function limit(clause: string): string {
  return `■ You’ve hit your usage limit. Upgrade to Pro, or try again ${clause}.`;
}

function makeResumer(overrides: Partial<{ scheduledAt: number[]; delivered: number; cancelled: number }> = {}) {
  const scheduledAt: number[] = overrides.scheduledAt ?? [];
  const state = { delivered: 0, cancelled: 0 };
  const resumer = new HarnessAutoResumer({
    harnessName: 'codex',
    schedule: (resumeAt) => { scheduledAt.push(resumeAt); return RESUME_ENTRY_ID; },
    cancel: () => { state.cancelled++; },
    onScheduled: () => {},
    onSettled: () => { state.delivered++; },
  });
  return { resumer, scheduledAt, state };
}

// The observer turns a stated reset into an instant against `Date.now()`, so every case here runs
// on a frozen clock: a suite that read the wall clock passed at noon and failed at 19:00, when two
// clock-time resets in one test both clamped to `now + margin` and stopped looking like two blockages.
describe('HarnessAutoResumer', () => {
  const pinned = new Date('2026-10-03T12:00:00');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(pinned);
  });

  afterEach(() => { vi.useRealTimers(); });

  it('schedules one resume for a recognized blockage and reports it', () => {
    const { resumer, scheduledAt } = makeResumer();
    resumer.onCapture(screen(BANNER));
    expect(scheduledAt).toHaveLength(1);
    expect(resumer.isParked).toBe(true);
  });

  it('schedules nothing for a screen redrawn unchanged', () => {
    const { resumer, scheduledAt } = makeResumer();
    resumer.onCapture(screen(BANNER));
    resumer.onCapture(screen(BANNER));
    expect(scheduledAt).toHaveLength(1);
  });

  it('does nothing at all for a harness with no detector', () => {
    const { resumer, scheduledAt } = makeResumer();
    resumer.onCapture(screen(BANNER));
    expect(scheduledAt).toHaveLength(1);
    const claude = new HarnessAutoResumer({
      harnessName: 'claude',
      schedule: () => RESUME_ENTRY_ID,
      cancel: () => {},
      onScheduled: () => {},
      onSettled: () => {},
    });
    claude.onCapture(screen(BANNER));
    expect(claude.isParked).toBe(false);
  });

  // Relative resets, so the two instants differ by the duration rather than by what time of day
  // the suite happens to run at.
  it('schedules again for a new blockage on a changed screen', () => {
    const { resumer, scheduledAt } = makeResumer();
    resumer.onCapture(screen(limit('in 4 hours')));
    resumer.onCapture(screen(limit('in 5 hours')));
    expect(scheduledAt).toEqual([
      pinned.getTime() + 4 * 3_600_000 + RESUME_MARGIN_MS,
      pinned.getTime() + 5 * 3_600_000 + RESUME_MARGIN_MS,
    ]);
  });

  it('cancels a pending resume and re-arms when the blockage clears', () => {
    const { resumer, scheduledAt, state } = makeResumer();
    resumer.onCapture(screen(limit('in 4 hours')));
    resumer.onCapture(screen('Anything else?'));
    expect(state.cancelled).toBe(1);
    expect(resumer.isParked).toBe(false);
    // The clock moves on before the blockage returns, as it would between two screen captures.
    vi.advanceTimersByTime(60_000);
    resumer.onCapture(screen(limit('in 4 hours')));
    expect(scheduledAt).toHaveLength(2);
  });

  it('does not cancel when no resume was ever scheduled', () => {
    const { resumer, state } = makeResumer();
    resumer.onCapture(screen('Anything else?'));
    expect(state.cancelled).toBe(0);
  });

  it('reports delivery once, and stops being parked only when the screen changes', () => {
    const { resumer, state } = makeResumer();
    resumer.onCapture(screen(BANNER));
    resumer.onSettled();
    resumer.onSettled();
    expect(state.delivered).toBe(1);
    expect(resumer.isParked).toBe(true);
    resumer.onCapture(screen('Anything else?'));
    expect(resumer.isParked).toBe(false);
  });

  it('reports delivery for a tab that scheduled nothing', () => {
    const { resumer, state } = makeResumer();
    resumer.onSettled();
    expect(state.delivered).toBe(0);
  });

  it('schedules the prompt and the id the plan fixes', () => {
    expect(RESUME_PROMPT).toBe('resume the task you were working on.');
    expect(RESUME_ENTRY_ID).toBe('auto-resume');
  });
});